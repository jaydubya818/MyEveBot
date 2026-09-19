// Real MyEve repositories and adapter, hosted over disposable HTTPS + PostgreSQL.
// The Neon HTTP compatibility proxy below changes transport, never SQL semantics.
import { createServer as httpsServer } from "node:https";
import { createServer } from "node:http";
import { readFileSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import dns from "node:dns";
// Docker resolves this hostname in Ava; the local host maps the same TLS name to loopback.
const lookup = dns.lookup;
dns.lookup = (name, options, callback) =>
  lookup(
    name === "host.docker.internal" ? "127.0.0.1" : name,
    options,
    callback,
  );
const config = JSON.parse(
  readFileSync(process.env.QUALIFICATION_CONFIG, "utf8"),
);
Object.assign(process.env, config.environment);
const require = createRequire(`${config.relayRoot}/package.json`);
const pg = require("pg");
const pool = new pg.Pool({ connectionString: config.environment.DATABASE_URL });
const { neonConfig } = await import("@neondatabase/serverless");
neonConfig.fetchEndpoint = () => `http://127.0.0.1:${config.proxyPort}/sql`;
neonConfig.useSecureWebSocket = false;
const { FederationStore } = await import("../../apps/eve/lib/relay/store.ts");
const { ownerCommand, handleOwnerRequest } = await import(
  "../../apps/eve/lib/relay/owner-api.ts"
);
const { receiveDelivery } = await import("../../apps/eve/lib/relay/inbox.ts");
const { retrieveArtifact } = await import(
  "../../apps/eve/lib/relay/artifacts.ts"
);
const { ensurePrimaryAgent } = await import("../../apps/eve/lib/agents.ts");
const { createKnowledge } = await import("../../apps/eve/lib/knowledge.ts");
const { verifyEnvelope } = await import(
  "../../apps/eve/lib/relay/transport.ts"
);
const { createWebSessionToken } = await import(
  "../../apps/eve/lib/web-auth.ts"
);
let queries = [];
createServer(async (req, res) => {
  const client = await pool.connect();
  try {
    if (
      req.headers["neon-connection-string"] !== config.environment.DATABASE_URL
    )
      throw Error("Wrong isolated database");
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks));
    const batch = !!body.queries;
    if (batch) await client.query("BEGIN");
    const result = [];
    for (const item of body.queries ?? [body]) {
      queries.push(item.query);
      appendFileSync(
        config.queryLog,
        JSON.stringify({ query: item.query }) + "\n",
      );
      const r = await client.query({
        text: item.query,
        values: item.params,
        rowMode: "array",
        types: { getTypeParser: () => (v) => v },
      });
      if (Array.isArray(r))
        throw Error("Split SQL statements for the Neon proxy");
      result.push({
        rows: r.rows,
        fields: r.fields.map((f) => ({
          name: f.name,
          dataTypeID: f.dataTypeID,
        })),
        rowCount: r.rowCount,
        command: r.command,
        rowAsArray: true,
      });
    }
    if (batch) await client.query("COMMIT");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(batch ? { results: result } : result[0]));
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("MyEve SQL error", e.message);
    res
      .writeHead(400, { "content-type": "application/json" })
      .end(JSON.stringify({ message: e.message, code: e.code }));
  } finally {
    client.release();
  }
}).listen(config.proxyPort, "127.0.0.1");
const store = new FederationStore(config.environment.MYEVE_OWNER_ID);
httpsServer(
  { key: readFileSync(config.tlsKey), cert: readFileSync(config.tlsCert) },
  async (incoming, outgoing) => {
    try {
      if (incoming.url === "/health") {
        outgoing.end("ready");
        return;
      }
      const request = new Request(`${config.origin}${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers,
        body: incoming.method === "GET" ? undefined : incoming,
        duplex: "half",
      });
      let response;
      if (incoming.url === "/api/relay")
        response = await handleOwnerRequest(request);
      else if (incoming.url.startsWith("/api/relay/artifacts/")) {
        const artifact = await retrieveArtifact(
          store,
          new URL(request.url).pathname.split("/").at(-1),
          request.url,
          incoming.headers.authorization ?? "",
        );
        response = new Response(artifact.content, {
          headers: { "content-type": artifact.type },
        });
      } else if (
        incoming.url === "/qualification" &&
        incoming.headers.authorization === `Bearer ${config.control}`
      ) {
        const input = await request.json();
        let result;
        if (input.operation === "seed") {
          const agent = await ensurePrimaryAgent(store.ownerId);
          const records = [];
          for (const [kind, statement] of [
            ["fact", "Project Atlas uses Node 24."],
            [
              "insight",
              "Atlas verification uses independent acceptance checks.",
            ],
            ["fact", config.privateMarker],
          ])
            records.push(
              await createKnowledge({
                ownerId: store.ownerId,
                kind,
                statement,
                createdByType: "owner",
                confidence: 1,
                ...(kind === "insight"
                  ? { generatedAt: new Date().toISOString() }
                  : {}),
              }),
            );
          result = {
            agent,
            records,
            cookie: `myeve_session=${createWebSessionToken()}`,
          };
        } else if (input.operation === "claim-only")
          result = await store.claim(
            verifyEnvelope(input.token, await store.connection()),
          );
        else if (input.operation === "deliver")
          result = await receiveDelivery(store, input.token);
        else if (input.operation === "traces") {
          result = queries;
          queries = [];
        } else if (input.operation === "debug-command")
          result = await ownerCommand(store, input.command);
        else throw Error("Unsupported qualification operation");
        response = Response.json(result ?? { ok: true });
      } else response = new Response(null, { status: 404 });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      console.error(e.stack);
      outgoing
        .writeHead(400, { "content-type": "application/json" })
        .end(JSON.stringify({ error: e.message }));
    }
  },
).listen(config.port, "0.0.0.0", () =>
  console.log("MyEve qualification host ready"),
);
