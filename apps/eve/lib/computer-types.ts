export const COMPUTER_SESSION_STATUSES = [
  "provisioning",
  "ready",
  "running",
  "paused",
  "completed",
  "failed",
  "expired",
  "stopped",
] as const;

export type ComputerSessionStatus = (typeof COMPUTER_SESSION_STATUSES)[number];

export const COMPUTER_ACTION_TYPES = [
  "browser.navigate",
  "browser.click",
  "browser.type",
  "browser.read",
  "file.read",
  "file.write",
  "file.download",
  "file.upload",
  "terminal.command",
] as const;

export type ComputerActionType = (typeof COMPUTER_ACTION_TYPES)[number];
export type ComputerActionStatus = "running" | "completed" | "failed" | "denied" | "timed_out";

export interface ComputerResourceLimits {
  maxRuntimeSeconds: number;
  maxBrowserActions: number;
  maxFileBytes: number;
  terminalTimeoutSeconds: number;
}

export const PRIVATE_IPV4_CIDRS = [
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.168.0.0/16",
] as const;

export function normalizeAllowedDomains(domains: readonly string[] = []): string[] {
  const normalized = [...new Set(domains.map((domain) => domain.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length > 20) throw new Error("Computer sessions allow at most 20 network domains.");
  for (const domain of normalized) {
    if (
      !/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
      || /\.(?:local|internal|localhost|test|invalid|example)$/i.test(domain)
    ) {
      throw new Error(`Invalid public network domain: ${domain}`);
    }
  }
  return normalized;
}

export function browserDomainsForUrl(value: unknown): string[] {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  let url: URL;
  try { url = new URL(value); } catch { return []; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return [];
  const hostname = url.hostname.toLowerCase();
  const domains = [hostname];
  if (hostname.startsWith("www.")) domains.push(hostname.slice(4));
  else domains.push(`www.${hostname}`);
  return normalizeAllowedDomains(domains);
}

export type BrowserFailureCode =
  | "authentication_required"
  | "network_policy_blocked"
  | "browser_timeout"
  | "browser_unavailable"
  | "browser_action_failed";

export function classifyBrowserFailure(code?: string, message?: string): BrowserFailureCode {
  const detail = `${code ?? ""} ${message ?? ""}`;
  if (/sign[ -]?in|log[ -]?in|authentication|unauthorized|forbidden|mfa|captcha/i.test(detail)) return "authentication_required";
  if (/network policy|egress|domain.*(?:allow|block|deny)|blocked by.*network|ERR_BLOCKED_BY_CLIENT/i.test(detail)) return "network_policy_blocked";
  if (/timed?\s*out|timeout|deadline exceeded/i.test(detail)) return "browser_timeout";
  if (/browser.*(?:unavailable|not installed|failed to (?:start|launch)|disconnected)|executable.*not found/i.test(detail)) return "browser_unavailable";
  return "browser_action_failed";
}

export interface ComputerArtifactView {
  id: string;
  actionId: string | null;
  runId: string | null;
  kind: "screenshot" | "download" | "report" | "file" | "log" | "json";
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export interface ComputerActionView {
  id: string;
  runId: string | null;
  agentId: string;
  type: ComputerActionType;
  target: string | null;
  inputSummary: string;
  outputSummary: string | null;
  status: ComputerActionStatus;
  startedAt: string;
  completedAt: string | null;
  evidenceRefs: string[];
  failureCode: string | null;
  failureSummary: string | null;
}

export interface BrowserSessionView {
  id: string;
  status: Exclude<ComputerSessionStatus, "provisioning">;
  currentUrl: string | null;
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
}

export interface ComputerSessionView {
  id: string;
  ownerId: string;
  agentId: string;
  agentName: string;
  goalId: string | null;
  goalTitle: string | null;
  taskId: string | null;
  taskTitle: string | null;
  runId: string | null;
  runTitle: string | null;
  runtimeSessionId: string;
  sandboxId: string | null;
  status: ComputerSessionStatus;
  environmentType: "eve-sandbox" | "vercel-sandbox";
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  expiresAt: string;
  resourceLimits: ComputerResourceLimits;
  networkPolicy: Record<string, unknown>;
  failureCode: string | null;
  failureSummary: string | null;
  browser: BrowserSessionView | null;
  actionCount: number;
  artifacts: ComputerArtifactView[];
}

const LEGAL_TRANSITIONS: Readonly<Record<ComputerSessionStatus, readonly ComputerSessionStatus[]>> = {
  provisioning: ["ready", "failed", "expired", "stopped"],
  ready: ["running", "paused", "completed", "failed", "expired", "stopped"],
  running: ["ready", "paused", "completed", "failed", "expired", "stopped"],
  paused: ["ready", "running", "completed", "failed", "expired", "stopped"],
  completed: [],
  failed: [],
  expired: [],
  stopped: [],
};

export function canTransitionComputerSession(
  from: ComputerSessionStatus,
  to: ComputerSessionStatus,
): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function clampComputerLimits(
  agent: { maxRuntimeSeconds: number },
  requested: Partial<ComputerResourceLimits> = {},
): ComputerResourceLimits {
  return {
    maxRuntimeSeconds: Math.max(10, Math.min(agent.maxRuntimeSeconds, requested.maxRuntimeSeconds ?? agent.maxRuntimeSeconds)),
    maxBrowserActions: Math.max(1, Math.min(500, requested.maxBrowserActions ?? 100)),
    maxFileBytes: Math.max(1024, Math.min(100 * 1024 * 1024, requested.maxFileBytes ?? 20 * 1024 * 1024)),
    terminalTimeoutSeconds: Math.max(1, Math.min(120, requested.terminalTimeoutSeconds ?? 30)),
  };
}

export function isComputerSessionExpired(expiresAt: string, now = Date.now()): boolean {
  return new Date(expiresAt).getTime() <= now;
}

export function isAllowedTerminalCommand(command: string): boolean {
  return /^(?:pwd|ls|wc|head|tail|sort|uniq)(?:\s+(?:--?[A-Za-z0-9][A-Za-z0-9-]*|[A-Za-z0-9_./-]+))*$/.test(command.trim());
}
