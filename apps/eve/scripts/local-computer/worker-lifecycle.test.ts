import {describe, it, expect} from "vitest";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {mkdtemp, writeFile, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Real child process and authenticated HTTP response; no OS input or provider calls.
describe("companion revocation lifecycle", () => {
  it("exits on server revocation, retains revoked health and never polls again", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "companion-revoked-"));
    let requests = 0;
    const server = createServer((request, response) => {
      requests++;
      expect(request.headers.authorization).toBe(`Bearer ${"a".repeat(64)}`);
      response.writeHead(410, {"Content-Type": "application/json"});
      response.end('{"error":"Computer pairing revoked"}');
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const {port} = server.address() as {port: number};
    const helper = path.join(directory, "fixture-credential");
    await writeFile(helper, `#!/bin/sh\nprintf %s ${"a".repeat(64)}\n`, {mode: 0o700});
    const config = path.join(directory, "config.json");
    await writeFile(config, JSON.stringify({appUrl: `http://127.0.0.1:${port}`, deviceId: "fixture", credentialHelper: helper, keychainAccount: "fixture", roots: [directory], helper: "/nonexistent/helper"}));
    const worker = spawn(process.execPath, ["--import", "tsx", new URL("./worker.ts",import.meta.url).pathname], {cwd: process.cwd(), env: {...process.env, SOFIE_LOCAL_CONFIG: config}, stdio: "ignore"});
    const deadline = setTimeout(() => worker.kill("SIGKILL"), 10000);
    try {
      const code = await new Promise<number|null>(resolve => worker.once("exit", resolve));
      expect(code).toBe(0); // launchd must not restart a revoked pairing.
      expect(requests).toBe(1);
      expect(JSON.parse(await readFile(path.join(directory, "health.json"), "utf8"))).toMatchObject({status: "revoked"});
    } finally {
      clearTimeout(deadline);
      if(worker.exitCode === null) worker.kill("SIGKILL");
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(directory, {recursive: true, force: true});
    }
  }, 15000);
});
