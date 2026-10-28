import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { requireValue, keys } from "../contracts.ts";
import {
  canonical,
  digest,
  validateRuntime,
  validateTaskData,
  validateOperation,
  DATA_CONTRACT,
  type RuntimeProfile,
  type TaskData,
  type Hash,
} from "./contracts.ts";
import {
  verifySourceClosure,
  sourceClosureDigest,
  type SourceClosure,
} from "./source.ts";
/** Pin the harness AND all trusted adapter/source/data validation, not just candidate entrypoints. */
export async function localAlphaTasksAdapterDigest(): Promise<Hash> {
  const files = [
    "../contracts.ts",
    "contracts.ts",
    "isolation.ts",
    "runner.mjs",
    "source.ts",
  ];
  const units = await Promise.all(
    files.map(async (path) => ({
      path,
      sha256: createHash("sha256")
        .update(await readFile(new URL(path, import.meta.url)))
        .digest("hex"),
    })),
  );
  return digest({ format: "myapps.alpha-tasks-adapter.v1", units }) as Hash;
}
export interface IsolatedResult {
  operationId: string;
  output: unknown;
  data: TaskData;
  cleanup: "CONFIRMED";
  sourceClosureDigest: Hash;
  runtimeDigest: Hash;
}
export class IsolatedExecutionError extends Error {
  constructor(readonly cleanup: "CONFIRMED" | "UNKNOWN") {
    super(
      cleanup === "CONFIRMED"
        ? "APP_CANDIDATE_REJECTED"
        : "APP_CLEANUP_UNKNOWN",
    );
  }
}
/** Local Docker qualification adapter. No fallback to host execution or remote image pulls. */
export class LocalAlphaTasksIsolation {
  #profile: RuntimeProfile;
  get profile(): RuntimeProfile {
    return this.#profile;
  }
  constructor(
    profile: RuntimeProfile,
    readonly docker = "docker",
  ) {
    this.#profile = Object.freeze(validateRuntime(profile));
    Object.freeze(this.#profile.secrets);
    requireValue(
      this.#profile.dataContract === DATA_CONTRACT,
      "APP_DATA_UNQUALIFIED",
    );
  }
  private command(
    args: string[],
    timeout = 10000,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.docker, args, {
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          NODE_ENV: "production",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let size = 0,
        failed = false;
      const stdout: Buffer[] = [],
        stderr: Buffer[] = [];
      const timer = setTimeout(() => {
        failed = true;
        child.kill("SIGKILL");
      }, timeout);
      child.once("error", () => {
        clearTimeout(timer);
        reject(Error("APP_ISOLATION_UNAVAILABLE"));
      });
      for (const [stream, chunks] of [
        [child.stdout, stdout],
        [child.stderr, stderr],
      ] as const)
        stream.on("data", (b: Buffer) => {
          size += b.length;
          if (size > 1000000) {
            failed = true;
            child.kill("SIGKILL");
          } else chunks.push(b);
        });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (failed) return reject(Error("APP_ISOLATION_BOUND"));
        resolve({
          code: code ?? -1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      });
    });
  }
  async execute(
    source: SourceClosure,
    operation: unknown,
    input: unknown,
    data: unknown,
    operationId: string = randomUUID(),
  ): Promise<IsolatedResult> {
    requireValue(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        operationId,
      ),
      "APP_OPERATION_BINDING",
    );
    const closure = verifySourceClosure(source, source.tree),
      request = validateOperation(operation, input),
      before = validateTaskData(data);
    requireValue(
      closure.files.some((f) => f.path === this.#profile.tasksModule) &&
        closure.files.some((f) => f.path === this.#profile.renderModule),
      "APP_RUNTIME_UNQUALIFIED",
    );
    const runner = await readFile(new URL("./runner.mjs", import.meta.url));
    requireValue(
      (await localAlphaTasksAdapterDigest()) === this.#profile.adapterDigest,
      "APP_RUNTIME_UNQUALIFIED",
    );
    const name = "myapps-alpha-" + operationId,
      folder = await mkdtemp(join(tmpdir(), name + "-"));
    let created = false;
    try {
      await mkdir(join(folder, "candidate"));
      await mkdir(join(folder, "harness"));
      for (const f of closure.files) {
        const path = join(folder, "candidate", f.path);
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, Buffer.from(f.base64, "base64"), {
          mode: 0o444,
          flag: "wx",
        });
      }
      await writeFile(join(folder, "harness", "runner.mjs"), runner, {
        mode: 0o444,
        flag: "wx",
      });
      await writeFile(
        join(folder, "harness", "input.json"),
        canonical({ ...request, data: before }),
        { mode: 0o444, flag: "wx" },
      );
      created = true;
      const launch = await this.command([
        "create",
        "--name",
        name,
        "--label",
        "myapps.operation=" + operationId,
        "--pull=never",
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--user=65534:65534",
        "--pids-limit=32",
        "--cpus=1",
        "--memory=128m",
        "--memory-swap=128m",
        "--log-driver=none",
        "--tmpfs",
        "/data:rw,noexec,nosuid,nodev,size=4m,mode=1777",
        "--mount",
        `type=bind,source=${join(folder, "candidate")},target=/candidate,readonly`,
        "--mount",
        `type=bind,source=${join(folder, "harness")},target=/harness,readonly`,
        "--entrypoint",
        "/usr/bin/timeout",
        this.#profile.image,
        "--signal=KILL",
        "5",
        "node",
        "/harness/runner.mjs",
      ]);
      requireValue(launch.code === 0, "APP_ISOLATION_UNAVAILABLE");
      const run = await this.command(["start", "--attach", name], 5000);
      requireValue(run.code === 0, "APP_CANDIDATE_FAILED");
      const value: unknown = JSON.parse(run.stdout);
      keys(value, ["output", "data"]);
      const after = validateTaskData(value.data);
      canonical(value.output);
      if (request.operation === "list" || request.operation === "render")
        requireValue(
          canonical(before) === canonical(after),
          "APP_READ_MUTATED_DATA",
        );
      // No artifact/output is returned until the exact container is confirmed removed.
      const removal = await this.command(["rm", "--force", name]);
      requireValue(removal.code === 0, "APP_CLEANUP_UNKNOWN");
      const observation = await this.command(["inspect", name]);
      requireValue(
        observation.code !== 0 &&
          observation.stderr.toLowerCase().includes("no such object: " + name),
        "APP_CLEANUP_UNKNOWN",
      );
      created = false;
      return {
        operationId,
        output: value.output,
        data: after,
        cleanup: "CONFIRMED",
        sourceClosureDigest: sourceClosureDigest(closure),
        runtimeDigest: ("sha256:" +
          createHash("sha256")
            .update(canonical(this.#profile))
            .digest("hex")) as Hash,
      };
    } catch {
      // A failed candidate is terminal only when exact-container absence is verified.
      if (created) {
        await this.command(["rm", "--force", name]).catch(() => null);
        const absent = await this.command(["inspect", name]).catch(() => null);
        if (
          !absent ||
          absent.code === 0 ||
          !absent.stderr.toLowerCase().includes("no such object: " + name)
        )
          throw new IsolatedExecutionError("UNKNOWN");
        created = false;
      }
      throw new IsolatedExecutionError("CONFIRMED");
    } finally {
      if (created) {
        await this.command(["rm", "--force", name]).catch(() => null);
        const absent = await this.command(["inspect", name]).catch(() => null);
        if (
          !absent ||
          absent.code === 0 ||
          !absent.stderr.toLowerCase().includes("no such object: " + name)
        )
          throw new IsolatedExecutionError("UNKNOWN");
      }
      await rm(folder, { recursive: true, force: true });
    }
  }
}
