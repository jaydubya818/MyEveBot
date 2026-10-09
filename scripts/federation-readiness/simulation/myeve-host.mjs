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
if(process.env.NODE_ENV!=='test'||new URL(config.origin).hostname!=='127.0.0.1')throw Error('LOCAL_FIXTURE_ONLY');
Object.assign(process.env, config.environment);
const require = createRequire(`${config.relayRoot}/package.json`);
const pg = require("pg");
const pools=Object.fromEntries(config.databaseUrls.map(url=>[url,new pg.Pool({connectionString:url})]));
const { neonConfig } = await import(createRequire(`${config.myeveRoot}/apps/eve/package.json`).resolve('@neondatabase/serverless').replace(/index\.js$/,'index.mjs'));
neonConfig.fetchEndpoint = () => `http://127.0.0.1:${config.proxyPort}/sql`;
neonConfig.useSecureWebSocket = false;
const { FederationStore } = await import(`${config.myeveRoot}/apps/eve/lib/relay/store.ts`);
const { ownerCommand, handleOwnerRequest } = await import(
  `${config.myeveRoot}/apps/eve/lib/relay/owner-api.ts`
);
const { receiveDelivery } = await import(`${config.myeveRoot}/apps/eve/lib/relay/inbox.ts`);
const { retrieveArtifact } = await import(
  `${config.myeveRoot}/apps/eve/lib/relay/artifacts.ts`
);
const { ensurePrimaryAgent } = await import(`${config.myeveRoot}/apps/eve/lib/agents.ts`);
const { createKnowledge } = await import(`${config.myeveRoot}/apps/eve/lib/knowledge.ts`);
const { verifyEnvelope, encryptSecret } = await import(
  `${config.myeveRoot}/apps/eve/lib/relay/transport.ts`
);
const { createWebSessionToken } = await import(
  `${config.myeveRoot}/apps/eve/lib/web-auth.ts`
);
let queries = [];
createServer(async (req, res) => {
  const pool=pools[req.headers['neon-connection-string']];if(!pool){res.writeHead(403).end();return;}
  const client = await pool.connect();
  try {
    if (
      !pools[req.headers["neon-connection-string"]]
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
const {qualifyIngress}=await import(`${config.myeveRoot}/apps/eve/lib/qualification/client.ts`);
const {POST:storeArtifact}=await import(`${config.myeveRoot}/apps/eve/app/api/relay/qualification-artifacts/route.ts`);
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
      if(incoming.url.startsWith("/api/relay/artifacts/"))await qualifyIngress(request,/^\/api\/relay\/artifacts\//);
      if(incoming.url==="/api/relay/qualification-artifacts")response=await storeArtifact(request);
      else if (incoming.url === "/api/relay")
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
        } else if(input.operation==='artifact-fixture'){
          const id='fq-synthetic-source';const content='Published synthetic Atlas architecture: Node 24 with independent acceptance checks.';
          const {createHash}=await import('node:crypto');
          const metadata={sourceOwnerId:(await store.connection()).ownerId,reference:id,name:'Synthetic Atlas source',type:'text/plain',size:Buffer.byteLength(content),checksum:'sha256:'+createHash('sha256').update(content).digest('hex'),visibility:'SHARED',expiresAt:input.expiresAt};
          result={action:'insert',values:[id,store.ownerId,'fq-fixture-source',encryptSecret(store.ownerId,content),JSON.stringify(metadata),'','',input.expiresAt]};
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
).listen(config.port, "127.0.0.1", () =>
  console.log("MyEve qualification host ready"),
);
