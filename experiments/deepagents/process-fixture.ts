// Local qualification driver only. No provider credentials, model API or network transport.
import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { serialize, deserialize } from "node:v8";
import { createHash, randomUUID } from "node:crypto";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "@langchain/core/messages";
import { ExperimentalDeepAgentsProvider, type ExperimentHost } from "./provider.ts";
import type { ExperimentalCheckpoint, ExperimentalHarnessInput } from "../../apps/eve/lib/digital-worker/experimental-harness-boundary.ts";

const [directory, phase] = process.argv.slice(2);
if (!directory?.startsWith("/private/tmp/myeve-er2-process-") || !["start", "resume"].includes(phase))
  throw new Error("Only an isolated temporary qualification directory is accepted.");
const input: ExperimentalHarnessInput = JSON.parse(await readFile(join(directory, "input.json"), "utf8"));
const runId = (await readFile(join(directory, "run-id"), "utf8")).trim();
class DiskSaver extends MemorySaver {
  private saving = Promise.resolve();
  async save() {
    const bytes = serialize({ storage: this.storage, writes: this.writes });
    this.saving = this.saving.then(async () => {
      await writeFile(join(directory, "graph.tmp"), bytes, { mode: 0o600 });
      await rename(join(directory, "graph.tmp"), join(directory, "graph.bin"));
    });
    await this.saving;
  }
  override async put(...args: Parameters<MemorySaver["put"]>) {
    const result = await super.put(...args); await this.save(); return result;
  }
  override async putWrites(...args: Parameters<MemorySaver["putWrites"]>) {
    await super.putWrites(...args); await this.save();
  }
}
class ScriptedModel extends BaseChatModel {
  private count = 0;
  constructor() { super({}); }
  _llmType() { return "myeve-process-fixture"; }
  bindTools() { return this; }
  async _generate() {
    const message = phase === "start" && this.count++ === 0 ? new AIMessage({ content: "", tool_calls: [{
      id: "fixture-write", name: "myeve_write_file", type: "tool_call", args: {
        path: "quantity.mjs", content: "repaired before process loss", operationId: randomUUID(), expectedRevision: 0,
      },
    }] }) : new AIMessage("Done");
    return { generations: [{ text: "", message }] };
  }
}
const saver = new DiskSaver();
if (phase === "resume") {
  const saved = deserialize(await readFile(join(directory, "graph.bin")));
  saver.storage = saved.storage; saver.writes = saved.writes;
}
let savedCheckpoint: ExperimentalCheckpoint;
const host: ExperimentHost = {
  prepare: async () => input,
  authorizeModelCall: async () => true,
  guard: { assertCurrent: async request => {
    if (request.operation === "file.write") {
      const path = join(directory, "effects.txt");
      await writeFile(path, "file.write\n", { flag: "a", mode: 0o600 });
    }
    return true;
  } },
  checkpointer: saver,
  retain: async (_run, checkpoint) => {
    savedCheckpoint = checkpoint;
    await writeFile(join(directory, "boundary.tmp"), JSON.stringify(checkpoint), { mode: 0o600 });
    await rename(join(directory, "boundary.tmp"), join(directory, "boundary.json"));
    if (phase === "start" && checkpoint.revision === 1) {
      process.send?.("candidate-retained");
      // Parent kills us here: the edit receipt is durable but the graph tool has not returned.
      await new Promise(() => {});
    }
    return "fixture:boundary";
  },
  restore: async () => ({ input, checkpoint: JSON.parse(await readFile(join(directory, "boundary.json"), "utf8")) }),
};
const provider = new ExperimentalDeepAgentsProvider(host, new ScriptedModel());
const run = { provider: provider.metadata.provider, workId: input.work.workId,
  workVersion: input.work.workVersion, generation: input.generation, runId };
if (phase === "start") await provider.start({ work: input.work, context: input.context, generation: input.generation, idempotencyKey: runId });
else {
  const snapshot = JSON.parse(await readFile(join(directory, "boundary.json"), "utf8"));
  const contentHash = `sha256:${createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")}`;
  await provider.resume({ run, contentHash, checkpointRef: "fixture:boundary" }, runId);
}
await provider.settled(run);
if (phase === "resume") {
  await writeFile(join(directory, "result.json"), JSON.stringify({
    observation: await provider.observe(run), result: await provider.collectResult(run), checkpoint: savedCheckpoint!,
  }), { mode: 0o600 });
}
process.disconnect?.();
