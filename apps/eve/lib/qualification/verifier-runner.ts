import { spawn } from "node:child_process";
import { EvaluatorNotQuiescent, type EvaluatorResult, type QuiescentEvaluator } from "./verifier-service.ts";

/**
 * Generic production runner body for the verifier's protected evaluator: it executes the evaluator as an OWNED child process (its own process
 * group), hands it the handoff, candidate identity and charged budget on stdin only, reads one strictly-validated JSON result from stdout, and
 * settles ONLY after the WHOLE process group has ceased. Leader exit is not group cessation: on every completion path (normal exit, error,
 * output overflow, abort) the group is SIGKILLed and then observed gone (`kill(-pgid, 0)` reporting ESRCH) within a bound; a group that is
 * still alive after that bound, and a failed or overlong `cleanup` (for example removing a named container), mean cessation is not proven and
 * are reported as EvaluatorNotQuiescent, never as success.
 *
 * The evaluator command, its image/criteria and any credential it needs are protected custody; none is read here. The child receives an empty
 * environment plus the entries the host lists explicitly, so no ambient credential is inherited. Descendants that leave the process group and
 * hold no stdio pipe are outside what a process group can prove: such an evaluator must be a named container removed by `cleanup`. The runner cannot enforce a provider-side spend
 * cap by itself: the budget is passed to the evaluator, and the service rejects any report above the charged reserve (and any non-zero report for
 * an evaluator declared unpaid).
 */
export type ProcessEvaluatorConfig = {
  command: string; args: string[]; cwd?: string;
  /** The ONLY environment the child sees. */
  env?: Record<string, string>;
  maxOutputBytes?: number;
  /** Bound for the process group to be observed gone after it is killed (default 2000 ms). */
  groupExitTimeoutMs?: number;
  /** Bound for `cleanup` (default 20000 ms); exceeding it is not proven cessation. */
  cleanupTimeoutMs?: number;
  /** Runs after the child is reaped (for a container: remove it by its identifiable name). Must throw when cessation cannot be proven. */
  cleanup?(): Promise<void>;
  /** Optional hook for tests/observability: receives the child's pid once spawned. */
  onSpawn?(pid: number): void;
};

/** Kills every member of the group and polls until none remains; false when members are still alive at the bound. */
async function groupGone(pgid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { process.kill(-pgid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return true; }
    try { process.kill(-pgid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return true; }
    if (Date.now() >= deadline) return false;
    await new Promise(r => setTimeout(r, 10));
  }
}

export function processEvaluator(c: ProcessEvaluatorConfig): QuiescentEvaluator {
  const maxOutput = c.maxOutputBytes ?? 64 * 1024, groupTimeout = c.groupExitTimeoutMs ?? 2_000, cleanupTimeout = c.cleanupTimeoutMs ?? 20_000;
  return {
    run(input, context) {
      return new Promise<EvaluatorResult>((resolve, reject) => {
        if (context.signal.aborted) return reject(new Error("QDEV_EVALUATOR_ABORTED_BEFORE_START"));
        const child = spawn(c.command, c.args, { cwd: c.cwd, env: { ...(c.env ?? {}) } as NodeJS.ProcessEnv, detached: true, stdio: ["pipe", "pipe", "ignore"] });
        let output = "", overflow = false, failure: Error | null = null, spawnFailed = false;
        const killGroup = () => { if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ } } };
        const onAbort = () => { failure ??= new Error("QDEV_EVALUATOR_ABORTED"); killGroup(); };
        context.signal.addEventListener("abort", onAbort, { once: true });
        if (child.pid) c.onSpawn?.(child.pid);
        child.stdout!.setEncoding("utf8");
        child.stdout!.on("data", chunk => {
          output += chunk;
          if (Buffer.byteLength(output) > maxOutput) { overflow = true; failure ??= new Error("QDEV_EVALUATOR_OUTPUT_LIMIT"); killGroup(); }
        });
        child.stdin!.on("error", () => { /* child exited before reading its input */ });
        child.stdin!.end(JSON.stringify({ handoff: input.handoff, candidate: input.candidate, budgetMicrousd: context.budgetMicrousd }));
        child.on("error", error => { spawnFailed = true; failure ??= error; });
        // The leader exiting says nothing about its descendants (which may also be holding stdout open): end the group as soon as it exits.
        child.on("exit", killGroup);
        child.on("close", async (code, signal) => {
          context.signal.removeEventListener("abort", onAbort);
          if (child.pid && !(await groupGone(child.pid, groupTimeout))) return reject(new EvaluatorNotQuiescent("process group still alive"));
          try {
            let timer: ReturnType<typeof setTimeout> | undefined;
            await Promise.race([Promise.resolve(c.cleanup?.()), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("cleanup timed out")), cleanupTimeout); })]).finally(() => clearTimeout(timer));
          } catch (error) { return reject(new EvaluatorNotQuiescent(error instanceof Error ? error.message : "cleanup failed")); }
          if (spawnFailed) return reject(failure!);
          if (failure || overflow) return reject(failure ?? new Error("QDEV_EVALUATOR_OUTPUT_LIMIT"));
          if (code !== 0 || signal) return reject(new Error("QDEV_EVALUATOR_EXIT"));
          try {
            const parsed = JSON.parse(output) as Partial<EvaluatorResult>;
            if (!parsed || typeof parsed !== "object" || Object.keys(parsed).sort().join(",") !== "outcome,usedMicrousd") throw new Error("shape");
            resolve({ outcome: parsed.outcome as EvaluatorResult["outcome"], usedMicrousd: parsed.usedMicrousd as number });
          } catch { reject(new Error("QDEV_EVALUATOR_OUTPUT")); }
        });
      });
    },
  };
}

/** Cleanup for a named, labelled container: `docker rm -f` must succeed (or report the container absent) before cessation is claimed. */
export function dockerRemoveCleanup(name: string, docker = "docker"): () => Promise<void> {
  if (!/^[a-z0-9][a-z0-9_.-]{5,63}$/.test(name)) throw new Error("QDEV_RUNNER_CONTAINER_NAME");
  return () => new Promise<void>((resolve, reject) => {
    const child = spawn(docker, ["rm", "-f", name], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr!.on("data", d => { err = (err + d).slice(-500); });
    child.on("error", reject);
    child.on("close", code => code === 0 || /No such container/i.test(err) ? resolve() : reject(new Error("docker rm failed")));
  });
}
