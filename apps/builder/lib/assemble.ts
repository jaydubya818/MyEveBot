import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { CustomSchedule, FeatureId } from "./config";
import { allowedPrunableFiles, isExcluded, isPrunable } from "./manifest";
import { generateScheduleFile, scheduleSlug } from "./schedule-codegen";
import { generatePrimaryBootstrapSource } from "./primary-bootstrap";

// Turns the live apps/eve source into the file set for one configured
// deployment: walk, filter (exclusions + feature pruning), transform
// (instructions, package name), and append generated schedule files plus a
// small manifest (eve-builder.json) describing what was deployed.

export interface DeployFile {
  /** Path inside the deployment, POSIX-style. */
  file: string;
  /** Base64 contents (works uniformly for text and binary). */
  data: string;
  encoding: "base64";
}

/**
 * Baked into every deployment so the update flow can read a deployed agent's
 * configuration back out of its own files (via the Vercel deployment-files
 * API) — the builder stores nothing, so the deployment is the record.
 */
export const BUILDER_MANIFEST_FILE = "eve-builder.json";

/** Overwritten at assemble time; update-check imports this for the running release. */
export const TEMPLATE_STAMP_FILE = "lib/eve-template-stamp.ts";

/** Checked into apps/eve; bump when shipping a template change that agents should pick up. */
export const TEMPLATE_RELEASE_FILE = ".eve-template-release";

export interface BuilderManifest {
  templateVersion: string;
  /** Monotonic release from apps/eve/.eve-template-release — orders updates safely. */
  templateRelease: number;
  features: FeatureId[];
  projectName: string;
  deployedAt: string;
}

export interface TemplateInfo {
  version: string;
  /** Integer from apps/eve/.eve-template-release; must increase for an update to be offered. */
  release: number;
}

/**
 * What assembly actually needs — a structural subset of the wizard's
 * AgentConfig, so the update flow (which reconstructs these fields from a
 * deployed agent) can assemble without the rest of the config.
 */
export interface AssembleInput {
  projectName: string;
  features: readonly FeatureId[];
  instructions: string;
  schedules: readonly CustomSchedule[];
  /** Present for new Builder deployments; updates fall back to baked public identity. */
  agentName?: string;
  model?: string;
}

/** Locates apps/eve both in dev (cwd = apps/builder) and in the traced Vercel bundle. */
export async function templateRoot(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "../eve"),
    path.resolve(process.cwd(), "apps/eve"),
    path.resolve(process.cwd(), "../../apps/eve"),
  ];
  for (const candidate of candidates) {
    try {
      const probe = await stat(path.join(candidate, "agent", "agent.ts"));
      if (probe.isFile()) return candidate;
    } catch {
      // keep looking
    }
  }
  throw new Error("Could not locate the apps/eve template source");
}

function templateFilePath(root: string, relative: string): string {
  const absolute = path.resolve(root, relative);
  const prefix = `${path.resolve(root)}${path.sep}`;
  if (!absolute.startsWith(prefix)) {
    throw new Error(`Template path escapes apps/eve: ${relative}`);
  }
  return absolute;
}

/**
 * Template files are included explicitly in next.config.ts. Ignoring this
 * dynamic read prevents Turbopack from conservatively tracing the entire
 * monorepo; templateFilePath still keeps every read inside apps/eve.
 */
async function readTemplateFile(root: string, relative: string): Promise<Buffer> {
  return readFile(/* turbopackIgnore: true */ templateFilePath(root, relative));
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    const probe = entry.isDirectory() ? `${relative}/` : relative;
    if (isExcluded(probe)) continue;
    if (entry.isDirectory()) {
      await walk(root, absolute, out);
    } else if (entry.isFile()) {
      out.push(relative);
    }
  }
}

/**
 * Template identity for update detection: a content hash (display / equality)
 * plus a checked-in monotonic release integer (ordering). Deployed agents
 * only offer an update when latest.release > current.release, so restoring
 * older template files — even with newer filesystem mtimes — can't look like
 * an upgrade. Bump apps/eve/.eve-template-release when shipping changes.
 *
 * Only successful results are cached — a transient FS error must not poison
 * every later deploy/update on this serverless instance.
 */
let cachedTemplateInfo: TemplateInfo | null = null;
let templateInfoInflight: Promise<TemplateInfo> | null = null;
export function templateInfo(): Promise<TemplateInfo> {
  if (cachedTemplateInfo !== null) return Promise.resolve(cachedTemplateInfo);
  templateInfoInflight ??= (async () => {
    try {
      const root = await templateRoot();
      const files: string[] = [];
      await walk(root, root, files);
      const hash = createHash("sha256");
      for (const relative of files.sort()) {
        hash.update(relative);
        hash.update("\0");
        hash.update(await readTemplateFile(root, relative));
      }
      const releaseRaw = (await readFile(path.join(root, TEMPLATE_RELEASE_FILE), "utf8")).trim();
      const release = Number.parseInt(releaseRaw, 10);
      if (!Number.isFinite(release) || release < 1) {
        throw new Error(
          `${TEMPLATE_RELEASE_FILE} must contain a positive integer (got ${JSON.stringify(releaseRaw)})`,
        );
      }
      const info: TemplateInfo = {
        version: hash.digest("hex").slice(0, 12),
        release,
      };
      cachedTemplateInfo = info;
      return info;
    } finally {
      templateInfoInflight = null;
    }
  })();
  return templateInfoInflight;
}

export async function templateVersion(): Promise<string> {
  return (await templateInfo()).version;
}

/** All template file paths that ship for this feature selection (pre-transform). */
export async function templateFiles(features: readonly FeatureId[]): Promise<string[]> {
  const root = await templateRoot();
  const files: string[] = [];
  await walk(root, root, files);
  const allowed = allowedPrunableFiles(features);
  return files.filter((file) => {
    if (!features.includes("browser") && (file === "agent/lib/qa-sandbox.ts" || file === "scripts/prewarm-computer.ts" ||
      /^agent\/subagents\/[^/]+\/sandbox\.ts$/.test(file))) return false;
    return !isPrunable(file) || allowed.has(file);
  }).sort();
}

/** Assembles the complete deployment file set for the Vercel API. */
export async function assembleDeployment(input: AssembleInput): Promise<DeployFile[]> {
  const root = await templateRoot();
  const paths = await templateFiles(input.features);
  const out: DeployFile[] = [];

  for (const relative of paths) {
    let data = await readTemplateFile(root, relative);

    if (relative === "agent/instructions.md") {
      data = Buffer.from(input.instructions, "utf8");
    } else if (relative === "package.json") {
      const parsed = JSON.parse(data.toString("utf8")) as Record<string, unknown>;
      parsed.name = input.projectName;
      if (!input.features.includes("browser")) delete (parsed.scripts as Record<string, unknown>)["computer:prewarm"];
      data = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    } else if (!input.features.includes("browser") && relative === "lib/computer-runtime-config.ts") {
      data = Buffer.from("export const COMPUTER_RUNTIME_ENABLED = false;\n");
    } else if (!input.features.includes("browser") && relative === "lib/computer-sandbox-backend.ts") {
      // Keep an explicit deny backend: deleting the root definition enables Eve's default backend.
      data = Buffer.from(`import type { SandboxBackend } from "eve/sandbox";
export class ComputerSandboxAuthorityRequired extends Error {}
export async function withPreparedComputer<T>(_prepared: unknown, _authority: unknown, _parameters: unknown, _work: () => Promise<T>): Promise<T> { throw new Error("Computer is disabled in this deployment."); }
export const computerSandboxBackend: SandboxBackend = {
  name: "myeve-computer-disabled",
  async prewarm() { return { reused: false }; },
  async create() { throw new Error("Computer is disabled in this deployment."); },
};
`);
    } else if (!input.features.includes("browser") && relative === "lib/computer-template-vercel.ts") {
      data = Buffer.from(`import type { ComputerTemplateProvider } from "./computer-template-lifecycle.ts";
export const vercelTemplateProvider: ComputerTemplateProvider = {
  id: "disabled",
  async inspect() { return { state: "MISSING" }; },
  async prepare() { throw new Error("Computer is disabled in this deployment."); },
  async cleanup() { return false; },
  classify() { return "provider_unavailable"; },
};
`);
    }

    out.push({ file: relative, data: data.toString("base64"), encoding: "base64" });
  }

  const usedSlugs = new Set<string>();
  input.schedules.forEach((schedule, index) => {
    let slug = scheduleSlug(schedule.name, index);
    while (usedSlugs.has(slug)) slug = `${slug}-${index + 1}`;
    usedSlugs.add(slug);
    out.push({
      file: `agent/schedules/custom-${slug}.ts`,
      data: Buffer.from(generateScheduleFile(schedule), "utf8").toString("base64"),
      encoding: "base64",
    });
  });

  const info = await templateInfo();
  const manifest: BuilderManifest = {
    templateVersion: info.version,
    templateRelease: info.release,
    features: [...input.features],
    projectName: input.projectName,
    deployedAt: new Date().toISOString(),
  };
  out.push({
    file: BUILDER_MANIFEST_FILE,
    data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8").toString("base64"),
    encoding: "base64",
  });

  // Bake release into source so the live deployment's update-check always
  // matches the code that is running — not project env that can be advanced
  // before a build succeeds (or rolled back after one does).
  const stampSource = `/**
 * Generated by MyEve Builder — do not edit.
 * Identity of the agent template baked into this deployment.
 */
export const TEMPLATE_STAMP = {
  version: ${JSON.stringify(info.version)},
  release: ${info.release},
} as const;
`;
  const stampPayload = {
    file: TEMPLATE_STAMP_FILE,
    data: Buffer.from(stampSource, "utf8").toString("base64"),
    encoding: "base64" as const,
  };
  const stampIndex = out.findIndex((file) => file.file === TEMPLATE_STAMP_FILE);
  if (stampIndex >= 0) out[stampIndex] = stampPayload;
  else out.push(stampPayload);

  // This is initialization input, not a second live configuration store:
  // PostgreSQL becomes canonical after ensurePrimaryAgent creates the record.
  const primaryBootstrapSource = generatePrimaryBootstrapSource(input);
  const primaryBootstrapPayload = {
    file: "lib/primary-agent-bootstrap.ts",
    data: Buffer.from(primaryBootstrapSource, "utf8").toString("base64"),
    encoding: "base64" as const,
  };
  const primaryIndex = out.findIndex((file) => file.file === primaryBootstrapPayload.file);
  if (primaryIndex >= 0) out[primaryIndex] = primaryBootstrapPayload;
  else out.push(primaryBootstrapPayload);

  return out;
}
