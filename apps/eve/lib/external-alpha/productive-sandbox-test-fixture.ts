import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

/** Test-only SDK transport. It runs trusted generic fixture code locally. It does
 * not qualify Codex installation, container identity or production confinement.
 * Real Factory materialization, harness relay, spend, Git checkpoint and custody
 * code runs over this transport; there is no model/provider network fallback. */
export class ProductiveSandboxFixture {
  resources = new Map<string, any>();
  blobs = new Map<string, Buffer>();
  roots: string[] = [];
  allocations = 0;
  deleted = 0;
  modelCalls = 0;
  constructor(readonly modules: any, readonly candidate: Record<string, string>, readonly unknown = false, readonly sourceFiles: Record<string, string> = {}) {}
  readonly api = {
    create: async (options: any) => {
      this.allocations++;
      if (!options.name.startsWith("factory-run-") || options.env && Object.keys(options.env).length || options.ports?.length) throw Error("FIXTURE_RESOURCE_SCOPE");
      const root = await mkdtemp(join(tmpdir(), "ea-producer-")); this.roots.push(root);
      const map = (text: string) => text.replaceAll("/home/factoryproducer", join(root, "producer")).replaceAll("/opt/factory-harness", join(root, "harness"));
      const done = (exitCode: number, stdout = "", stderr = "") => ({ exitCode, stdout: async () => stdout, stderr: async () => stderr });
      const run = async (command: any): Promise<any> => {
        if (command.cmd === "mv") { await rename(map(command.args.at(-2)), map(command.args.at(-1))); return done(0); }
        if (command.cmd !== "node") throw Error("FIXTURE_COMMAND_SCOPE");
        const script = command.args[1];
        if (script === this.modules.install.cloudHarnessInstallScript) return done(0, JSON.stringify({ version: "codex-cli " + this.modules.plan.cloudHarnessIdentity.version, uid: 0, fixtureTransport: true }));
        if (script === this.modules.checkpoint.harnessQuiescenceScript || script === this.modules.workPlan.quiescenceScript) return done(0, JSON.stringify({ uid: 1001, quiescent: true, fixtureTransport: true }));
        if (command.args[0].endsWith("cloud-harness-worker.mjs")) {
          const config = JSON.parse(await readFile(map(command.args[1]), "utf8"));
          const phaseRoot = map(command.args[1]).slice(0, -5), startedAt = new Date().toISOString();
          await mkdir(join(phaseRoot, "mailbox"), { recursive: true });
          const work = (async () => {
            const packet = { model: this.modules.plan.cloudHarnessIdentity.model, stream: false, tools: config.phase === "productive" ? [{ type: "custom", name: "apply_patch" }] : [], input: [{ role: "user", content: [{ type: "input_text", text: config.prompt }] }] };
            await writeFile(join(phaseRoot, "mailbox/request-1.json"), JSON.stringify({ id: 1, body: JSON.stringify(packet) }));
            const reply = await this.waitJson(join(phaseRoot, "mailbox/response-1.json"), config.deadline);
            if (reply.kind !== "response" || reply.status !== 200) throw Error("FIXTURE_MODEL_RESPONSE");
            const response = JSON.parse(Buffer.from(reply.bodyBase64, "base64").toString("utf8"));
            if (config.phase === "productive") {
              const tool = response.output.find((o: any) => o.name === "apply_patch");
              if (!tool || typeof tool.input !== "string") throw Error("FIXTURE_TOOL_RESPONSE");
              // This transport accepts only a full replacement patch for the
              // caller's trusted public generic fixture; no arbitrary tools.
              for (const part of tool.input.split("*** Update File: ").slice(1)) {
                const path = part.slice(0, part.indexOf("\n"));
                if (!Object.hasOwn(this.candidate, path)) throw Error("FIXTURE_TOOL_PATH");
                const expected = this.candidate[path].trimEnd().split("\n").map(l => "+" + l).join("\n");
                if (!part.includes(expected)) throw Error("FIXTURE_TOOL_BYTES");
                const destination = map("/home/factoryproducer/workspace/" + path);
                await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, this.candidate[path]);
              }
              await writeFile(join(phaseRoot, "mailbox/request-2.json"), JSON.stringify({ id: 2, body: JSON.stringify(packet) }));
              const yieldReply = await this.waitJson(join(phaseRoot, "mailbox/response-2.json"), config.deadline);
              if (yieldReply.kind !== "yield") throw Error("FIXTURE_CHECKPOINT_BOUNDARY");
            }
            await writeFile(join(phaseRoot, "result.json"), JSON.stringify({ workerProfile: "container", status: config.phase === "productive" ? "yielded" : "completed", success: true, completionEventSeen: config.phase === "completion", startedAt, finishedAt: new Date().toISOString(), diagnostics: [] }));
            return done(0);
          })().catch(error => done(1, "", String(error)));
          return { cmdId: "cmd_" + randomUUID(), wait: () => work };
        }
        const args = command.args.map((a: string) => map(a));
        const cwd = command.cwd ? map(command.cwd) : root;
        return await new Promise(resolve => {
          const child = spawn(process.execPath, args, { cwd, env: { PATH: process.env.PATH, HOME: map("/home/factoryproducer"), TMPDIR: root, LANG: "C", CI: "1", NODE_ENV: "test" }, stdio: ["ignore", "pipe", "pipe"] });
          let stdout = "", stderr = ""; const timer = setTimeout(() => child.kill("SIGKILL"), command.timeoutMs ?? 30000);
          child.stdout.on("data", c => stdout += String(c)); child.stderr.on("data", c => stderr += String(c));
          child.on("error", error => { clearTimeout(timer); resolve(done(1, stdout, String(error))); });
          child.on("close", code => { clearTimeout(timer); resolve(done(code ?? 1, stdout, stderr)); });
        });
      };
      const io = {
        homeDir: "/home/factoryproducer", runCommand: run,
        writeFiles: async (files: any[]) => { for (const f of files) { const path = map(f.path); await mkdir(dirname(path), { recursive: true }); await writeFile(path, f.content, { mode: f.mode }); } },
        readFile: async ({ path }: { path: string }) => { try { return Readable.from([await readFile(map(path))]); } catch (e: any) { if (e.code === "ENOENT") return null; throw e; } },
      };
      const sessionId = "sbx_" + randomUUID();
      const sandbox = { name: options.name, image: options.image, currentSession: () => ({ sessionId, runCommand: io.runCommand, writeFiles: io.writeFiles, readFile: io.readFile, update: async ({networkPolicy}: {networkPolicy: string}) => { if(networkPolicy !== "deny-all") throw Error("FIXTURE_NETWORK_POLICY"); } }), asUser: () => io, createUser: async () => io, readFile: io.readFile,
        updateNetworkPolicy: async (policy: string) => { if (policy !== "deny-all") throw Error("FIXTURE_NETWORK_POLICY"); }, stop: async () => {}, delete: async () => { this.deleted++; this.resources.delete(options.name); } };
      this.resources.set(options.name, sandbox); return sandbox;
    },
    get: async ({ name }: { name: string }) => { const sandbox = this.resources.get(name); if (!sandbox) throw Object.assign(Error("NOT_FOUND"), { response: { status: 404 } }); return sandbox; },
  };
  readonly blobPut = async (path: string, bytes: Buffer, options: any) => { if (options.access !== "private" || options.allowOverwrite !== false || this.blobs.has(path)) throw Error("FIXTURE_CUSTODY_SCOPE"); this.blobs.set(path, Buffer.from(bytes)); };
  readonly blobGet = async (path: string) => { const bytes = this.blobs.get(path); return bytes ? { statusCode: 200, blob: { size: bytes.length }, stream: Readable.from([Buffer.from(bytes)]) } : { statusCode: 404 }; };
  modelProvider = () => ({ price: this.modules.price.productionModelPrice, upstreamOrigin: "https://deterministic.factory.invalid", upstreamApiKey: "deterministic-fixture-only", upstreamFetch: async (url: string, init: any) => {
    if (String(url) !== "https://deterministic.factory.invalid/v1/responses" || init.method !== "POST") throw Error("FIXTURE_MODEL_ROUTE");
    this.modelCalls++; if (this.unknown) throw Error("DETERMINISTIC_UNKNOWN_TRANSPORT");
    const body = JSON.parse(init.body); if (body.model !== this.modules.plan.cloudHarnessIdentity.model) throw Error("FIXTURE_MODEL_PIN");
    const productive = body.tools?.some((t: any) => t.name === "apply_patch");
    let output;
    if (productive) {
      const patch = "*** Begin Patch\n" + Object.entries(this.candidate).filter(([p]) => p.startsWith("src/") || p === "test/priority.test.mjs").map(([p, text]) => "*** Update File: " + p + "\n@@\n" + (this.sourceFiles[p] ?? "").trimEnd().split("\n").map(l => "-" + l).join("\n") + "\n" + text.trimEnd().split("\n").map(l => "+" + l).join("\n") + "\n").join("") + "*** End Patch";
      output = [{ type: "custom_tool_call", id: "tool-fixture", call_id: "call-fixture", name: "apply_patch", input: patch, status: "completed" }];
    } else output = [{ type: "message", id: "message-fixture", role: "assistant", status: "completed", content: [{ type: "output_text", text: "The exact checked candidate is ready for independent verification.", annotations: [] }] }];
    const id = "fixture-" + randomUUID(); return Response.json({ id, object: "response", status: "completed", model: body.model, output, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } }, { headers: { "x-request-id": id } });
  } });
  private async waitJson(path: string, deadline: number) {
    // UNKNOWN deliberately leaves no response; this bounds only our local SDK worker.
    const until = Math.min(deadline, Date.now() + (this.unknown ? 2000 : 15000));
    while (Date.now() < until) { try { return JSON.parse(await readFile(path, "utf8")); } catch (e: any) { if (e.code !== "ENOENT") throw e; } await new Promise(r => setTimeout(r, 10)); }
    throw Error("FIXTURE_WORKER_RESPONSE_TIMEOUT");
  }
  async close() { await Promise.all(this.roots.map(root => rm(root, { recursive: true, force: true }))); }
}
