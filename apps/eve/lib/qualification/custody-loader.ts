import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import type { RuntimeHostDeps } from "./host-source.ts";
import { assembleFromProfile, type LauncherDeps } from "./custody-launcher.ts";
import { pgExecutionDatabase } from "./host-source.ts";
import { composeRuntimePorts, type QdevCustody } from "./runtime-ports.ts";

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
};
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function loadCustody(context: Parameters<NonNullable<RuntimeHostDeps["ports"]>>[0], deps: CustodyLoaderDeps = {}): Promise<QdevCustody | null> {
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

/** The production `ports` provider: pinned custody module -> composed runtime ports, or null (disabled). Never throws. */
export const productionRuntimePorts: NonNullable<RuntimeHostDeps["ports"]> = async context => {
  try {
    const custody = await loadCustody(context);
    return custody ? composeRuntimePorts(context, custody) : null;
  } catch { return null; }
};
