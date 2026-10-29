import { SyncRedactor } from "@doist/piiranha";
import { isSpanContextValid, trace } from "@opentelemetry/api";

export type RaindropProperties = Readonly<Record<string, unknown>>;
export interface RaindropTurnSnapshot {
  readonly eventId: string;
  readonly event: string;
  readonly userId: string;
  readonly convoId: string;
  readonly timestamp: string;
  readonly input?: string;
  readonly output?: string;
  readonly properties: RaindropProperties;
}

export const RAINDROP_API_URL = "https://api.raindrop.ai/v1/";
export const RAINDROP_EVENT_BUDGET_MS = 5_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRY_DELAY_MS = 30_000;
const TEXT_LIMIT = 1_000_000;
const TRUNCATION_MARKER = "...[truncated by raindrop]";

/** Existing server-controlled deployment metadata; never read from chat input. */
export function raindropDeploymentProvenance(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<Record<string, string | boolean>> {
  const properties: Record<string, string | boolean> = {};
  const validSha = (value: string | undefined) => value !== undefined && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);
  const flag = (value: string | undefined) => value === "true" || value === "1" ? true
    : value === "false" || value === "0" ? false : undefined;
  const dirty = flag(env.RAINDROP_COMMIT_DIRTY);
  if (dirty !== undefined) properties["raindrop.app.commit_dirty"] = dirty;
  if (env.RAINDROP_BRANCH !== undefined && env.RAINDROP_BRANCH.length <= 1024) {
    properties["raindrop.app.branch"] = env.RAINDROP_BRANCH;
  }
  if (env.RAINDROP_COMMIT_SHA !== undefined) {
    if (validSha(env.RAINDROP_COMMIT_SHA)) properties["raindrop.app.commit_sha"] = env.RAINDROP_COMMIT_SHA;
    return Object.freeze(properties);
  }
  if (flag(env.RAINDROP_GIT_AUTO_DETECT) === false || env.RAINDROP_GIT_SOURCE_DIRECTORY?.trim()) return Object.freeze(properties);
  // These installations use Vercel. Do not infer another repository's identity
  // or start SDK Git/Workshop discovery processes from a hosted application.
  if (env.VERCEL?.trim() && flag(env.VERCEL) !== false && validSha(env.VERCEL_GIT_COMMIT_SHA)) {
    properties["raindrop.app.commit_sha"] = env.VERCEL_GIT_COMMIT_SHA!;
    if (properties["raindrop.app.branch"] === undefined && flag(env.RAINDROP_GIT_DETECT_BRANCH) === true
      && env.VERCEL_GIT_COMMIT_REF?.trim() && env.VERCEL_GIT_COMMIT_REF.length <= 1024) {
      properties["raindrop.app.branch"] = env.VERCEL_GIT_COMMIT_REF.trim();
    }
  }
  return Object.freeze(properties);
}

/** Explicit operation/span provenance wins; never mix two source identities. */
export function mergeRaindropProvenance<T>(
  properties: Readonly<Record<string, T>>,
  provenance: Readonly<Record<string, string | boolean>>,
  spanAliases = false,
  explicitDefaults: ReadonlySet<string> = new Set(),
): Record<string, T | string | boolean> {
  const automatic = { ...provenance };
  const override = (key: string) => [key, ...(spanAliases
    ? [`ai.telemetry.metadata.${key}`, `traceloop.association.properties.${key}`] : [])]
    .find(name => Object.hasOwn(properties, name));
  const commit = override("raindrop.app.commit_sha");
  if (commit !== undefined && properties[commit] !== provenance["raindrop.app.commit_sha"]) {
    for (const key of ["raindrop.app.commit_dirty", "raindrop.app.branch"]) {
      if (!explicitDefaults.has(key)) delete automatic[key];
    }
  }
  for (const key of ["raindrop.app.commit_sha", "raindrop.app.commit_dirty", "raindrop.app.branch"]) {
    if (override(key) !== undefined) delete automatic[key];
  }
  return { ...automatic, ...properties };
}

export function raindropExplicitProvenanceKeys(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ReadonlySet<string> {
  return new Set(Object.keys(raindropDeploymentProvenance({
    RAINDROP_COMMIT_SHA: env.RAINDROP_COMMIT_SHA, RAINDROP_COMMIT_DIRTY: env.RAINDROP_COMMIT_DIRTY,
    RAINDROP_BRANCH: env.RAINDROP_BRANCH, RAINDROP_GIT_AUTO_DETECT: "false",
  })));
}

// Preserve the existing local regex policy, including its category order and
// labels. Piiranha's per-rule replaceWith is ignored by its published build;
// one public redactor per category uses its supported global replacement.
const categories = ["creditCardNumber", "streetAddress", "zipcode", "phoneNumber",
  "ipAddress", "usSocialSecurityNumber", "emailAddress", "username", "password",
  "credentials", "digits", "url", "names"] as const;
const enabledCategories = [
  ["creditCardNumber", "<REDACTED CREDIT CARD NUMBER>"],
  ["streetAddress", "<REDACTED ADDRESS>"],
  ["phoneNumber", "<REDACTED PHONE NUMBER>"],
  ["usSocialSecurityNumber", "<REDACTED SOCIAL SECURITY NUMBER>"],
  ["emailAddress", "<REDACTED EMAIL>"],
  ["password", "<REDACTED SECRET>"],
  ["credentials", "<REDACTED CREDENTIALS>"],
] as const;
let redactors: readonly SyncRedactor[] | undefined;

export function redactRaindropText(text: string): string {
  try {
    redactors ??= enabledCategories.map(([category, globalReplaceWith]) => new SyncRedactor({
      globalReplaceWith,
      builtInRedactors: Object.fromEntries(categories.map(name => [name, { enabled: name === category }])),
    }));
    const bounded = text.length <= TEXT_LIMIT ? text
      : text.slice(0, TEXT_LIMIT - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
    // Any redaction error rejects before serialization/network.
    return redactors.reduce((value, redactor) => redactor.redact(value), bounded);
  } catch {
    throw new Error("Raindrop local redaction failed");
  }
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (value === null) return undefined;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.min(MAX_RETRY_DELAY_MS, Math.max(0, delay)) : undefined;
}

/** Manual full-snapshot events only: no automatic events, tracing or Workshop. */
export class RaindropTurnClient {
  private readonly pending = new Map<string, Promise<void>>();
  private readonly endpoint: URL;
  private readonly fetchRequest: typeof fetch;
  private readonly provenance = raindropDeploymentProvenance();
  private readonly explicitProvenanceKeys = raindropExplicitProvenanceKeys();

  constructor(private readonly writeKey: string, options: {
    readonly endpoint?: string;
    readonly fetchRequest?: typeof fetch;
  } = {}) {
    this.endpoint = new URL("events/track_partial", options.endpoint ?? RAINDROP_API_URL);
    this.fetchRequest = options.fetchRequest ?? fetch;
  }

  publish(snapshot: RaindropTurnSnapshot, deadline = Date.now() + RAINDROP_EVENT_BUDGET_MS): Promise<void> {
    // A terminal snapshot waits for this event's running request/retries. No
    // process-local begin state is needed after a durable workflow restart.
    const previous = this.pending.get(snapshot.eventId) ?? Promise.resolve();
    const active = trace.getActiveSpan()?.spanContext();
    const traceId = active !== undefined && isSpanContextValid(active) ? active.traceId : undefined;
    const send = previous.catch(() => undefined).then(() => this.send(snapshot, traceId, deadline));
    const settled = send.finally(() => {
      if (this.pending.get(snapshot.eventId) === settled) this.pending.delete(snapshot.eventId);
    });
    this.pending.set(snapshot.eventId, settled);
    return settled;
  }

  private async send(snapshot: RaindropTurnSnapshot, traceId: string | undefined, deadline: number): Promise<void> {
    if (Date.now() >= deadline) throw new Error("Raindrop event export deadline exceeded");
    const body = JSON.stringify({
      event_id: snapshot.eventId, user_id: snapshot.userId, event: snapshot.event,
      timestamp: snapshot.timestamp,
      ai_data: {
        ...(snapshot.input === undefined ? {} : { input: redactRaindropText(snapshot.input) }),
        ...(snapshot.output === undefined ? {} : { output: redactRaindropText(snapshot.output) }),
        convo_id: snapshot.convoId,
      },
      properties: { ...mergeRaindropProvenance(snapshot.properties, this.provenance, false, this.explicitProvenanceKeys), ...(traceId === undefined ? {} : { trace_id: traceId }), $context: {
        library: { name: "myeve-http", version: "1" },
        metadata: { jsRuntime: "node", nodeVersion: process.version },
      } },
      // Preserve the existing hook's finalized running-event visibility.
      is_pending: false,
    });
    let delay = 0;
    let status: number | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, Math.min(delay, Math.max(0, deadline - Date.now()))));
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Raindrop event export deadline exceeded");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(REQUEST_TIMEOUT_MS, remaining));
      try {
        const response = await this.fetchRequest(this.endpoint, {
          method: "POST", redirect: "error",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.writeKey}` },
          body, signal: controller.signal,
        });
        status = response.status;
        // Never read or log ingest response bodies, which may echo content.
        void response.body?.cancel().catch(() => undefined);
        if (response.ok) return;
        delay = retryAfter(response) ?? 500 * 2 ** attempt;
      } catch {
        status = undefined;
        delay = 500 * 2 ** attempt;
      } finally {
        clearTimeout(timeout);
      }
      if (Date.now() >= deadline) throw new Error("Raindrop event export deadline exceeded");
    }
    // Unlike the old SDK's public finish wrapper, failure reaches the hook's
    // bounded terminal retry loop. It still cannot fail the user's turn.
    throw new Error(`Raindrop event export failed after 3 attempts${status === undefined ? "" : ` (HTTP ${status})`}`);
  }
}
