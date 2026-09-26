import { createHash } from "node:crypto";
import { posix } from "node:path";
import { z } from "zod";
import {
  contextPackageSchema,
  contextProblems,
  digitalWorkContractSchema,
  type ContextPackage,
  type DigitalWorkContract,
} from "./contracts.ts";

const MAX_FILES = 32;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_WORKSPACE_BYTES = 64 * 1024;
const MAX_CONTEXT_TOKENS = 16_000;
const MAX_WRITE_OPERATIONS = 1000;

const pathSchema = z.string().min(1).max(400);
const operationIdSchema = z.string().uuid();
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const receiptSchema = z.object({
  operationId: operationIdSchema,
  revision: z.number().int().positive(),
  requestHash: hashSchema,
}).strict();
const checkpointSchema = z.object({
  version: z.literal(1),
  workId: z.string().uuid(),
  workVersion: z.number().int().positive(),
  contractHash: hashSchema,
  generation: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  stopped: z.boolean(),
  files: z.record(z.string(), z.string()),
  receipts: z.array(receiptSchema).max(MAX_WRITE_OPERATIONS),
  checksum: hashSchema,
}).strict();

export interface ExperimentalHarnessInput {
  work: DigitalWorkContract;
  context: ContextPackage;
  generation: number;
  files: Readonly<Record<string, string>>;
  readablePaths: readonly string[];
  writablePaths: readonly string[];
}

export interface ExperimentalWriteRequest {
  path: string;
  content: string;
  operationId: string;
  expectedRevision: number;
}

export interface ExperimentalWriteReceipt {
  operationId: string;
  revision: number;
  requestHash: string;
}

export interface ExperimentalWriteGuard {
  assertCurrent(input: {
    workId: string;
    workVersion: number;
    scopeKind: "personal" | "organization";
    scopeId: string;
    agentId: string;
    generation: number;
    operation: "file.read" | "file.write";
    operationId: string | null;
    path: string;
  }): Promise<boolean>;
}

export interface ExperimentalCheckpoint {
  version: 1;
  workId: string;
  workVersion: number;
  contractHash: string;
  generation: number;
  revision: number;
  stopped: boolean;
  files: Record<string, string>;
  receipts: ExperimentalWriteReceipt[];
  checksum: string;
}

export interface ExperimentalModelTools {
  readFile(path: string): Promise<string>;
  writeFile(request: ExperimentalWriteRequest): Promise<ExperimentalWriteReceipt>;
}

export interface ExperimentalHostController {
  checkpoint(): ExperimentalCheckpoint;
  requestStop(): ExperimentalCheckpoint;
  candidate(): { revision: number; contentHash: string; changedPaths: string[] };
  readonly usage: { coverage: "UNKNOWN"; providerCostUsd: null };
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function safePath(raw: string): string {
  const path = pathSchema.parse(raw);
  if (path.includes("\\") || path.includes("\0") || path.startsWith("/") ||
      path.split("/").some(part => !part || part === "." || part === "..") ||
      posix.normalize(path) !== path || path.includes(":"))
    throw new Error("Path is outside the selected virtual workspace.");
  return path;
}

function selectedPaths(paths: readonly string[]): Set<string> {
  if (paths.length > MAX_FILES) throw new Error("Too many selected paths.");
  const result = new Set(paths.map(safePath));
  if (result.size !== paths.length) throw new Error("Selected paths must be unique.");
  return result;
}

function selectedFiles(files: Readonly<Record<string, string>>, readable: Set<string>): Map<string, string> {
  const entries = Object.entries(files);
  if (entries.length > MAX_FILES) throw new Error("Too many selected files.");
  let totalBytes = 0;
  const result = new Map<string, string>();
  for (const [rawPath, content] of entries) {
    const path = safePath(rawPath);
    if (!readable.has(path) || typeof content !== "string") throw new Error("File is outside the selected read set.");
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_FILE_BYTES) throw new Error("Selected file exceeds its byte limit.");
    totalBytes += bytes;
    result.set(path, content);
  }
  if (totalBytes > MAX_WORKSPACE_BYTES) throw new Error("Selected workspace exceeds its byte limit.");
  return result;
}

function checkpointChecksum(checkpoint: Omit<ExperimentalCheckpoint, "checksum">): string {
  return digest(checkpoint);
}

/**
 * ER2 experiment only. The model receives `tools`, never the host controller.
 * Files are an in-memory projection; this boundary cannot expose a host path or shell.
 * It is not a Deep Agents adapter, a durable candidate store, or an execution grant.
 */
export function createExperimentalHarnessBoundary(
  input: ExperimentalHarnessInput,
  guard: ExperimentalWriteGuard,
  restored?: ExperimentalCheckpoint,
  now = Date.now(),
): { tools: ExperimentalModelTools; host: ExperimentalHostController } {
  const work = digitalWorkContractSchema.parse(input.work);
  const context = contextPackageSchema.parse(input.context);
  const problems = contextProblems(work, context, now);
  if (problems.length) throw new Error(`Harness context rejected: ${problems.join(" ")}`);
  if (context.maxTokens > MAX_CONTEXT_TOKENS) throw new Error("Harness context token limit exceeded.");
  if (!work.allowedRoutes.includes("DEEP_AGENT")) throw new Error("Work does not list the experimental route.");
  if (!Number.isSafeInteger(input.generation) || input.generation < 1) throw new Error("Invalid Work generation.");
  if (Date.parse(work.deadline) <= now) throw new Error("Work deadline has passed.");

  const readable = selectedPaths(input.readablePaths);
  const writable = selectedPaths(input.writablePaths);
  for (const path of writable) if (!readable.has(path)) throw new Error("Write path is outside the selected read set.");
  const initialFiles = selectedFiles(input.files, readable);
  let files = new Map(initialFiles);
  let revision = 0;
  let stopped = false;
  const receipts = new Map<string, ExperimentalWriteReceipt>();

  if (restored) {
    const parsed = checkpointSchema.parse(restored);
    const { checksum, ...body } = parsed;
    if (checkpointChecksum(body) !== checksum ||
        parsed.workId !== work.workId || parsed.workVersion !== work.workVersion ||
        parsed.contractHash !== digest(work) ||
        parsed.generation !== input.generation)
      throw new Error("Checkpoint does not match the current Work and generation.");
    files = selectedFiles(parsed.files, readable);
    if (files.size !== initialFiles.size || [...files].some(([path, content]) =>
      !initialFiles.has(path) || (!writable.has(path) && initialFiles.get(path) !== content)))
      throw new Error("Checkpoint changed a file outside the selected write set.");
    revision = parsed.revision;
    stopped = parsed.stopped;
    if (parsed.receipts.length !== revision ||
        parsed.receipts.some((receipt, index) => receipt.revision !== index + 1))
      throw new Error("Checkpoint write sequence is incomplete.");
    for (const receipt of parsed.receipts) {
      if (receipts.has(receipt.operationId) || receipt.revision > revision || receipt.revision < 1)
        throw new Error("Checkpoint has invalid write receipts.");
      receipts.set(receipt.operationId, { ...receipt });
    }
  }

  const checkpoint = (): ExperimentalCheckpoint => {
    const body: Omit<ExperimentalCheckpoint, "checksum"> = {
      version: 1,
      workId: work.workId,
      workVersion: work.workVersion,
      contractHash: digest(work),
      generation: input.generation,
      revision,
      stopped,
      files: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b))),
      receipts: [...receipts.values()].sort((a, b) => a.revision - b.revision),
    };
    return structuredClone({ ...body, checksum: checkpointChecksum(body) });
  };

  const current = (operation: "file.read" | "file.write", operationId: string | null, path: string) =>
    guard.assertCurrent({
      workId: work.workId,
      workVersion: work.workVersion,
      scopeKind: work.scope.kind,
      scopeId: work.scope.id,
      agentId: work.coordinatingAgentId,
      generation: input.generation,
      operation,
      operationId,
      path,
    });

  const tools: ExperimentalModelTools = Object.freeze({
    async readFile(rawPath: string): Promise<string> {
      if (stopped) throw new Error("Harness was stopped.");
      const path = safePath(rawPath);
      if (!readable.has(path) || !files.has(path)) throw new Error("File is outside the selected read set.");
      if (!await current("file.read", null, path) || stopped || Date.parse(work.deadline) <= Date.now())
        throw new Error("Current Work authority no longer permits the read.");
      return files.get(path)!;
    },
    async writeFile(request: ExperimentalWriteRequest): Promise<ExperimentalWriteReceipt> {
      if (stopped) throw new Error("Harness was stopped.");
      const path = safePath(request.path);
      const operationId = operationIdSchema.parse(request.operationId);
      if (!writable.has(path)) throw new Error("File is outside the selected write set.");
      if (typeof request.content !== "string" || Buffer.byteLength(request.content, "utf8") > MAX_FILE_BYTES)
        throw new Error("Write exceeds the selected file byte limit.");
      const fingerprint = digest({ path, content: request.content });
      const existing = receipts.get(operationId);
      if (existing) {
        if (existing.requestHash !== fingerprint) throw new Error("Operation ID was reused for different content.");
        return { ...existing };
      }
      if (request.expectedRevision !== revision) throw new Error("Workspace revision changed.");
      if (receipts.size >= MAX_WRITE_OPERATIONS) throw new Error("Harness write-operation limit exceeded.");
      const allowed = await current("file.write", operationId, path);
      if (!allowed || stopped || request.expectedRevision !== revision || Date.parse(work.deadline) <= Date.now())
        throw new Error("Current Work authority, generation, or revision no longer permits the write.");
      const next = new Map(files);
      next.set(path, request.content);
      if ([...next.values()].reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0) > MAX_WORKSPACE_BYTES)
        throw new Error("Workspace byte limit exceeded.");
      files = next;
      revision += 1;
      const receipt = { operationId, revision, requestHash: fingerprint };
      receipts.set(operationId, receipt);
      return { ...receipt };
    },
  });

  const host: ExperimentalHostController = Object.freeze({
    checkpoint,
    requestStop(): ExperimentalCheckpoint {
      stopped = true;
      return checkpoint();
    },
    candidate() {
      const changedPaths = [...files].filter(([path, content]) => initialFiles.get(path) !== content)
        .map(([path]) => path).sort();
      return { revision, contentHash: digest([...files].sort(([a], [b]) => a.localeCompare(b))), changedPaths };
    },
    usage: Object.freeze({ coverage: "UNKNOWN" as const, providerCostUsd: null }),
  });

  return { tools, host };
}
