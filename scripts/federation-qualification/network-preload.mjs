// Qualification only: route the Neon HTTP transport to isolated local PostgreSQL.
// All product queries, owner APIs and authorization remain unchanged.
import { readFileSync } from "node:fs";
import dns from "node:dns";
const config = JSON.parse(
  readFileSync(process.env.QUALIFICATION_CONFIG, "utf8"),
);
const lookup = dns.lookup;
dns.lookup = (name, options, callback) =>
  lookup(
    name === "host.docker.internal" ? "127.0.0.1" : name,
    options,
    callback,
  );
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  if (
    headers.get("neon-connection-string") ===
    config.environment.DATABASE_URL.replace("127.0.0.1", "myeve-db.local")
  ) {
    headers.set("neon-connection-string", config.environment.DATABASE_URL);
    return originalFetch(`http://127.0.0.1:${config.proxyPort}/sql`, {
      ...init,
      headers,
    });
  }
  return originalFetch(input, init);
};
