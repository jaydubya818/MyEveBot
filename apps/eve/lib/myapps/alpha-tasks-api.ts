import {
  keys,
  requireValue,
  AppError,
} from "../../../../packages/myapps/src/contracts.ts";
import type { Principal } from "../../../../packages/myapps/src/store.ts";
import type { AlphaTasksApps } from "./alpha-tasks.ts";
import { authenticateWebPrincipal, requireSameOrigin } from "../web-auth.ts";
import { boundedJson } from "../relay/client.ts";
/** Shared typed UI/agent adapter. No route, feature flag or production bootstrap is enabled here.
 * Authentication and current capability policy supply Principal; never parse it from a body. */
export function alphaTasksCommands(apps: AlphaTasksApps) {
  return async (p: Principal, input: unknown) => {
    if (
      input &&
      typeof input === "object" &&
      "operation" in input &&
      input.operation === "catalog"
    ) {
      keys(input, ["operation"]);
      return { apps: await apps.catalog(p) };
    }
    keys(
      input,
      ["operation", "appId"],
      [
        "version",
        "digest",
        "previewId",
        "responseId",
        "requestKey",
        "input",
        "revision",
        "enabled",
        "approvalId",
        "approvalAction",
        "approvalBinding",
        "approvalRevision",
        "answer",
      ],
    );
    requireValue(
      typeof input.appId === "string" && /^app_[a-f0-9]{32}$/.test(input.appId),
      "APP_INPUT_INVALID",
    );
    switch (input.operation) {
      case "preview":
        return apps.preview(p, input.appId, input.version);
      case "requestInstall": {
        const item = await apps.requestInstall(p, input.appId, input.previewId);
        return {
          id: item.id,
          actionId: item.action!.id,
          binding: item.actionBinding,
          revision: item.revision,
        };
      }
      case "decideInstall": {
        requireValue(
          p.kind === "human" &&
            p.actorId === p.ownerId &&
            p.allowedOperations.includes("apps.install"),
          "INSTALLATION_APPROVAL_REQUIRED",
        );
        requireValue(
          ["Install privately", "Decline"].includes(input.answer),
          "APP_INPUT_INVALID",
        );
        const response = await apps.inbox(p.ownerId).respond({
          itemId: input.approvalId,
          actionId: input.approvalAction,
          actionBinding: input.approvalBinding,
          expectedRevision: input.approvalRevision,
          idempotencyKey: "install:" + input.approvalId,
          answer: input.answer,
        });
        return apps.install(p, input.appId, response.id);
      }
      case "install":
        return apps.install(p, input.appId, input.responseId);
      case "rollbackCandidate":
        return apps.rollbackCandidate(p, input.appId, input.version);
      case "setEnabled":
        return apps.setEnabled(p, input.appId, input.revision, input.enabled);
      case "list":
      case "create":
      case "update":
      case "render":
        return apps.operate(
          p,
          input.appId,
          input.version,
          input.digest,
          input.operation,
          input.input ?? {},
          input.requestKey,
        );
      default:
        throw Error("APP_OPERATION_DENIED");
    }
  };
}

/** Mounted only through the existing explicit local host binding. */
export function createAlphaTasksApi(
  apps: AlphaTasksApps,
  policy: (owner: string) => Promise<Principal>,
  authenticate = authenticateWebPrincipal,
) {
  const commands = alphaTasksCommands(apps);
  return async (request: Request) => {
    const headers = {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    };
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
        principal.ownerId === owner.id &&
          principal.actorId === owner.id &&
          principal.kind === "human",
        "APP_UNAVAILABLE",
      );
      return Response.json(
        await commands(
          principal,
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
