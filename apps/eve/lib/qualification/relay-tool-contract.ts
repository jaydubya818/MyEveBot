import { z } from "zod";
import type { RelayAction, RelayDeveloperGrant } from "./relay-grant.ts";

/**
 * Strict, tool-specific translation from the agent's call to Relay's native /mcp
 * arguments. Mirrors the frozen Relay e5166e07 tool schemas (lib/mcp.ts,
 * lib/connectors/github-health.ts): Relay's legacy authorization is
 * account/agent-wide and consumes `owner`/`repo` from the arguments, so the
 * provider selectors are NEVER taken from the caller. The caller supplies only
 * the tool's own non-selector fields (strict schema: any other key, including
 * `owner`, `repo` or `repository` aliases, is a denial); owner/repo are
 * constructed from the exact authorized repository in the grant.
 *
 * Frozen Relay /mcp offers no general GitHub contents read/write tool, so the
 * canonical contract contains only the supported bounded metadata, branch,
 * Actions and deployment reads. Anything else is invisible and uncallable.
 */
export class RelayInputDenied extends Error {
  constructor(readonly code: string) { super(code); }
}
export type RelayToolSpec = {
  kind: RelayAction["kind"];
  /** Caller-visible input; must be `.strict()`. */
  input: z.ZodType<Record<string, unknown>>;
  /** Canonical valid example used only to decide discovery visibility. */
  sample: Record<string, unknown>;
  /** The exact action the grant must authorize for these parsed arguments. */
  action(grant: RelayDeveloperGrant, args: Record<string, unknown>): RelayAction;
  /** The native Relay arguments, built from the authorized repository plus the parsed fields. */
  native(grant: RelayDeveloperGrant, args: Record<string, unknown>): Record<string, unknown>;
};
export type RelayToolContract = Record<string, RelayToolSpec>;

const branch = z.string().min(1).max(255).refine(v => v !== "." && v !== ".." && Array.from(v).every(c => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127));
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const id = z.string().regex(/^[1-9][0-9]{0,19}$/);
const created = z.string().refine(v => {
  const parts = v.split("..");
  if (parts.length !== 2 || !parts.every(p => z.iso.datetime().safeParse(p).success)) return false;
  const [a, b] = parts.map(p => Date.parse(p));
  return b >= a && b - a <= 24 * 3600_000;
}, "created must be an ISO UTC range of at most 24 hours");
const page = { page: z.number().int().min(1).max(5).optional(), perPage: z.number().int().min(1).max(100).optional() };

export function splitRepository(repository: string): { owner: string; repo: string } {
  const m = /^([A-Za-z0-9][A-Za-z0-9-]{0,99})\/([A-Za-z0-9_.-]{1,100})$/.exec(repository);
  if (!m || m[2] === "." || m[2] === "..") throw new RelayInputDenied("QDEV_RELAY_REPOSITORY_INVALID");
  return { owner: m[1], repo: m[2] };
}
const read = (kind: RelayAction["kind"], shape: z.ZodRawShape, sample: Record<string, unknown> = {}): RelayToolSpec => ({
  kind, input: z.object(shape).strict(), sample,
  action: (g, a) => ({ kind, repository: g.repository, ...("branch" in a && typeof a.branch === "string" ? { ref: a.branch } : "ref" in a && typeof a.ref === "string" ? { ref: a.ref } : {}) } as RelayAction),
  native: (g, a) => ({ ...splitRepository(g.repository), ...a }),
});

export const CANONICAL_RELAY_CONTRACT: RelayToolContract = Object.freeze({
  relay_github_repo_get: read("read_metadata", {}),
  relay_github_branch_list: read("read_metadata", { ...page }),
  relay_github_branch_get: read("read_metadata", { branch }, { branch: "main" }),
  relay_github_workflow_list: read("read_actions", { ...page }),
  relay_github_run_list: read("read_actions", { ...page, branch: branch.optional(), headSha: sha.optional(), created: created.optional() }),
  relay_github_run_get: read("read_actions", { runId: id }, { runId: "1" }),
  relay_github_deployment_list: read("read_deployments", { ...page, ref: branch.optional(), sha: sha.optional() }),
  relay_github_deployment_status_list: read("read_deployments", { ...page, deploymentId: id }, { deploymentId: "1" }),
});
/** Name -> action kind for RelayMcpTransport: exactly the supported tools, nothing invented. */
export function relayToolMap(contract: RelayToolContract = CANONICAL_RELAY_CONTRACT): Record<string, RelayAction["kind"]> {
  return Object.fromEntries(Object.entries(contract).map(([name, spec]) => [name, spec.kind]));
}
