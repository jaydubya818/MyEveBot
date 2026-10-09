// Qualification only: local PostgreSQL using the real Neon HTTP wire contract.
import { createServer } from "node:http";
import { createRequire } from "node:module";
const require = createRequire(`${process.env.JEV_QA_TOOLS}/package.json`);
const { Pool } = require("pg");
const database = process.env.JEV_QA_DATABASE;
if (!database || new URL(database).hostname !== "127.0.0.1")
  throw new Error("Qualification requires loopback PostgreSQL");
const pool = new Pool({ connectionString: database });
let queries = 0;
const server = createServer(async (request, response) => {
  if (request.url === "/health")
    return response.end(JSON.stringify({ queries }));
  if (request.headers["neon-connection-string"] !== process.env.DATABASE_URL)
    return response.writeHead(403).end();
  const client = await pool.connect();
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    const batch = Boolean(body.queries);
    if (batch) await client.query("BEGIN");
    const results = [];
    for (const item of body.queries ?? [body]) {
      queries++;
      const result = await client.query({
        text: item.query,
        values: item.params,
        rowMode: "array",
        types: { getTypeParser: () => (value) => value },
      });
      results.push({
        rows: result.rows,
        fields: result.fields.map((field) => ({
          name: field.name,
          dataTypeID: field.dataTypeID,
        })),
        rowCount: result.rowCount,
        command: result.command,
        rowAsArray: true,
      });
    }
    if (batch) await client.query("COMMIT");
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify(batch ? { results } : results[0]));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    response
      .writeHead(400, { "content-type": "application/json" })
      .end(JSON.stringify({ message: error.message, code: error.code }));
  } finally {
    client.release();
  }
});
server.listen(Number(process.env.JEV_QA_PROXY_PORT ?? 55450), "127.0.0.1");
process.on("SIGTERM", () =>
  server.close(async () => {
    await pool.end();
    process.exit(0);
  }),
);
