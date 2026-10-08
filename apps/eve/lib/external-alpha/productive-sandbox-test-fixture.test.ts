import { it, expect } from "vitest";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishFixtureMailboxRequest } from "./productive-sandbox-test-fixture.ts";

it("a direct partial mailbox publication is rejected, while atomic fixture publication exposes only the complete packet", async () => {
  const root = await mkdtemp(join(tmpdir(), "ea-mailbox-publication-"));
  const packet = { id: 2, body: JSON.stringify({ model: "generic-fixture", input: "qualification" }) };
  const text = JSON.stringify(packet);
  try {
    const oldPath = join(root, "direct.json"), old = await open(oldPath, "wx", 0o600);
    try {
      await old.write(text.slice(0, 12));
      const partial = await readFile(oldPath, "utf8");
      expect(() => JSON.parse(partial)).toThrow(SyntaxError);
      await old.write(text.slice(12));
    } finally { await old.close(); }
    expect(JSON.parse(await readFile(oldPath, "utf8"))).toEqual(packet);

    let release!: () => void, started!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    const partialWritten = new Promise<void>(resolve => { started = resolve; });
    const delayedWrite = (async (path, data, options) => {
      expect(options).toEqual({ flag: "wx", mode: 0o600 });
      const handle = await open(String(path), "wx", 0o600), content = String(data);
      try { await handle.write(content.slice(0, 12)); started(); await paused; await handle.write(content.slice(12)); }
      finally { await handle.close(); }
    }) as typeof writeFile;
    const path = join(root, "atomic.json"), publishing = publishFixtureMailboxRequest(path, packet, delayedWrite);
    await partialWritten;
    try {
      await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      const partial = await readFile(path + ".tmp", "utf8");
      expect(() => JSON.parse(partial)).toThrow(SyntaxError);
    } finally { release(); await publishing; }
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(packet);
    await expect(readFile(path + ".tmp")).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("an existing unpublished mailbox file is never overwritten", async () => {
  const root = await mkdtemp(join(tmpdir(), "ea-mailbox-exclusive-")), path = join(root, "request-1.json");
  try {
    await writeFile(path + ".tmp", "prior unpublished packet", { mode: 0o600 });
    await expect(publishFixtureMailboxRequest(path, { id: 1, body: "new packet" })).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(path + ".tmp", "utf8")).toBe("prior unpublished packet");
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
