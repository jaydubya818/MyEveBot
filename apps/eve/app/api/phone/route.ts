import {
  AgentPhoneError,
  agentPhoneKeyHint,
  agentPhoneKeySource,
  agentPhoneView,
  describeAgentPhoneError,
  listPhoneContacts,
  phoneRegistrationStatus,
  provisionPhone,
  releasePhone,
  setAppAgentPhoneKey,
  setPhoneContact,
  setPhoneOwnerNumber,
  setPhoneSafety,
} from "@/agent/lib/effect/agentphone";
import { runTool } from "@/agent/lib/effect/runtime";
import { requestOrigin } from "@/lib/app-url";
import { phoneAuthState, requirePhoneAdmin } from "@/lib/phone-auth";
import { requireWebAuth } from "@/lib/web-auth";

// Backs Manage -> Phone: the API key, provisioning the number, telling the
// agent whose texts are the owner's, and the 10DLC registration status.
//
// Every response carries the full current state so the panel updates without
// a second round trip, matching app/api/computer/route.ts.

function hasDatabase(): boolean {
  return (process.env.DATABASE_URL ?? "").trim().length > 0;
}

/**
 * The origin AgentPhone should deliver webhooks to. The stable production
 * domain wins over the per-deployment URL, because a webhook registered
 * against a preview URL stops working the moment that deployment is replaced.
 *
 * Deliberately NOT derived from the request in production. `requestOrigin`
 * reflects Host / X-Forwarded-Host, which the caller controls, so trusting it
 * would let anyone who can reach this route repoint the webhook at a host of
 * their choosing — handing them every signed inbound payload and cutting this
 * deployment off from its own line. Only an explicit env value, or a loopback
 * origin in local development, is accepted.
 */
function deploymentOrigin(request: Request): string | null {
  const configured = process.env.AGENTPHONE_CALLBACK_ORIGIN?.trim();
  if (configured !== undefined && configured.length > 0) return configured.replace(/\/+$/, "");

  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? null;
  if (host !== null && host.length > 0) return `https://${host}`;

  // Local development: a loopback origin cannot be pointed anywhere useful by
  // an attacker, and the alternative is being unable to develop at all.
  const origin = requestOrigin(request);
  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return origin;
  } catch {
    // Unparseable origin reads as untrusted.
  }
  return null;
}

async function currentState(
  request: Request,
  extra: Record<string, unknown> = {},
): Promise<Response> {
  const auth = phoneAuthState(request);
  const keySource = await agentPhoneKeySource();
  if (keySource === null) {
    return Response.json({
      enabled: false,
      keySource: null,
      hasDatabase: hasDatabase(),
      ...auth,
      ...extra,
    });
  }

  const [hint, phone, contacts] = await Promise.all([
    agentPhoneKeyHint(),
    runTool(agentPhoneView()).catch(() => null),
    runTool(listPhoneContacts()).catch(() => []),
  ]);

  // Registration only matters once a number exists, and it is a live API call,
  // so it is not worth making on every poll before then.
  const registration =
    phone?.numberId == null
      ? null
      : await runTool(phoneRegistrationStatus()).catch(() => null);

  return Response.json({
    enabled: true,
    keySource,
    keyHint: hint,
    hasDatabase: hasDatabase(),
    phone,
    contacts,
    registration,
    ...auth,
    ...extra,
  });
}

function failure(error: unknown, status = 400): Response {
  return Response.json(
    {
      error:
        error instanceof AgentPhoneError
          ? describeAgentPhoneError(error)
          : error instanceof Error
            ? error.message
            : "The phone request failed.",
    },
    { status },
  );
}

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;
  try {
    return await currentState(request);
  } catch (error) {
    return failure(error, 502);
  }
}

/** Save an app-managed key. The environment key, if any, is untouched. */
export async function PUT(request: Request): Promise<Response> {
  const denied = requireWebAuth(request) ?? requirePhoneAdmin(request);
  if (denied) return denied;

  if (!hasDatabase()) {
    return Response.json(
      {
        error:
          "Storing a key in the app needs a database (DATABASE_URL); set AGENTPHONE_API_KEY in the environment instead.",
      },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { apiKey?: unknown } | null;
  const key = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (key.length < 8 || key.length > 200) {
    return Response.json({ error: "That does not look like an API key." }, { status: 400 });
  }

  try {
    await setAppAgentPhoneKey(key);
    return await currentState(request);
  } catch (error) {
    return failure(error);
  }
}

/** Clear the app-managed key. A key from the environment is untouchable here. */
export async function DELETE(request: Request): Promise<Response> {
  const denied = requireWebAuth(request) ?? requirePhoneAdmin(request);
  if (denied) return denied;
  try {
    await setAppAgentPhoneKey(null);
    return await currentState(request);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const webDenied = requireWebAuth(request);
  if (webDenied) return webDenied;

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    areaCode?: unknown;
    ownerNumber?: unknown;
    operationalEnabled?: unknown;
    dailyMessageLimit?: unknown;
    dailyCallLimit?: unknown;
    quietHoursStart?: unknown;
    quietHoursEnd?: unknown;
    timezone?: unknown;
    phoneNumber?: unknown;
    consentStatus?: unknown;
    consentSource?: unknown;
  } | null;
  const action = typeof body?.action === "string" ? body.action : "";
  // Emergency shutdown never spends money or expands access. Keep it
  // available to the authenticated owner even if the separate admin token is
  // unavailable during an incident; every enabling/configuration action still
  // requires the stronger phone-management gate.
  const emergencyDisable = action === "safety" && body?.operationalEnabled === false;
  if (!emergencyDisable) {
    const adminDenied = requirePhoneAdmin(request);
    if (adminDenied) return adminDenied;
  }

  try {
    if (action === "provision") {
      const origin = deploymentOrigin(request);
      if (origin === null) {
        // Buying a number and pointing it at a guessed host is worse than
        // not buying one: the webhook would be registered somewhere this
        // deployment does not control, and it still bills $3/month.
        return Response.json(
          {
            error:
              "No trusted callback origin. Set AGENTPHONE_CALLBACK_ORIGIN to this deployment's public https origin (Vercel deployments pick it up automatically).",
          },
          { status: 503 },
        );
      }
      const areaCode = typeof body?.areaCode === "string" ? body.areaCode.trim() : "";
      await runTool(
        provisionPhone({
          callbackUrl: `${origin}/eve/v1/agentphone/inbound`,
          ...(areaCode.length > 0 ? { areaCode } : {}),
        }),
      );
      return await currentState(request);
    }

    if (action === "release") {
      await runTool(releasePhone());
      return await currentState(request);
    }

    if (action === "owner") {
      const ownerNumber =
        typeof body?.ownerNumber === "string" && body.ownerNumber.trim().length > 0
          ? body.ownerNumber.trim()
          : null;
      await runTool(setPhoneOwnerNumber(ownerNumber));
      return await currentState(request);
    }

    if (action === "safety") {
      if (
        typeof body?.operationalEnabled !== "boolean" ||
        typeof body?.dailyMessageLimit !== "number" ||
        typeof body?.dailyCallLimit !== "number" ||
        typeof body?.quietHoursStart !== "number" ||
        typeof body?.quietHoursEnd !== "number" ||
        typeof body?.timezone !== "string"
      ) {
        return Response.json({ error: "Complete phone safety policy is required." }, { status: 400 });
      }
      const currentSafety = emergencyDisable
        ? (await runTool(agentPhoneView())).safety
        : null;
      await runTool(
        setPhoneSafety({
          operationalEnabled: emergencyDisable ? false : body.operationalEnabled,
          dailyMessageLimit: currentSafety?.dailyMessageLimit ?? body.dailyMessageLimit,
          dailyCallLimit: currentSafety?.dailyCallLimit ?? body.dailyCallLimit,
          quietHoursStart: currentSafety?.quietHoursStart ?? body.quietHoursStart,
          quietHoursEnd: currentSafety?.quietHoursEnd ?? body.quietHoursEnd,
          timezone: currentSafety?.timezone ?? body.timezone.trim(),
        }),
      );
      return await currentState(request);
    }

    if (action === "contact") {
      if (
        typeof body?.phoneNumber !== "string" ||
        (body?.consentStatus !== "allowed" && body?.consentStatus !== "blocked") ||
        typeof body?.consentSource !== "string"
      ) {
        return Response.json({ error: "Phone, consent status, and source are required." }, { status: 400 });
      }
      await runTool(
        setPhoneContact({
          phoneNumber: body.phoneNumber,
          consentStatus: body.consentStatus,
          consentSource: body.consentSource,
        }),
      );
      return await currentState(request);
    }

    return Response.json({ error: `Unknown action ${action || "(none)"}.` }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
