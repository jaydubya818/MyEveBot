// Isolated characterization of the installed Eve MCP transport. Not a Relay
// connection, identity resolver, production adapter, or execution qualification.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setImmediate as nextTick } from "node:timers/promises";

const root = resolve(import.meta.dirname, "../../../..");
const eve = resolve(root, "node_modules/eve");
const runtimeFile = resolve(eve, "dist/src/runtime/connections/mcp-client.js");
const { McpConnectionClient } = await import(pathToFileURL(runtimeFile).href);
const packageInfo = JSON.parse(await readFile(resolve(eve, "package.json"), "utf8"));
assert.equal(packageInfo.version, "0.66.3", "Review the transport contract after any Eve upgrade");
const output = resolve(process.argv[2] ?? resolve(root, "output/relay-mcp-framework-qualification"));
await mkdir(output, { recursive: true });

// These are external test-harness deadlines. They are not injected into, or
// presented as timeout protection supplied by, the application connection API.
async function deadline(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`Local fixture deadline: ${label}`)), 2000);
    })]);
  } finally { clearTimeout(timer); }
}
const deferred = () => Promise.withResolvers();
async function peer(handle) {
  const responses = new Set();
  const server = createServer(async (request, response) => {
    responses.add(response);
    response.on("close", () => responses.delete(response));
    try {
      if (request.method === "GET") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(": local fixture\n\n");
        return;
      }
      if (request.method !== "POST") { response.writeHead(202); response.end(); return; }
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 8192) throw Error("Fixture request bound");
      }
      await handle(JSON.parse(body), response);
    } catch { response.destroy(); }
  });
  server.listen(0, "127.0.0.1");
  await deadline(new Promise((yes, no) => { server.once("listening", yes); server.once("error", no); }), "listen");
  return {
    url: `http://127.0.0.1:${server.address().port}/mcp`,
    async close() {
      for (const response of responses) response.destroy();
      server.closeAllConnections();
      await deadline(new Promise(yes => server.close(yes)), "server cleanup");
    },
  };
}
function json(response, id, result) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
}
function initialize(message, response) {
  if (message.method === "initialize") {
    json(response, message.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "synthetic-local-fixture", version: "1" } });
    return true;
  }
  if (message.method === "notifications/initialized") { response.writeHead(202); response.end(); return true; }
  return false;
}
const definition = url => ({ connectionName: "fixture", protocol: "mcp", url,
  description: "Local framework characterization only", protocolVersionDiscovery: false,
  headers: { Authorization: "Bearer synthetic-local-fixture-only" }, tools: { allow: ["fixture_write"] } });
const tools = [{ name: "fixture_write", description: "Write to an in-memory fixture counter", inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } }];
const checks = [];

// A pending initialize cannot receive a per-connection deadline from the public
// definition, and close() does not own/cancel the still-initializing SDK client.
{
  const received = deferred();
  const server = await peer((message, response) => received.resolve({ message, response }));
  const client = new McpConnectionClient(definition(server.url));
  let settled = false;
  const pending = client.getToolMetadata().then(() => { settled = true; }, () => { settled = true; });
  try {
    const held = await deadline(received.promise, "initialize received");
    assert.equal(held.message.method, "initialize");
    await deadline(client.close(), "close pending startup");
    await nextTick();
    assert.equal(settled, false);
    assert.equal(held.response.destroyed, false);
    checks.push({ name: "pending initialization close", status: "GAP", pendingRequestNotCancelled: true });
  } finally { await server.close(); await deadline(pending, "startup cleanup"); await client.close(); }
}

// Discovery has no request-options parameter on Eve's connection API. Once
// initialization completes, explicit client close does cancel the held read.
{
  const received = deferred();
  const server = await peer((message, response) => {
    if (!initialize(message, response)) received.resolve({ message, response });
  });
  const client = new McpConnectionClient(definition(server.url));
  let settled = false;
  const pending = client.getToolMetadata().then(() => { settled = true; }, () => { settled = true; });
  try {
    const held = await deadline(received.promise, "tools/list received");
    assert.equal(held.message.method, "tools/list");
    assert.equal(settled, false);
    await deadline(client.close(), "close pending discovery");
    await deadline(pending, "discovery cleanup");
    checks.push({ name: "tool discovery", status: "GAP", explicitCloseCancelsEstablishedClient: settled });
  } finally { await client.close(); await server.close(); }
}

// An ambiguous benign fixture write is sent once. This does not exercise a
// real account, credential, tool grant, database, paid effect or delayed replay.
{
  let calls = 0;
  const server = await peer((message, response) => {
    if (initialize(message, response)) return;
    if (message.method === "tools/list") return json(response, message.id, { tools });
    assert.equal(message.method, "tools/call"); calls++;
    response.destroy();
  });
  const client = new McpConnectionClient(definition(server.url));
  try {
    await deadline(client.getToolMetadata(), "write fixture discovery");
    await assert.rejects(deadline(client.executeTool("fixture_write", { value: "synthetic" },
      { callId: "synthetic-one-attempt", abortSignal: AbortSignal.timeout(1000) }), "write fixture"));
    assert.equal(calls, 1);
    checks.push({ name: "ambiguous fixture write", status: "PASS", calls, automaticResendObserved: false });
  } finally { await client.close(); await server.close(); }
}

// Application errors must remain failures even when HTTP transport succeeds.
for (const kind of ["json-rpc", "tool-isError"]) {
  let calls = 0;
  const server = await peer((message, response) => {
    if (initialize(message, response)) return;
    if (message.method === "tools/list") return json(response, message.id, { tools });
    assert.equal(message.method, "tools/call"); calls++;
    if (kind === "tool-isError") return json(response, message.id, { isError: true, content: [{ type: "text", text: "Synthetic fixture denial" }] });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "Synthetic fixture denial" } }));
  });
  const client = new McpConnectionClient(definition(server.url));
  try {
    await deadline(client.getToolMetadata(), "error fixture discovery");
    let rejected = false, returned;
    try { returned = await deadline(client.executeTool("fixture_write", { value: "synthetic" },
      { callId: `synthetic-${kind}`, abortSignal: AbortSignal.timeout(1000) }), "error fixture"); }
    catch { rejected = true; }
    assert.equal(calls, 1);
    checks.push({ name: `HTTP200 ${kind}`, status: rejected ? "PASS" : "REQUIRES_RESULT_CLASSIFICATION_REVIEW",
      rejected, returnedIsError: returned?.isError === true, returnedKeys: Object.keys(returned ?? {}), calls });
  } finally { await client.close(); await server.close(); }
}

const publicFile = resolve(eve, "dist/src/public/definitions/connections/mcp.d.ts");
const sdkFile = resolve(eve, "dist/src/compiled/@ai-sdk/mcp/index.js");
const publicApi = await readFile(publicFile, "utf8"), runtime = await readFile(runtimeFile, "utf8");
assert.equal(/readonly\s+(initializationOptions|requestOptions|timeout|transport|fetch)\??\s*:/.test(publicApi), false);
assert.equal(runtime.includes("initializationOptions"), false);
assert.equal(runtime.includes(".listTools()"), true);
const sourceSha256 = {};
for (const file of [publicFile, runtimeFile, sdkFile]) sourceSha256[file.slice(eve.length + 1)] = createHash("sha256").update(await readFile(file)).digest("hex");
const receipt = { status: "TRANSPORT_UNQUALIFIED", eveVersion: packageInfo.version, checks, sourceSha256,
  missingControls: ["public startup deadline/cancellation options", "bounded/cancellable tool discovery options"],
  scope: "Actual installed Eve connection client over synthetic loopback HTTP; not a canonical MyEve resolver or selected Relay integration",
  connectionRegistered: false, credentialStoreAccesses: 0, productionRequests: 0, paidOperations: 0 };
await writeFile(resolve(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));
