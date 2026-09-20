import { describe, expect, it } from "vitest";
import { ComputerTemplateLifecycle, templateFingerprint, type ComputerTemplateProvider, type Preparation, type TemplateKey, type TemplateStore } from "./computer-template-lifecycle.ts";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const key: TemplateKey = { scope: "preview-owner", fingerprint: "browser-v1", provider: "fake" };

class Store implements TemplateStore {
  rows: Preparation[] = [];
  waiters = new Map<string, { key: TemplateKey; until: number }>();
  events: string[] = [];
  tokens = new Map<string, string>();
  async current(k: TemplateKey) { return this.rows.findLast(r => r.scope === k.scope && r.fingerprint === k.fingerprint) ?? null; }
  async claim(k: TemplateKey, deadline: number) {
    if (this.rows.some(r => r.scope === k.scope && r.fingerprint === k.fingerprint && (["READY", "PREPARING", "CLEANING"].includes(r.state) || r.retryAfter > Date.now()))) return null;
    const row: Preparation = { ...k, id: String(this.rows.length), state: "PREPARING", deadline, templateId: null, failure: null, retryAfter: 0 };
    this.rows.push(row); return { ...row };
  }
  async ready(id: string, templateId: string) {
    const row = this.rows.find(r => r.id === id)!;
    if (row.state !== "PREPARING" || row.deadline <= Date.now() || !(await this.hasWaiters(row))) return false;
    row.state = "READY"; row.templateId = templateId; return true;
  }
  async cleaning(id: string, failure: Preparation["failure"]) {
    const row = this.rows.find(r => r.id === id)!;
    if (row.state === "CLEANING" && row.deadline > Date.now()) return null;
    if (row.state === "READY" && failure !== "invalid_template") return null;
    row.state = "CLEANING"; row.failure = failure; row.deadline = Date.now() + 20;
    const token = `${id}-${Math.random()}`; this.tokens.set(id, token); return token;
  }
  async cleaned(id: string, token: string, success: boolean, retryAfter: number) {
    if (this.tokens.get(id) !== token) return;
    const row = this.rows.find(r => r.id === id)!;
    row.state = success ? "CLEANED" : "CLEANING"; row.retryAfter = retryAfter; row.deadline = Date.now() + 20;
  }
  async enter(k: TemplateKey, id: string, until: number) { this.waiters.set(id, { key: k, until }); }
  async identifySnapshot(id: string, token: string, templateId: string) { if (this.tokens.get(id) === token) this.rows.find(r => r.id === id)!.templateId = templateId; }
  async leave(id: string) { this.waiters.delete(id); }
  async hasWaiters(k: TemplateKey) { return [...this.waiters.values()].some(w => w.key.scope === k.scope && w.key.fingerprint === k.fingerprint && w.until > Date.now()); }
  async recoverable(scope: string, limit: number) { return this.rows.filter(r => r.scope === scope && ["PREPARING", "CLEANING", "CLEANED"].includes(r.state) && r.deadline <= Date.now()).slice(0, limit); }
  async event(_id: string, name: string) { this.events.push(name); }
}
class Provider implements ComputerTemplateProvider {
  id = "fake"; preparations = 0; cleanups = 0; milliseconds = 12;
  fail = false; stuck = false; cleanupFails = false; stale = false;
  resources = new Map<string, string>();
  async inspect(row: Preparation) {
    return this.resources.has(row.id) ? { state: this.stale ? "STALE" as const : "READY" as const, fingerprint: row.fingerprint, templateId: this.resources.get(row.id) } : { state: "MISSING" as const };
  }
  async prepare(row: Preparation) {
    this.preparations++; this.resources.set(row.id, `snapshot-${row.id}`);
    if (this.stuck) return new Promise<{ templateId: string }>(() => {});
    await delay(this.milliseconds);
    if (this.fail) throw new Error("secret-provider-response");
    this.stale = false;
    return { templateId: this.resources.get(row.id)! };
  }
  async cleanup(row: Preparation) { this.cleanups++; if (this.cleanupFails) return false; this.resources.delete(row.id); return true; }
  classify() { return "bootstrap" as const; }
}
function fixture() {
  const store = new Store(), provider = new Provider();
  const lifecycle = new ComputerTemplateLifecycle(store, provider, { prepareMs: 100, waitMs: 180, cleanupMs: 10, pollMs: 2, retryMs: 15 });
  return { store, provider, lifecycle };
}

describe("Computer template lifecycle without external resources", () => {
  it("converges ten cold requests and explicit prewarm on one verified preparation", async () => {
    const { lifecycle, provider, store } = fixture();
    expect(await lifecycle.resolve(key)).toBe("COLD");
    const rows = await Promise.all(Array.from({ length: 10 }, () => lifecycle.ensure(key)));
    expect(new Set(rows.map(r => r.id)).size).toBe(1);
    expect(provider.preparations).toBe(1);
    expect((await lifecycle.ensure(key)).state).toBe("READY");
    expect(provider.preparations).toBe(1);
    expect(await lifecycle.resolve(key)).toBe("READY");
    expect(store.waiters.size).toBe(0);
    expect(store.events).toContain("template.prepare.ready");
  });
  it("joins work owned by another lifecycle instance", async () => {
    const { lifecycle, provider, store } = fixture();
    const other = new ComputerTemplateLifecycle(store, provider, lifecycle.options);
    const first = lifecycle.ensure(key); await delay(4);
    expect(await other.resolve(key)).toBe("PREPARING");
    const [a, b] = await Promise.all([first, other.ensure(key)]);
    expect(a.id).toBe(b.id); expect(provider.preparations).toBe(1);
  });
  it("cleans failure, hides provider bodies, and permits a bounded retry", async () => {
    const { lifecycle, provider } = fixture(); provider.fail = true;
    await expect(lifecycle.ensure(key)).rejects.toMatchObject({ code: "bootstrap" });
    expect(provider.resources.size).toBe(0);
    expect(await lifecycle.resolve(key)).toBe("UNAVAILABLE");
    await expect(lifecycle.ensure(key)).rejects.not.toThrow("secret-provider-response");
    provider.fail = false; await delay(20);
    expect((await lifecycle.ensure(key)).state).toBe("READY"); expect(provider.preparations).toBe(2);
  });
  it("bounds a provider that ignores abort and cleans promptly", async () => {
    const { lifecycle, provider } = fixture(); provider.stuck = true;
    await expect(lifecycle.ensure(key)).rejects.toMatchObject({ code: "timeout" });
    expect(provider.cleanups).toBeGreaterThan(0); expect(provider.resources.size).toBe(0);
  });
  it("does not cancel shared work when one waiter cancels", async () => {
    const { lifecycle, provider } = fixture(); provider.milliseconds = 25;
    const abort = new AbortController();
    const first = lifecycle.ensure(key, abort.signal).catch(error => error);
    const second = lifecycle.ensure(key); await delay(5); abort.abort();
    expect((await first).code).toBe("cancelled");
    expect((await second).state).toBe("READY"); expect(provider.cleanups).toBe(0);
  });
  it("cleans when the last waiter cancels", async () => {
    const { lifecycle, provider } = fixture(); provider.stuck = true;
    const abort = new AbortController(); const result = lifecycle.ensure(key, abort.signal);
    await delay(5); abort.abort();
    await expect(result).rejects.toMatchObject({ code: "cancelled" }); expect(provider.resources.size).toBe(0);
  });
  it("rejects stale templates and prepares a replacement", async () => {
    const { lifecycle, provider } = fixture(); const first = await lifecycle.ensure(key);
    provider.stale = true;
    const next = await lifecycle.ensure(key);
    expect(next.id).not.toBe(first.id); expect(provider.preparations).toBe(2); expect(provider.resources.has(first.id)).toBe(false);
  });
  it("recovers a crashed preparation and retries failed cleanup", async () => {
    const { lifecycle, provider, store } = fixture(); const row = (await store.claim(key, Date.now() - 1))!;
    provider.resources.set(row.id, "orphan"); provider.cleanupFails = true;
    expect(await lifecycle.recover(key.scope)).toBe(0); expect((await store.current(key))?.state).toBe("CLEANING");
    provider.cleanupFails = false; await delay(25);
    await lifecycle.recover(key.scope); expect(provider.resources.size).toBe(0);
    await lifecycle.cleanup(row, "timeout"); expect(provider.resources.size).toBe(0);
  });
  it("isolates environments and fingerprints without secret inputs", async () => {
    const { lifecycle, provider } = fixture();
    await lifecycle.ensure(key); expect(await lifecycle.resolve({ ...key, scope: "production-owner" })).toBe("COLD");
    await lifecycle.ensure({ ...key, scope: "production-owner" }); expect(provider.preparations).toBe(2);
    expect(templateFingerprint({ a: "1", b: "2" })).toBe(templateFingerprint({ b: "2", a: "1" }));
    expect(templateFingerprint({ browser: "1" })).not.toBe(templateFingerprint({ browser: "2" }));
  });
  it("telemetry failure cannot delete a published template", async () => {
    const { lifecycle, provider, store } = fixture(); store.event = async () => { throw new Error("db telemetry unavailable"); };
    expect((await lifecycle.ensure(key)).state).toBe("READY"); expect(provider.cleanups).toBe(0);
  });
});
