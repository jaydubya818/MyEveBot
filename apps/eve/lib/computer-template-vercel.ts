import { Sandbox, Snapshot } from "@vercel/sandbox";
import { installAgentBrowser } from "@agent-browser/eve/sandbox";
import type { ComputerTemplateProvider, Preparation, TemplateFailure } from "./computer-template-lifecycle.ts";

function status(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { status?: number; response?: { status?: number }; cause?: unknown };
  return e.status ?? e.response?.status ?? (e.cause ? status(e.cause) : undefined);
}
export function computerProviderCredentials() {
  return process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID
    ? { token: process.env.VERCEL_TOKEN, teamId: process.env.VERCEL_TEAM_ID, projectId: process.env.VERCEL_PROJECT_ID } : {};
}
const credentials = computerProviderCredentials;
export function preparationResourceName(row: Preparation) { return `myeve-preparation-${row.id}`; }
function owned(sandbox: Sandbox, row: Preparation) {
  return sandbox.name === preparationResourceName(row) && sandbox.tags?.application === "myeve-template-v1"
    && sandbox.tags.preparation === row.id && sandbox.tags.scope === row.scope;
}
async function lookup(row: Preparation, signal: AbortSignal) {
  try { return await Sandbox.get({ ...credentials(), name: preparationResourceName(row), resume: false, signal }); }
  catch (error) { if (status(error) === 404) return null; throw error; }
}
async function attempt(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([work, new Promise(resolve => { timer = setTimeout(resolve, ms); })]); }
  catch { /* The next cleanup step must still run. */ }
  finally { clearTimeout(timer); }
}
async function snapshotAbsent(id: string | null, signal: AbortSignal) {
  if (!id) return true;
  try { return (await Snapshot.get({ ...credentials(), snapshotId: id, signal })).status === "deleted"; }
  catch (error) { if (status(error) === 404) return true; throw error; }
}
export const vercelTemplateProvider: ComputerTemplateProvider = {
  id: "vercel",
  async inspect(row, signal) {
    const sandbox = await lookup(row, signal);
    if (!sandbox) return { state: "MISSING" };
    if (!owned(sandbox, row) || sandbox.tags?.fingerprint !== row.fingerprint || !sandbox.currentSnapshotId || sandbox.status === "failed") return { state: "STALE" };
    try {
      const snapshot = await Snapshot.get({ ...credentials(), snapshotId: sandbox.currentSnapshotId, signal });
      if (snapshot.status !== "created" || (snapshot.expiresAt && snapshot.expiresAt.getTime() <= Date.now())) return { state: "STALE" };
    } catch (error) { if (status(error) === 404) return { state: "MISSING" }; throw error; }
    return { state: "READY", fingerprint: sandbox.tags!.fingerprint, templateId: sandbox.currentSnapshotId };
  },
  async prepare(row, signal) {
    signal.throwIfAborted();
    // The durable preparation UUID is also the provider resource name. Recovery never enumerates resources.
    const options = { ...credentials(), name: preparationResourceName(row), persistent: false, signal,
      resources: { vcpus: 2 }, timeout: Math.max(1, row.deadline - Date.now()), networkPolicy: "allow-all" as const,
      tags: { application: "myeve-template-v1", preparation: row.id, fingerprint: row.fingerprint, scope: row.scope } };
    const baseSnapshot = process.env.MYEVE_COMPUTER_BASE_SNAPSHOT_ID;
    // Create exclusively. Eve's create-or-reconnect helper can retag an existing
    // same-name resource; preparation must never acquire ownership that way.
    const sandbox = baseSnapshot
      ? await Sandbox.create({ ...options, source: { type: "snapshot", snapshotId: baseSnapshot } })
      : await Sandbox.create({ ...options, image: "vercel/eve:latest" });
    if (!owned(sandbox, row)) throw new Error("Invalid preparation identity");
    signal.throwIfAborted();
    // Eve's published image supplies bash; /workspace is its public filesystem contract.
    const baseScript = "set -e; mkdir -p /workspace; command -v bash >/dev/null";
    let base = await sandbox.runCommand({ cmd: "bash", args: ["-lc", baseScript], signal });
    if (base.exitCode !== 0) base = await sandbox.runCommand({ cmd: "sudo", args: ["-n", "bash", "-lc", baseScript], signal });
    if (base.exitCode !== 0) throw new Error("Computer base runtime setup failed");
    // Use Eve's versioned installer, which supports both apt and dnf images.
    await installAgentBrowser({
      id: preparationResourceName(row),
      async run({ command, abortSignal }) {
        const result = await sandbox.runCommand({ cmd: "bash", args: ["-lc", command], signal: abortSignal ?? signal });
        const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()]);
        return { exitCode: result.exitCode, stdout, stderr };
      },
    }, { abortSignal: signal });
    signal.throwIfAborted();
    await sandbox.update({ networkPolicy: "deny-all" }, { signal });
    const snapshot = await sandbox.snapshot({ signal });
    return { templateId: snapshot.snapshotId }; // Provider does not supply an attributable cost here.
  },
  async cleanup(row, signal, identifySnapshot) {
    const sandbox = await lookup(row, signal);
    let snapshotId = row.templateId;
    if (sandbox) {
      if (!owned(sandbox, row)) return false;
      // Never substitute a different snapshot for an already persisted identity.
      if (snapshotId && sandbox.currentSnapshotId && snapshotId !== sandbox.currentSnapshotId) return false;
      snapshotId ??= sandbox.currentSnapshotId ?? null;
      if (snapshotId && identifySnapshot) await identifySnapshot(snapshotId);
      await attempt(sandbox.stop({ signal: AbortSignal.timeout(3_000) }), 3_000);
      await attempt(sandbox.delete({ deleteOrphanSnapshots: true, signal: AbortSignal.timeout(3_000) }), 3_000);
      if (await lookup(row, signal)) return false;
    }
    // Deleting the named Sandbox does not guarantee deletion of its snapshot,
    // particularly after another Sandbox inherited it. Finish in this same claim.
    if (snapshotId) {
      try {
        const snapshot = await Snapshot.get({ ...credentials(), snapshotId, signal });
        if (snapshot.status !== "deleted") await attempt(snapshot.delete({ signal: AbortSignal.any([signal, AbortSignal.timeout(3_000)]) }), 3_000);
      } catch (error) { if (status(error) !== 404) throw error; }
    }
    return snapshotAbsent(snapshotId, signal);
  },
  classify(error): TemplateFailure {
    const code = status(error);
    if (code === 401 || code === 403) return "authentication";
    if (code === 402) return "quota";
    if (code === 429) return "rate_limit";
    if (code && code >= 500) return "provider_unavailable";
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return "timeout";
    return "bootstrap";
  },
};
