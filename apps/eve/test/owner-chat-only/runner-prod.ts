/** Source-bound ordinary chat fixture. Execute only after coordinator clearance. */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp, realpath, symlink, unlink } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { digest } from "../../lib/engineering/contract.ts";
import { EXTERNAL_ALPHA_INSTRUCTIONS, EXTERNAL_ALPHA_CONTEXT_BYTES } from "../../lib/external-alpha/context.ts";
import { externalAlphaPolicy } from "../../lib/external-alpha/policy.ts";
import { externalAlphaPrompt } from "../../lib/external-alpha/model.ts";
import { prepareChatOnlyFixture, accountingFiles } from "./setup.ts";
import { messages, replies, observe } from "./oracle.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const specPath = process.env.MYEVE_CHAT_ONLY_FIXTURE_SPEC;
assert.ok(specPath, "A separately cleared source-bound operator spec is required");
let spec: any;
try { spec = JSON.parse(await readFile(specPath, "utf8")); } catch { throw Error("CHAT_FIXTURE_OPERATOR_SPEC_INVALID"); }
assert.deepEqual(Object.keys(spec).sort(), ["adminUrl", "clusterSystemIdentifier", "outputDirectory", "packageLockSha256", "ports", "sourceSha"].sort());
assert.match(spec.sourceSha, /^[a-f0-9]{40}$/);
assert.equal(git("rev-parse", "HEAD"), spec.sourceSha);
const sourceTree = git("rev-parse", "HEAD^{tree}");
assert.equal(git("status", "--porcelain"), "", "Never execute an uncommitted fixture");
execFileSync("git", ["merge-base", "--is-ancestor", "a487ea342a5250c500b7c78d66b547e6972182da", spec.sourceSha], { cwd: root });
assert.equal(sha(await readFile(join(root, "package-lock.json"))), spec.packageLockSha256);
let adminUrl: URL;
try { adminUrl = new URL(spec.adminUrl); } catch { throw Error("CHAT_FIXTURE_OPERATOR_SPEC_INVALID"); }
assert.ok(["localhost", "127.0.0.1"].includes(adminUrl.hostname) && adminUrl.username === "ux_fixture" &&
  adminUrl.password === "local-only" && adminUrl.pathname === "/blocker_fixes", "CHAT_FIXTURE_LOCAL_OPERATOR_TARGET_REQUIRED");
assert.ok([...adminUrl.searchParams].every(([key, value]) => key === "host" && value === "::1"));
assert.match(spec.clusterSystemIdentifier, /^\d{10,25}$/);
assert.equal(spec.ports.length, 2);
const allPorts = [Number(adminUrl.port), ...spec.ports.flatMap((ports: any) => {
  assert.deepEqual(Object.keys(ports).sort(), ["eve", "model", "web"]);
  return [ports.eve, ports.model, ports.web];
})];
assert.ok(allPorts.every(port => Number.isInteger(port) && port > 1024 && port < 65536));
assert.equal(new Set(allPorts).size, allPorts.length);
const output = resolve(spec.outputDirectory);
assert.ok(output.startsWith(resolve(root, "output") + sep) || output.startsWith("/Users/jaywest/Myeve/output/"), "Use a task-owned evidence directory");
const outputBase = output.startsWith(resolve(root, "output") + sep) ? resolve(root, "output") : "/Users/jaywest/Myeve/output";
const [realBase, realParent] = await Promise.all([realpath(outputBase), realpath(dirname(output))]);
assert.ok(realParent === realBase || realParent.startsWith(realBase + sep), "CHAT_FIXTURE_OUTPUT_PARENT_ESCAPE");
// Exclusive creation rejects reused attempts and existing symlink destinations.
await mkdir(output, { mode: 0o700 });
const scratch = await mkdtemp(join(tmpdir(), "myeve-chat-only-"));
const control = new AbortController();
const children = new Set<ChildProcess>();
const servers = new Set<Server>();
const privateFiles: string[] = [];
const secrets = new Set<string>([spec.adminUrl, adminUrl.href, "local-only"]);
const events: object[] = [];
const record = (event: object) => events.push({ at: new Date().toISOString(), ...event });
const stop = () => control.abort(Error("CHAT_FIXTURE_OPERATOR_STOP"));
process.once("SIGTERM", stop); process.once("SIGINT", stop);
let fixture: Awaited<ReturnType<typeof prepareChatOnlyFixture>> | undefined;
let complete = false;
let cleanup = false;
let failure = "";
let browserSource: { root: string; files: Record<string, string> } | undefined;
async function verifyBrowserSource() {
  assert.ok(browserSource, "CHAT_FIXTURE_BROWSER_SOURCE_REQUIRED");
  for (const [path, expected] of Object.entries(browserSource.files))
    assert.equal(sha(await readFile(join(browserSource.root, path))), expected, "CHAT_FIXTURE_BROWSER_SOURCE_DRIFT");
}

function command(args: string[], cwd: string, env: NodeJS.ProcessEnv, logPath: string, background = false) {
  control.signal.throwIfAborted();
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  let expectedStop = false;
  let log = Buffer.alloc(0);
  const collect = (data: Buffer) => { log = Buffer.concat([log, data]).subarray(-8 * 1024 * 1024); };
  child.stdout?.on("data", collect); child.stderr?.on("data", collect);
  let abortTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => { child.kill("SIGTERM"); abortTimer = setTimeout(() => child.kill("SIGKILL"), 3000); };
  control.signal.addEventListener("abort", abort, { once: true });
  const ended = new Promise<void>((done, reject) => {
    child.once("error", () => { children.delete(child); reject(Error("CHAT_FIXTURE_CHILD_START_FAILED")); });
    child.once("close", async code => {
      children.delete(child); control.signal.removeEventListener("abort", abort); clearTimeout(abortTimer);
      let text = log.toString();
      for (const secret of secrets) if (secret) text = text.replaceAll(secret, "[REDACTED]");
      text = text.replace(/(?:myeve_session|sofie_session)=[^;\s"'\\]+/g, "myeve_session=[REDACTED]");
      try { await writeFile(logPath, text, { mode: 0o600 }); } catch { reject(Error("CHAT_FIXTURE_DIAGNOSTICS_FAILED")); return; }
      if (!expectedStop && (background || code !== 0)) {
        const error = Error("CHAT_FIXTURE_CHILD_EXIT"); control.abort(error); reject(error);
      } else done();
    });
  });
  // A background failure must not become an unhandled rejected promise.
  if (background) void ended.catch(() => {});
  return { child, ended, async close() {
    expectedStop = true;
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    const timeout = setTimeout(() => child.kill("SIGKILL"), 3000);
    try { await ended; } finally { clearTimeout(timeout); }
  } };
}
async function ready(url: string) {
  for (let attempt = 0; attempt < 90; attempt++) {
    control.signal.throwIfAborted();
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return; } catch { /* Read-only startup polling. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error("CHAT_FIXTURE_READINESS_FAILED");
}
async function copyCommit(destination: string) {
  const entries = execFileSync("git", ["ls-tree", "-rz", "--full-tree", spec.sourceSha], { cwd: root }).toString("utf8").split("\0").filter(Boolean).map(line => {
    const [meta, path] = line.split("\t"); const [mode, type, blob] = meta.split(" ");
    assert.ok(["100644", "100755"].includes(mode) && type === "blob", "Only regular committed blobs are copied");
    assert.ok(path && !path.startsWith("/") && !path.split("/").includes(".."));
    return { path, blob, mode };
  }).filter(({ path }) => !path.split("/").some(part => part.startsWith(".env")) && !path.startsWith("output/"));
  const bodies = execFileSync("git", ["cat-file", "--batch"], { cwd: root, input: entries.map(entry => entry.blob).join("\n") + "\n", maxBuffer: 128 * 1024 * 1024 });
  let offset = 0;
  const files: Record<string, string> = {};
  for (const entry of entries) {
    const end = bodies.indexOf(10, offset); const [blob, type, size] = bodies.subarray(offset, end).toString().split(" ");
    assert.equal(blob, entry.blob); assert.equal(type, "blob");
    const body = bodies.subarray(end + 1, end + 1 + Number(size)); offset = end + 1 + Number(size) + 1;
    const target = join(destination, entry.path); await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, { mode: entry.mode === "100755" ? 0o755 : 0o644 }); files[entry.path] = sha(body);
  }
  await symlink(join(root, "node_modules"), join(destination, "node_modules"), "dir");
  await symlink(join(root, "apps/eve/node_modules"), join(destination, "apps/eve/node_modules"), "dir");
  return files;
}

try {
  // The operator must own this exact cluster; localhost alone is insufficient.
  const admin = new pg.Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  await admin.connect();
  try {
    const row = (await admin.query("SELECT current_user AS role,current_database() AS database,system_identifier::text FROM pg_control_system()")).rows[0];
    assert.equal(row.role, "ux_fixture"); assert.equal(row.database, "blocker_fixes");
    assert.equal(row.system_identifier, spec.clusterSystemIdentifier);
  } finally { await admin.end(); }
  process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE = adminUrl.href;
  fixture = await prepareChatOnlyFixture();
  const selected = fixture;
  const states = [];
  const seams = [];
  const sourceFiles = await copyCommit(join(scratch, "source-1"));
  await copyCommit(join(scratch, "source-2"));
  assert.equal(sourceFiles["package-lock.json"], spec.packageLockSha256);
  browserSource = { root: join(scratch, "source-1"), files: Object.fromEntries(Object.entries(sourceFiles).filter(([path]) =>
    path.startsWith("apps/eve/test/owner-chat-only/") || path === "apps/eve/test/browser/mobile-conversation-layout.mjs")) };
  await verifyBrowserSource();
  const invalidWorkTools = externalAlphaPrompt({ prompt: [{ role: "user", content: [{ type: "text", text: "ordinary chat" }] }],
    tools: ["engineering_work", "engineering_factory"].map(name => ({ type: "function", name, inputSchema: {} })) } as any).tools;
  assert.deepEqual(invalidWorkTools, []);
  for (let index = 0; index < 2; index++) {
    const item = selected.installations[index], ports = spec.ports[index];
    const copy = join(scratch, `source-${index + 1}`), app = join(copy, "apps/eve");
    const ipc = join(scratch, `ipc-${index}`); await mkdir(ipc);
    const appUrl = new URL(adminUrl); appUrl.pathname = "/" + item.app.name;
    const centralUrl = new URL(adminUrl); centralUrl.pathname = "/" + selected.central.name;
    const transportPath = join(scratch, `transport-${index}.json`); privateFiles.push(transportPath);
    await writeFile(transportPath, JSON.stringify({ appUrl: appUrl.href, centralUrl: centralUrl.href,
      pgPort: Number(adminUrl.port), webPort: ports.web, evePort: ports.eve, modelPort: ports.model, ipcDirectory: ipc }), { mode: 0o600 });
    const modelPath = join(app, "lib/external-alpha/model.ts"), beforeModel = await readFile(modelPath, "utf8");
    const needle = 'import { gateway } from "ai";'; assert.equal(beforeModel.split(needle).length, 2);
    const afterModel = beforeModel.replace(needle, 'import { gateway } from "../../test/owner-chat-only/gateway.ts";');
    await writeFile(modelPath, afterModel);
    const configPath = join(app, "next.config.ts"), beforeConfig = await readFile(configPath);
    const afterConfig = `export default {serverExternalPackages:['@remotion/bundler','@remotion/renderer','heif2jpeg'],async rewrites(){return [{source:'/eve/:path*',destination:'http://127.0.0.1:${ports.eve}/eve/:path*'}]}};\n`;
    await writeFile(configPath, afterConfig);
    const key = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const password = "fixture chat " + randomBytes(24).toString("hex");
    const marker = `CHAT_SLOT_${item.slot}_${randomBytes(12).toString("hex")}`;
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TMPDIR: ipc,
      NODE_ENV: "production", NODE_OPTIONS: "--max-old-space-size=5120 --require=" + join(app, "test/owner-chat-only/transport.cjs"),
      NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: appUrl.href,
      MYEVE_CHAT_ONLY_TRANSPORT_FILE: transportPath, MYEVE_CHAT_ONLY_MODEL_ORIGIN: `http://127.0.0.1:${ports.model}`,
      MYEVE_OWNER_ID: item.app.owner, MYEVE_ACCESS_PASSWORD: password, MYEVE_SESSION_SECRET: randomBytes(48).toString("hex"),
      MYEVE_APPLICATION_PASSWORDS: "true", MYEVE_DURABLE_WEB_SESSIONS: "true",
      OWNER_NAME: "Fixture owner", NEXT_PUBLIC_OWNER_NAME: "Fixture owner", NEXT_PUBLIC_AGENT_NAME: "Sofie", OWNER_TIMEZONE: "America/Los_Angeles",
      EVE_PROJECT_NAME: `myeve-alpha-tester-${item.slot}`, MYEVE_BETA_MODE: "private-alpha", MYEVE_ALPHA_REPOSITORY: item.app.policy.repository,
      MYEVE_ALPHA_MAX_WORK_USD: "1.30", MYEVE_ALPHA_MAX_WORK_SECONDS: "180",
      VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: item.app.policy.projectId,
      MYEVE_EXTERNAL_ALPHA_POLICY: JSON.stringify(item.app.policy), MYEVE_EXTERNAL_ALPHA_POLICY_SHA256: digest(item.app.policy),
      MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: key, MYEVE_EXTERNAL_ALPHA_ACCOUNTING_DATABASE_URL: centralUrl.href,
      MYEVE_EXTERNAL_ALPHA_ACCOUNTING_TOKEN: item.credential };
    for (const secret of [password, key, JSON.stringify(key).slice(1, -1), env.MYEVE_SESSION_SECRET!, item.credential, appUrl.href, centralUrl.href]) secrets.add(secret);
    assert.equal(externalAlphaPolicy(env)?.ownerId, item.app.owner);
    const require = createRequire(join(app, "package.json"));
    const nextPackage = require.resolve("next/package.json");
    const next = join(dirname(nextPackage), require("next/package.json").bin.next);
    // Public next/font/local keeps this offline fixture inside the existing
    // transport boundary. Production layout and Google font bytes are untouched.
    const fontSource = "dist/compiled/@vercel/og/Geist-Regular.ttf";
    assert.equal(require("next/package.json").version, "16.4.3", "CHAT_FIXTURE_NEXT_FONT_PACKAGE_IDENTITY");
    const font = await readFile(join(dirname(nextPackage), fontSource));
    const fontSha256 = "bde046ddd9f20be35b0bd56cc79eb752b967fb6661a3fe76cb067bb09f871d76";
    assert.equal(sha(font), fontSha256, "CHAT_FIXTURE_LOCAL_FONT_IDENTITY");
    const fontPath = "test/owner-chat-only/fixture-geist-regular.ttf";
    await writeFile(join(app, fontPath), font);
    const layoutPath = join(app, "app/layout.tsx"), beforeLayout = await readFile(layoutPath, "utf8");
    assert.equal(sha(beforeLayout), sourceFiles["apps/eve/app/layout.tsx"], "CHAT_FIXTURE_LAYOUT_SOURCE_DRIFT");
    const fontImport = 'import { Geist, Geist_Mono, Inter } from "next/font/google";';
    assert.equal(beforeLayout.split(fontImport).length, 2);
    const fontDeclarations = beforeLayout.slice(beforeLayout.indexOf("const inter = Inter("), beforeLayout.indexOf("export const metadata:"));
    assert.ok(fontDeclarations.startsWith("const inter = Inter(") && fontDeclarations.includes("const geistMono = Geist_Mono("));
    const afterLayout = beforeLayout.replace(fontImport, 'import localFont from "next/font/local";').replace(fontDeclarations,
      ['const inter = localFont({ src: "../' + fontPath + '", variable: "--font-sans" });',
       'const geist = localFont({ src: "../' + fontPath + '", variable: "--font-geist" });',
       'const geistMono = localFont({ src: "../' + fontPath + '", variable: "--font-geist-mono" });', "", ""].join("\n"));
    await writeFile(layoutPath, afterLayout);
    seams.push({ slot: item.slot, model: { path: "apps/eve/lib/external-alpha/model.ts", before: sha(beforeModel), after: sha(afterModel), substitution: "gateway generation and pricing catalog use local fixture module" },
      next: { path: "apps/eve/next.config.ts", before: sha(beforeConfig), after: sha(afterConfig), substitution: "withEve build/router replaced by owned local Eve rewrite" },
      fonts: { path: "apps/eve/app/layout.tsx", before: sha(beforeLayout), after: sha(afterLayout),
        source: "next@16.4.3/" + fontSource, asset: "apps/eve/" + fontPath, assetSha256: fontSha256,
        substitution: "copied layout only uses public next/font/local and one exact bundled local font for all three variables; no production font or visual equivalence claim" },
      transport: { path: "apps/eve/test/owner-chat-only/transport.cjs", sha256: sourceFiles["apps/eve/test/owner-chat-only/transport.cjs"],
        substitution: "preload exact app Neon-to-pg adapter, native central pg unchanged; owned socket/HTTP tripwires; private owned IPC" },
      topology: { applicationDatabase: item.app.name, accountingDatabase: selected.central.name, pgPort: Number(adminUrl.port), ...ports },
      dependencyReuse: "node_modules symlinks from the operator checkout; reviewed source lock bound; no install or graph qualification performed by this runner" });
    states.push({ index, app, env, next, ports, password, marker, calls: 0, observedRequests: [] as object[] });
  }
  const privateBrowser = join(scratch, "browser.json"); privateFiles.push(privateBrowser);
  await writeFile(privateBrowser, JSON.stringify({ source: spec.sourceSha, tree: git("rev-parse", "HEAD^{tree}"),
    operatorRoot: root, browserFiles: browserSource.files,
    slots: states.map(state => ({ slot: String(state.index + 1), ownerId: selected.installations[state.index].app.owner,
      projectId: selected.installations[state.index].app.policy.projectId, base: `http://localhost:${state.ports.web}`,
      oracle: `http://127.0.0.1:${state.ports.model}`, password: state.password, marker: state.marker })) }), { mode: 0o600 });
  await writeFile(join(output, "source-seams.json"), JSON.stringify({ source: spec.sourceSha, tree: git("rev-parse", "HEAD^{tree}"),
    status: "NOT_A_PRODUCTION_OR_PRODUCTIVE_QUALIFICATION", scope: "ordinary synthetic chat only", sourceFiles, seams,
    browser: { committedCopy: true, files: browserSource.files },
    accountingSql: Object.fromEntries(await Promise.all(accountingFiles.map(async file => [file, sha(await readFile(join(root, "apps/eve/lib/external-alpha", file)))]))) }, null, 2) + "\n");
  for (const state of states) {
    const eveEnv = { ...state.env, NITRO_PRESET: "node-server" }; delete eveEnv.VERCEL;
    await command([join(root, "node_modules/eve/bin/eve.js"), "build"], state.app, eveEnv, join(scratch, `build-eve-${state.index}.log`)).ended;
    await command([state.next, "build", "--webpack"], state.app, state.env, join(scratch, `build-next-${state.index}.log`)).ended;
  }
  const models = states.map(state => {
    const server = createServer(async (request, response) => {
      const send = (body: unknown, status = 200) => { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(body)); };
      try {
        assert.equal(new URL(request.url!, "http://fixture").search, "");
        if (request.url === "/fixture/status" && request.method === "GET") { send(await observe(selected, state.index, state.marker, state.calls)); return; }
        assert.equal(request.url, "/model"); assert.equal(request.method, "POST");
        const chunks: Buffer[] = []; let bytes = 0;
        for await (const chunk of request) { bytes += chunk.length; assert.ok(bytes <= 128000); chunks.push(Buffer.from(chunk)); }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        assert.ok(body.prompt.some((message: any) => message.role === "system" && String(message.content).includes(EXTERNAL_ALPHA_INSTRUCTIONS)));
        const names = (body.tools ?? []).map((tool: any) => tool.name);
        assert.ok(!names.includes("engineering_work") && !names.includes("engineering_factory"));
        assert.ok(Buffer.byteLength(JSON.stringify({ prompt: body.prompt, tools: body.tools })) <= EXTERNAL_ALPHA_CONTEXT_BYTES);
        const last = body.prompt.findLast((message: any) => message.role === "user");
        const text = last?.content?.map((part: any) => part.type === "text" ? part.text : "INVALID").join("\n");
        assert.equal(text, messages(state.marker)[state.calls]); assert.ok(state.calls < 3);
        assert.ok(!JSON.stringify(body.prompt).includes(states[1 - state.index].marker));
        if (state.calls === 1) assert.ok(body.prompt.some((message: any) => message.role === "user" && JSON.stringify(message.content).includes(state.marker)));
        const reply = replies(state.marker)[state.calls]; state.calls++;
        state.observedRequests.push({ ordinal: state.calls, promptSha256: sha(JSON.stringify(body.prompt)), workToolsAbsent: true, foreignMarkerAbsent: true });
        send({ content: [{ type: "text", text: reply }], usage: { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } },
          warnings: [], finishReason: { unified: "stop", raw: "stop" }, providerMetadata: { gateway: { cost: 0 } } });
      } catch { record({ event: "fixture-endpoint-failed", slot: state.index + 1 }); send({ error: "CHAT_FIXTURE_CONTRACT_FAILED" }, 500); }
    });
    servers.add(server);
    return new Promise<void>((done, reject) => { server.once("error", () => { const error = Error("CHAT_FIXTURE_HTTP_SERVER_FAILED"); control.abort(error); reject(error); }); server.listen(state.ports.model, "127.0.0.1", done); });
  });
  await Promise.all(models);
  for (const stage of ["chat", "restart-readback"]) {
    control.signal.throwIfAborted();
    const apps = states.flatMap(state => [
      command([join(root, "node_modules/eve/bin/eve.js"), "start", "--host", "127.0.0.1", "--port", String(state.ports.eve)], state.app, state.env, join(scratch, `eve-${state.index}.log`), true),
      command([state.next, "start", "--hostname", "127.0.0.1", "--port", String(state.ports.web)], state.app, state.env, join(scratch, `next-${state.index}.log`), true),
    ]);
    try {
      for (const state of states) { await ready(`http://127.0.0.1:${state.ports.eve}/eve/v1/health`); await ready(`http://localhost:${state.ports.web}/api/auth/status`); }
      const env = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TMPDIR: scratch,
        MYEVE_CHAT_ONLY_BROWSER_CONFIG: privateBrowser, MYEVE_CHAT_ONLY_STAGE: stage,
        MYEVE_CHAT_ONLY_EVIDENCE: output, MYEVE_CHAT_ONLY_BROWSER_OUTPUT: join(output, stage) };
      await verifyBrowserSource();
      await command([join(root, "node_modules/@playwright/test/cli.js"), "test", "-c", "test/owner-chat-only/playwright.config.cjs"], states[0].app, env, join(scratch, `browser-${stage}.log`)).ended;
      record({ event: "browser-stage-passed", stage });
    } finally { for (const app of apps) await app.close(); }
  }
  const final = await Promise.all(states.map(state => observe(selected, state.index, state.marker, state.calls)));
  assert.ok(final.every(state => state.modelCalls === 3 && Object.values(state.effects).every(count => count === 0)));
  await writeFile(join(output, "final-observations.json"), JSON.stringify({ observations: final, providerRequests: states.map(state => ({ slot: state.index + 1, requests: state.observedRequests })) }, null, 2) + "\n");
  control.signal.throwIfAborted(); complete = true;
} catch (error) {
  failure = error instanceof Error ? error.name + (error.message.startsWith("CHAT_FIXTURE_") ? ": " + error.message : ": fixture failed; inspect private diagnostics") : "Fixture failed";
} finally {
  process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop);
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => { for (const child of children) child.kill("SIGKILL"); }, 3000);
  await Promise.all([...children].map(child => new Promise<void>(done => { if (child.exitCode !== null || child.signalCode !== null) done(); else child.once("exit", () => done()); })));
  clearTimeout(timer);
  await Promise.all([...servers].map(server => new Promise<void>(done => { if (!server.listening) return done(); server.close(() => done()); server.closeAllConnections(); })));
  for (const file of privateFiles) try { await unlink(file); } catch { failure ||= "CHAT_FIXTURE_PRIVATE_CONFIG_CLEANUP_FAILED"; }
  try { if (fixture) { await fixture.close(); cleanup = true; } } catch { failure ||= "CHAT_FIXTURE_CLEANUP_FAILED"; }
  try {
    assert.equal(git("rev-parse", "HEAD"), spec.sourceSha);
    assert.equal(git("rev-parse", "HEAD^{tree}"), sourceTree);
    assert.equal(git("status", "--porcelain"), "");
    assert.equal(sha(await readFile(join(root, "package-lock.json"))), spec.packageLockSha256);
    await verifyBrowserSource();
  } catch { failure ||= "CHAT_FIXTURE_FINAL_SOURCE_DRIFT"; }
  await writeFile(join(output, "receipt.json"), JSON.stringify({ source: spec.sourceSha, sourceTree, status: complete && cleanup && !failure ? "PASS_SYNTHETIC_CHAT_ONLY" : "FAIL",
    scope: "ordinary local deterministic chat; no Factory; no productive or installed qualification", events, failure: failure || null,
    ownedDatabaseCleanup: cleanup ? "VERIFIED" : "INCOMPLETE_SETUP_REQUIRES_OPERATOR_OWNED_CLUSTER_CLEANUP",
    actualProviderCalls: 0, productionMutations: 0, originalPositiveWorkJourneys: "FAILED_HOLD_DOWNSTREAM_NOT_REACHED_UNCHANGED" }, null, 2) + "\n");
}
if (!complete || !cleanup || failure) process.exitCode = 1;
