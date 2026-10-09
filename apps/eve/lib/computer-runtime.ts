import { agentBrowserRevalidationKey } from "@agent-browser/eve/sandbox";
import { ComputerPreparationError, ComputerTemplateLifecycle, templateFingerprint, type TemplateKey } from "./computer-template-lifecycle.ts";
import { SqlComputerTemplateStore } from "./computer-template-store.ts";
import { vercelTemplateProvider } from "./computer-template-vercel.ts";
import { COMPUTER_RUNTIME_ENABLED } from "./computer-runtime-config.ts";
import evePackage from "eve/package.json" with { type: "json" };
import sandboxPackage from "@vercel/sandbox/package.json" with { type: "json" };

export function computerRuntimeConfigured(env = process.env): boolean {
  return COMPUTER_RUNTIME_ENABLED && !!env.DATABASE_URL && !!env.VERCEL_PROJECT_ID && !!env.VERCEL_TEAM_ID &&
    (!!env.VERCEL_OIDC_TOKEN || (!!env.VERCEL_TOKEN && !!env.VERCEL_TEAM_ID));
}

export function computerTemplateKey(ownerId: string, env = process.env): TemplateKey {
  // Deployment isolation also bounds reuse of Eve's mutable base-image label.
  // Browser version is pinned by agentBrowserRevalidationKey; profiles never enter templates.
  const environment = env.VERCEL_ENV ?? "local";
  const scope = templateFingerprint({ owner: ownerId, environment, project: env.VERCEL_PROJECT_ID ?? "local" });
  return { scope, provider: "vercel", fingerprint: templateFingerprint({
    contract: "myeve-computer-v1", provider: sandboxPackage.version, eve: evePackage.version,
    browser: agentBrowserRevalidationKey(), base: env.MYEVE_COMPUTER_BASE_SNAPSHOT_ID ?? "vercel/eve:latest", architecture: "linux-x64",
    environment, deployment: env.VERCEL_DEPLOYMENT_ID ?? env.VERCEL_URL ?? "local",
  }) };
}

export function computerLifecycle() {
  if (!computerRuntimeConfigured()) throw new ComputerPreparationError("unconfigured");
  return new ComputerTemplateLifecycle(new SqlComputerTemplateStore(), vercelTemplateProvider);
}

export async function prepareComputerRuntime(ownerId: string, signal?: AbortSignal) {
  return computerLifecycle().ensure(computerTemplateKey(ownerId), signal);
}

export type ComputerRuntimeState = "DISABLED" | "NOT_CONFIGURED" | "COLD" | "PREPARING" | "READY" | "UNAVAILABLE";
export async function computerRuntimeReadiness(ownerId: string): Promise<{ state: ComputerRuntimeState; cleanupFailures: number; metrics?: Awaited<ReturnType<SqlComputerTemplateStore["metrics"]>> }> {
  if (!COMPUTER_RUNTIME_ENABLED) return { state: "DISABLED", cleanupFailures: 0 };
  if (!computerRuntimeConfigured()) return { state: "NOT_CONFIGURED", cleanupFailures: 0 };
  try {
    const key = computerTemplateKey(ownerId), lifecycle = computerLifecycle();
    const state = await lifecycle.resolve(key);
    const store = new SqlComputerTemplateStore();
    const [cleanupFailures, metrics] = await Promise.all([store.cleanupFailures(key.scope), store.metrics(key.scope)]);
    return { state, cleanupFailures, metrics };
  } catch { return { state: "UNAVAILABLE", cleanupFailures: 0 }; }
}
