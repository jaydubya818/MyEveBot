import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import type { RuntimeHostDeps } from "./host-source.ts";
import { assembleFromProfile, type LauncherDeps } from "./custody-launcher.ts";
import { pgExecutionDatabase } from "./host-source.ts";
import { composeRuntimePorts, type QdevCustody } from "./runtime-ports.ts";
import { assembleHostedCustody, type HostedLauncherDeps } from "./hosted-custody.ts";
import { hostedContext } from "./hosted-http.ts";
import { vercelPrivatePreviewStore } from "./hosted-preview.ts";
import { hostedMarkerPresent } from "../engineering/factory-mailbox.ts";

/**
 * Production startup binding for the protected-custody ports.
 *
 * The qdev host bundle (non-secret, covered by the bundle digest the root already re-proves on every use) may name ONE custody module by absolute
 * path and SHA-256. This loader reads the file, requires its bytes to match the pinned digest, imports exactly those bytes, and asks it for the
 * `QdevCustody` for this bundle. The module is the host's protected part (execution-port runtime, Factory connection, verifier trust set,
 * issuer signer, retained admissions); it is operator-installed code, never request content, never a model argument, and never read from a
 * path the bundle does not pin. Any absence, mismatch or failure yields `null`, which keeps the installation disabled. Nothing here opens a
 * transport, reads a credential value, reserves, dispatches, or grants authority: composeRuntimePorts keeps every adapter's own refusals.
 */
export type CustodyModule = { custody(context: Parameters<NonNullable<RuntimeHostDeps["ports"]>>[0]): QdevCustody | Promise<QdevCustody> };
export type CustodyLoaderDeps = {
  read?(path: string): Promise<Uint8Array>;
  load?(path: string, bytes: Uint8Array): Promise<unknown>;
  /** Launcher collaborators for a bundle `assembly` profile. Production defaults apply when absent. */
  launcher?: LauncherDeps;
  /** Hosted private-beta launcher (null = none). Default: present only when MYEVE_HOSTED_PROFILE configures this deployment as a hosted installation. */
  hosted?: HostedLauncherDeps | null;
  /** Environment consulted for hosted markers (default process.env). */
  env?: Readonly<Record<string, string | undefined>>;
};
function hostedLauncherFromEnv(env: Readonly<Record<string, string | undefined>>): HostedLauncherDeps | null {
  const context = hostedContext(env);
  return context ? { hosted: context.profile, mailboxDb: context.db, blob: vercelPrivatePreviewStore(), database: pgExecutionDatabase } : null;
}
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function loadCustody(context: Parameters<NonNullable<RuntimeHostDeps["ports"]>>[0], deps: CustodyLoaderDeps = {}): Promise<QdevCustody | null> {
  // Hosted mode is decided BEFORE any launcher or custody-module selection, and it fails closed: any hosted marker in the environment (even a
  // malformed or foreign MYEVE_HOSTED_PROFILE), or an injected hosted launcher, means only the hosted launcher may run. If it cannot be built
  // (invalid profile, foreign owner, missing database) the installation stays disabled; it never falls through to the owner-local launcher
  // (loopback Factory, Docker, local release root) or to a pinned custody module.
  const env = deps.env ?? process.env;
  const marked = hostedMarkerPresent(env);
  const hosted = deps.hosted !== undefined ? deps.hosted : (marked ? hostedLauncherFromEnv(env) : null);
  if (marked || hosted) {
    if (!hosted || !context.bundle.assembly) return null;
    return assembleHostedCustody(context, hosted);
  }
  // A non-secret assembly profile is launched from the existing qualified bodies; it is mutually exclusive with a pinned custody module (schema-enforced).
  if (context.bundle.assembly) return assembleFromProfile(context, deps.launcher ?? { database: pgExecutionDatabase });
  const pin = (context.bundle as { custody?: { module: string; sha256: string } }).custody;
  if (!pin || !/^[a-f0-9]{64}$/.test(pin.sha256)) return null;
  if (!isAbsolute(pin.module) || normalize(pin.module) !== pin.module || !/\.m?js$/.test(pin.module) || /[\0?#]/.test(pin.module)) return null;
  const bytes = await (deps.read ?? (path => readFile(path)))(pin.module);
  if (sha256(bytes) !== pin.sha256) return null;
  // Import exactly the verified bytes: a data: URL carries them, so a path swapped after the hash cannot be what runs.
  const loaded = await (deps.load ?? ((path, verified) => import(`data:text/javascript;base64,${Buffer.from(verified).toString("base64")}#${pathToFileURL(path).pathname}`)))(pin.module, bytes);
  const custody = (loaded as Partial<CustodyModule> | null)?.custody;
  if (typeof custody !== "function") return null;
  return await custody(context);
}

/** The production `ports` provider: pinned custody module -> composed runtime ports, or null (disabled). Throws only for a configured hosted installation. */
export const productionRuntimePorts: NonNullable<RuntimeHostDeps["ports"]> = async context => {
  try {
    const custody = await loadCustody(context);
    if (!custody && hostedMarkerPresent(process.env)) throw Object.assign(new Error("HOSTED_CUSTODY_UNAVAILABLE"), { code: "HOSTED_CUSTODY_UNAVAILABLE" });
    return custody ? composeRuntimePorts(context, custody) : null;
  } catch (error) {
    // A configured hosted installation fails LOUDLY: its configuration error is reported (code only, never values) and rethrown, so a broken
    // hosted deployment is visible instead of silently disabled. Non-hosted installations keep the fail-closed null.
    if (hostedMarkerPresent(process.env)) {
      console.error("[hosted] custody unavailable:", (error as { code?: string })?.code ?? (error as Error)?.name ?? "ERROR");
      throw error;
    }
    return null;
  }
};
