import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createOwnerArchive, OWNER_DATA_DOMAINS, validateOwnerArchive } from "./owner-data";
import { changeArchiveJson, duplicateArchive, rawArchive } from "../test/fixtures/owner-archives";
async function validArchive() {
  return createOwnerArchive({ exportedAt: "2026-09-20T12:00:00Z", ownerFingerprint: "fixture", categories: Object.fromEntries(OWNER_DATA_DOMAINS.map(d => [d.id, { description: d.description, completeness: "complete", portability: "fully_restorable", notes: [], records: { rows: [{ title: "Discuss token budgets and password management", input_tokens: 123, authorizationStatus: "requires_reconnection" }] } }])) });
}
describe("owner archive untrusted input", () => {
  it("accepts legitimate v1 data, ordinary owner prose and token usage counts", async () => { expect((await validateOwnerArchive(await validArchive())).valid).toBe(true); });
  it.each(["data/knowledge.json", "manifest.json", "checksums.json"])("rejects checksum-valid duplicate %s", async path => { await expect(validateOwnerArchive(await duplicateArchive(await validArchive(), path))).rejects.toThrow("duplicate"); });
  it.each(["./data/knowledge.json", "data/./knowledge.json", "data/nested/../knowledge.json", "data//knowledge.json"])("rejects normalized alias %s before reading data", async alias => { await expect(validateOwnerArchive(await duplicateArchive(await validArchive(), "data/knowledge.json", alias))).rejects.toThrow(); });
  it.each(["DATA/knowledge.json", "data/%6bnowledge.json", "data/%256bnowledge.json"])("rejects noncanonical spelling %s", async alias => { await expect(validateOwnerArchive(await duplicateArchive(await validArchive(), "data/knowledge.json", alias))).rejects.toThrow(); });
  it.each(["token", "secret", "password", "authorization", "credentials", "cookies", "apiKey", "access_key", "refreshToken", "privateKey", "vncCredential", "databaseURL"])("rejects root secret concept %s without echoing its value", async key => {
    const marker = randomUUID(); const archive = await changeArchiveJson(await validArchive(), "data/profile.json", value => { value[key] = marker; });
    const error = await validateOwnerArchive(archive).then(() => null, (e: Error) => e);
    expect(error !== null).toBe(true); expect(error?.message.includes(marker)).toBe(false); expect(error?.message).toContain("secret-bearing");
  });
  it.each(["profile", "connections", "agents", "computer_history"])("rejects nested array secrets in %s", async domain => {
    const marker = randomUUID(); const archive = await changeArchiveJson(await validArchive(), `data/${domain}.json`, value => { value.records = { items: [{ metadata: { deep: { password: marker } } }] }; });
    const error = await validateOwnerArchive(archive).then(() => null, (e: Error) => e);
    expect(error !== null).toBe(true); expect(error?.message.includes(marker)).toBe(false);
  });
  it("checks manifest metadata recursively too", async () => { const archive = await changeArchiveJson(await validArchive(), "manifest.json", value => { value.provider = { credentials: randomUUID() }; }); await expect(validateOwnerArchive(archive)).rejects.toThrow("secret-bearing"); });
  it("does not echo malformed JSON contents", async () => {
    const marker = randomUUID(), zip = new JSZip(); zip.file("manifest.json", marker);
    const error = await validateOwnerArchive(await zip.generateAsync({ type: "uint8array" })).then(() => null, (e: Error) => e);
    expect(error instanceof Error).toBe(true); expect(error?.message.includes(marker)).toBe(false);
  });
  it("rejects too many raw entries even when all duplicate", async () => { await expect(validateOwnerArchive(rawArchive(Array.from({length:65}, () => ({name:"manifest.json",content:Buffer.from("{}")}))))).rejects.toThrow(); });
  it("rejects unsafe traversal and absolute paths", async () => { for (const name of ["../x.json", "/x.json", "data\\x.json"]) await expect(validateOwnerArchive(rawArchive([{name,content:Buffer.from("{}")}]))).rejects.toThrow(); });
  it("rejects bounded highly compressed content before inflation", async () => { const zip = new JSZip();zip.file("manifest.json", " ".repeat(5*1024*1024)); await expect(validateOwnerArchive(await zip.generateAsync({type:"uint8array",compression:"DEFLATE"}))).rejects.toThrow("compression ratio"); });
});

describe("owner archive resource bounds", () => {
  it("rejects archives beyond 25 MB before parsing", async () => {
    await expect(validateOwnerArchive(new Uint8Array(25 * 1024 * 1024 + 1))).rejects.toThrow();
  });
  it("rejects an entry beyond 10 MB", async () => {
    await expect(validateOwnerArchive(rawArchive([{ name: "manifest.json", content: new Uint8Array(10 * 1024 * 1024 + 1) }]))).rejects.toThrow();
  });
  it("rejects forged expansion sizes before unbounded inflation", async () => {
    const zip = new JSZip(); zip.file("manifest.json", "x".repeat(2 * 1024 * 1024));
    const bytes = Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
    const directory = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(1, 22); bytes.writeUInt32LE(1, directory + 24);
    await expect(validateOwnerArchive(bytes)).rejects.toThrow("expansion bounds");
  });
});


describe("JSON secret key coverage", () => {
  it("rejects credentials in shadowed objects and escaped keys", async () => {
    for (const raw of ['{"metadata":{"password":"synthetic"},"metadata":{}}', '{"\\u0074oken":"synthetic"}']) {
      const zip = new JSZip(); zip.file("manifest.json", raw);
      await expect(validateOwnerArchive(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow("secret-bearing");
    }
  });
});
