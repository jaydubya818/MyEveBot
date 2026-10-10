import {
  keys,
  ACTIONS,
  QUERIES,
  requireValue,
  AppError,
} from "../../../../packages/myapps/src/contracts.ts";
import type { Principal } from "../../../../packages/myapps/src/store.ts";
import { PersistentApps } from "./runtime.ts";
import { authenticateWebPrincipal, requireSameOrigin } from "../web-auth.ts";
import { boundedJson } from "../relay/client.ts";

/** Same application adapter for authenticated MyEve UI and deterministic browser qualification. */
export function appCommands(
  apps: PersistentApps,
  buildRequest?: (
    p: Principal,
    requestId: string,
    request: string,
  ) => Promise<unknown>,
) {
  return async (p: Principal, path: string, body: any): Promise<any> => {
    if (path === "/api/apps") {
      keys(body, []);
      return {
        apps: await apps.list(p),
        candidates: await apps.offers(p),
        asOf: new Date().toISOString().slice(0, 10),
        buildEnabled: Boolean(buildRequest),
      };
    }
    if (path === "/api/agent") {
      keys(body, ["requestId", "request"]);
      const agent = {
        ...p,
        kind: "agent" as const,
        allowedOperations: p.allowedOperations.filter(
          (o) => o !== "apps.install",
        ),
      };
      if (
        [
          "Build me a CRM to track leads.",
          "Add a priority field.",
          "Roll back CRM behavior.",
        ].includes(body.request)
      ) {
        requireValue(buildRequest, "APP_UNAVAILABLE");
        return buildRequest(agent, body.requestId, body.request);
      }
      return apps.sofie(agent, body.requestId, body.request);
    }
    requireValue(path === "/api/app", "APP_UNAVAILABLE");
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
        "approvalBinding",
        "approvalRevision",
        "approvalAction",
        "revision",
        "enabled",
      ],
    );
    const {
      appId: id,
      operation,
      version,
      digest: hash,
      input,
      requestKey,
    } = body;
    if (operation === "detail") return apps.detail(p, id, version);
    if (operation === "preview") return apps.previewData(p, id, body.previewId);
    if (operation === "requestInstall") {
      const item = await apps.requestInstall(p, id, body.previewId);
      return {
        id: item.id,
        actionId: item.action!.id,
        binding: item.actionBinding,
        revision: item.revision,
      };
    }
    if (operation === "approveInstall") {
      requireValue(
        p.kind === "human" && p.allowedOperations.includes("apps.install"),
        "APP_UNAVAILABLE",
      );
      const response = await apps.inbox(p.ownerId).respond({
        itemId: body.approvalId,
        actionId: body.approvalAction,
        actionBinding: body.approvalBinding,
        expectedRevision: body.approvalRevision,
        idempotencyKey: "install:" + body.approvalId,
        answer: "Install privately",
      });
      return apps.install(p, id, response.id);
    }
    if (operation === "setEnabled")
      return apps.setEnabled(p, id, body.enabled, body.revision);
    if (
      ACTIONS.some((o) => o.name === operation) ||
      QUERIES.some((o) => o.name === operation)
    )
      return apps.operate(p, id, version, hash, operation, input, requestKey);
    throw new AppError();
  };
}
/** Production authentication is reused. Policy is a trusted server adapter, never request parameters.
 * This factory does not mount routes, enable production or mint executable grants. */
export function createAppsApi(
  apps: PersistentApps,
  policy: (owner: string) => Promise<Principal>,
  authenticate = authenticateWebPrincipal,
) {
  const commands = appCommands(apps);
  return async (request: Request) => {
    const headers = { "cache-control": "private, no-store" };
    try {
      if (!apps.host.enabled())
        return Response.json(
          { error: "APP_UNAVAILABLE" },
          { status: 404, headers },
        );
      const owner = await authenticate(request, {
        ...process.env,
        NODE_ENV: "production",
      });
      if (!owner)
        return Response.json(
          { error: "Sign in to continue." },
          { status: 401, headers },
        );
      if (request.method !== "POST" || requireSameOrigin(request))
        return Response.json(
          { error: "Same-origin POST required." },
          { status: 403, headers },
        );
      const principal = await policy(owner.id);
      requireValue(
        principal.ownerId === owner.id && principal.kind === "human",
        "APP_UNAVAILABLE",
      );
      return Response.json(
        await commands(
          principal,
          new URL(request.url).pathname,
          await boundedJson(new Response(request.body), 20000),
        ),
        { headers },
      );
    } catch (error) {
      return Response.json(
        { error: error instanceof AppError ? error.code : "APP_UNAVAILABLE" },
        { status: 409, headers },
      );
    }
  };
}
