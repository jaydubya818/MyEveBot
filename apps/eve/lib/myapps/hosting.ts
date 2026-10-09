import { readFileSync } from "node:fs";
import type { Principal } from "../../../../packages/myapps/src/store.ts";
import { PersistentApps } from "./runtime.ts";
import { createAppsApi } from "./api.ts";
import { authenticateWebPrincipal } from "../web-auth.ts";
import { requireValue } from "../../../../packages/myapps/src/contracts.ts";
interface LocalBinding {
  apps: PersistentApps;
  policy(owner: string): Promise<Principal>;
}
let local: LocalBinding | null = null;
export const localAppsAllowed = () =>
  process.env.NODE_ENV !== "production" &&
  !process.env.VERCEL &&
  process.env.MYAPPS_LOCAL_INTEGRATION === "1";
/** Explicit trusted local composition. No production singleton, credentials or default owner. */
export function bindLocalApps(binding: LocalBinding) {
  requireValue(localAppsAllowed(), "APP_PRODUCTION_DISABLED");
  local = binding;
}
export function localApps() {
  requireValue(localAppsAllowed() && local, "APP_UNAVAILABLE");
  return local!;
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function handleInstalledApps(
  request: Request,
  authenticate = authenticateWebPrincipal,
) {
  const headers = {
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy":
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
  };
  try {
    const { apps, policy } = localApps();
    const path = new URL(request.url).pathname.replace("/api/myapps", "");
    if (request.method === "POST") {
      const url = new URL(request.url);
      url.pathname = "/api" + path;
      return createAppsApi(
        apps,
        policy,
        authenticate,
      )(new Request(url, request));
    }
    const owner = await authenticate(request, {
      ...process.env,
      NODE_ENV: "production",
    });
    if (!owner)
      return Response.json(
        { error: "Sign in to continue." },
        { status: 401, headers },
      );
    const principal = await policy(owner.id);
    requireValue(
      principal.ownerId === owner.id && principal.kind === "human",
      "APP_UNAVAILABLE",
    );
    await apps.list(principal);
    const asset =
      path === "/ui"
        ? "index.html"
        : path === "/app.js"
          ? "app.js"
          : path === "/app.css"
            ? "app.css"
            : null;
    requireValue(asset, "APP_UNAVAILABLE");
    let content = readFileSync(
      new URL(
        "../../../../packages/myapps/prototype/" + asset,
        import.meta.url,
      ),
      "utf8",
    );
    if (asset === "index.html")
      content = content
        .replace('id="root"', 'id="root" data-owner="' + escape(owner.id) + '"')
        .replace('href="/app.css"', 'href="/api/myapps/app.css"')
        .replace('src="/app.js"', 'src="/api/myapps/app.js"')
        .replace("Apps · MyEve reference", "Installed Apps · MyEve");
    return new Response(content, {
      headers: {
        ...headers,
        "content-type":
          asset === "index.html"
            ? "text/html"
            : asset === "app.js"
              ? "text/javascript"
              : "text/css",
      },
    });
  } catch {
    return Response.json(
      { error: "Installed apps are unavailable. No app was changed." },
      { status: 404, headers },
    );
  }
}

/** The existing Needs You delivery path delegates only exact retained app requests. */
export async function consumeInstalledAppResponse(
  response: import("../universal-inbox/contracts.ts").OwnerResponse,
) {
  if (
    !localAppsAllowed() ||
    !local ||
    !response.action.id.startsWith("sha256:")
  )
    return null;
  const principal = await local.policy(response.ownerId);
  return local.apps.consumeOwnerResponse(principal, response);
}
