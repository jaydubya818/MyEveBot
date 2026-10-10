import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ReferenceStore } from "../src/store.ts";
import { Crm } from "../src/crm.ts";
import { ACTIONS, QUERIES, AppError, keys } from "../src/contracts.ts";
import { sofieRequest } from "../src/resolver.ts";
import { previewSnapshot } from "../src/preview.ts";

export const fixturePrincipal = (ownerId, kind = "human") => ({
  ownerId,
  actorId: kind === "human" ? "synthetic-browser-owner" : "synthetic-sofie",
  kind,
  allowedOperations: [
    "apps.read",
    "apps.manage",
    ...(kind === "human" ? ["apps.install"] : []),
    ...ACTIONS.map((x) => x.name),
    ...QUERIES.map((x) => x.name),
  ],
});
const owners = new Set(["synthetic-owner-a", "synthetic-owner-b"]);
const assets = new Map([
  ["/", ["text/html", new URL("./index.html", import.meta.url)]],
  ["/app.js", ["text/javascript", new URL("./app.js", import.meta.url)]],
  ["/app.css", ["text/css", new URL("./app.css", import.meta.url)]],
]);
export async function startPrototype({
  store,
  candidates = [],
  adapter,
  port = 0,
  asOf = "2026-10-08",
}) {
  const sessions = new Map();
  let origin;
  const server = createServer(async (req, res) => {
    const headers = {
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    };
    const send = (status, data) => {
      res.writeHead(status, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    try {
      if (req.headers.host !== new URL(origin).host) throw new AppError();
      const path = new URL(req.url, origin).pathname;
      if (req.method === "GET" && assets.has(path)) {
        const [type, url] = assets.get(path);
        res.writeHead(200, { ...headers, "Content-Type": type });
        res.end(readFileSync(url));
        return;
      }
      if (
        req.method !== "POST" ||
        req.headers.origin !== origin ||
        req.headers["content-type"] !== "application/json"
      )
        throw new AppError();
      let bytes = 0,
        chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 20000) throw new AppError("INVALID_APP_INPUT");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (path === "/api/fixture-login") {
        keys(body, ["owner"]);
        if (!owners.has(body.owner)) throw new AppError();
        const token = randomUUID();
        sessions.set(token, body.owner);
        res.setHeader(
          "Set-Cookie",
          `myapps_fixture=${token}; HttpOnly; SameSite=Strict; Path=/`,
        );
        return send(200, { ownerId: body.owner, fixture: true });
      }
      const token = /(?:^|; )myapps_fixture=([^;]+)/.exec(
          req.headers.cookie ?? "",
        )?.[1],
        owner = sessions.get(token);
      if (!owner) throw new AppError();
      const principal = fixturePrincipal(
          owner,
          path === "/api/agent" ? "agent" : "human",
        ),
        session = adapter ? null : store.session(principal),
        crm = adapter ? null : new Crm(store, principal);
      if (adapter) return send(200, await adapter(principal, path, body));
      if (path === "/api/apps") {
        keys(body, []);
        const apps = session.list();
        return send(200, {
          apps,
          candidates: candidates
            .filter((c) => c.ownerId === owner)
            .flatMap((c) => {
              try {
                const app = apps.find((a) => a.appId === c.appId);
                if (!app || c.version <= (app.installedVersion ?? 0)) return [];
                const version = session.version(c.appId, c.version);
                const base = version.package.base;
                const applicable = app.installedVersion
                  ? base?.version === app.installedVersion &&
                    base?.digest === app.installedDigest
                  : base === null;
                if (!applicable || version.state !== "VERIFIED") return [];
                const preview = session.preview(c.appId, c.previewId);
                if (
                  preview.version !== c.version ||
                  preview.appDigest !== version.digest
                )
                  return [];
                return [{ ...c, name: version.package.spec.name }];
              } catch (error) {
                if (
                  error instanceof AppError &&
                  error.code === "APP_UNAVAILABLE"
                )
                  return [];
                throw error;
              }
            }),
          asOf,
        });
      }
      if (path === "/api/agent") {
        keys(body, ["requestId", "request"]);
        return send(
          200,
          sofieRequest(store, principal, body.requestId, body.request, asOf),
        );
      }
      if (path !== "/api/app") throw new AppError();
      keys(
        body,
        ["appId", "operation"],
        [
          "version",
          "digest",
          "input",
          "requestKey",
          "previewId",
          "approvalId",
          "revision",
          "enabled",
        ],
      );
      const app = session.get(body.appId);
      if (body.operation === "detail") {
        const version = session.version(body.appId, body.version);
        return send(200, {
          app,
          version,
          history: session.history(body.appId),
        });
      }
      if (body.operation === "preview") {
        const candidate = candidates.find(
          (c) =>
            c.ownerId === owner &&
            c.appId === body.appId &&
            c.previewId === body.previewId,
        );
        if (!candidate) throw new AppError();
        return send(
          200,
          previewSnapshot(
            store,
            principal,
            body.appId,
            body.previewId,
            candidate.creationIntent ?? "crm-request-1",
            asOf,
          ),
        );
      }
      if (body.operation === "requestInstall")
        return send(200, session.requestInstall(body.appId, body.previewId));
      if (body.operation === "approveInstall")
        return send(200, session.approveInstall(body.appId, body.approvalId));
      if (body.operation === "setEnabled")
        return send(200, {
          revision: session.setEnabled(body.appId, body.enabled, body.revision),
        });
      if (QUERIES.some((x) => x.name === body.operation))
        return send(
          200,
          crm.query(
            body.appId,
            body.version,
            body.digest,
            body.operation,
            body.input,
          ),
        );
      if (ACTIONS.some((x) => x.name === body.operation))
        return send(
          200,
          crm.action(
            body.appId,
            body.version,
            body.digest,
            body.operation,
            body.input,
            body.requestKey,
          ),
        );
      throw new AppError();
    } catch (error) {
      const code = error instanceof AppError ? error.code : "INVALID_APP_INPUT";
      send(code === "APP_UNAVAILABLE" ? 404 : 409, { error: code });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
// The fixture launcher is intentionally outside the production application.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { verified, makePackage, principal } =
    await import("../test/fixtures.mjs");
  const store = new ReferenceStore(process.argv[2] ?? ":memory:");
  const pkg = makePackage();
  if (!store.session(principal()).list().length) verified(store, pkg);
  const preview = store.createPreview(pkg.spec.ownerId, pkg.appId, 1);
  const server = await startPrototype({
    store,
    port: 4317,
    candidates: [
      {
        ownerId: pkg.spec.ownerId,
        appId: pkg.appId,
        version: 1,
        previewId: preview.id,
      },
    ],
  });
  console.log(`Synthetic fixture prototype: ${server.origin}`);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await server.close();
      store.close();
      process.exit(0);
    });
}
