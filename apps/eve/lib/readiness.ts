import { list as listBlobs } from "@vercel/blob";
import { gateway } from "ai";

import { memoryStore } from "@/agent/lib/memory-store";
import { db } from "@/agent/lib/receipts-db";
import { CANDIDATE_TOOLKITS, manageConnections } from "@/lib/composio-connect";
import { capabilityMap } from "@/lib/capabilities";
import { CURRENT_DATABASE_MIGRATION } from "@/lib/database-schema";
import { webAuthConfigStatus, webAuthRequired } from "@/lib/web-auth";

export type ReadinessState = "ready" | "setup_required" | "error" | "excluded";

export interface ReadinessCheck {
  id: "auth" | "ai" | "database" | "memory" | "connections" | "storage";
  label: string;
  state: ReadinessState;
  detail: string;
  required: boolean;
}

export interface ReadinessReport {
  checkedAt: string;
  overall: "ready" | "action_required" | "degraded";
  checks: ReadinessCheck[];
}

const CHECK_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 30_000;
let cached: { report: ReadinessReport; at: number } | null = null;

async function withTimeout<T>(label: string, operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), CHECK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function probe(
  check: Omit<ReadinessCheck, "state" | "detail">,
  operation: () => Promise<unknown>,
  healthyDetail: string,
): Promise<ReadinessCheck> {
  try {
    await withTimeout(check.label, operation());
    return { ...check, state: "ready", detail: healthyDetail };
  } catch {
    return {
      ...check,
      state: "error",
      detail: `${check.label} is configured but could not be reached. Check the credential and provider status.`,
    };
  }
}

function environmentReady(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function setup(
  check: Omit<ReadinessCheck, "state" | "detail">,
  detail: string,
): ReadinessCheck {
  return { ...check, state: "setup_required", detail };
}

function excluded(
  check: Omit<ReadinessCheck, "state" | "detail">,
  detail: string,
): ReadinessCheck {
  return { ...check, state: "excluded", detail };
}

export async function getReadinessReport(options?: { fresh?: boolean }): Promise<ReadinessReport> {
  const now = Date.now();
  if (!options?.fresh && cached !== null && now - cached.at < CACHE_TTL_MS) {
    return cached.report;
  }

  const capabilities = capabilityMap();
  const checks: ReadinessCheck[] = [];
  const authBase = { id: "auth" as const, label: "Web access", required: true };
  if (!webAuthRequired()) {
    checks.push({
      ...authBase,
      state: "ready",
      detail: "Local development access is active. Production still requires an owner session.",
    });
  } else if (webAuthConfigStatus().configured) {
    checks.push({ ...authBase, state: "ready", detail: "Signed owner sessions are configured." });
  } else {
    checks.push(
      setup(authBase, "Add MYEVE_ACCESS_PASSWORD and MYEVE_SESSION_SECRET before production."),
    );
  }

  const aiBase = { id: "ai" as const, label: "AI Gateway", required: true };
  if (
    !environmentReady("AI_GATEWAY_API_KEY") &&
    !environmentReady("VERCEL_OIDC_TOKEN") &&
    process.env.VERCEL !== "1"
  ) {
    checks.push(setup(aiBase, "Connect Vercel OIDC or add AI_GATEWAY_API_KEY."));
  } else {
    checks.push(
      await probe(
        aiBase,
        async () => {
          await gateway.getAvailableModels();
        },
        "Model catalog is reachable.",
      ),
    );
  }

  const databaseBase = { id: "database" as const, label: "Database", required: true };
  if (!environmentReady("DATABASE_URL")) {
    checks.push(setup(databaseBase, "Add DATABASE_URL for threads, automations, and receipts."));
  } else {
    try {
      const migrationTable = await withTimeout(
        "Database",
        db().query("SELECT to_regclass('public.sofie_schema_migrations')::text AS table_name"),
      );
      if (migrationTable[0]?.table_name === null) {
        checks.push(
          setup(databaseBase, "Database is reachable. Run npm run db:migrate before launch."),
        );
      } else {
        const applied = await withTimeout(
          "Database migrations",
          db().query("SELECT 1 FROM sofie_schema_migrations WHERE name = $1", [
            CURRENT_DATABASE_MIGRATION,
          ]),
        );
        checks.push(
          applied.length > 0
            ? { ...databaseBase, state: "ready", detail: "Postgres and schema migrations are ready." }
            : setup(databaseBase, "Database is reachable. Apply the latest migration before launch."),
        );
      }
    } catch {
      checks.push({
        ...databaseBase,
        state: "error",
        detail: "Database is configured but could not be reached. Check the connection and provider status.",
      });
    }
  }

  const memoryBase = { id: "memory" as const, label: "Memory", required: false };
  if (capabilities.memory.state === "excluded") {
    checks.push(excluded(memoryBase, "Memory is not included in this deployment."));
  } else if (!environmentReady("SUPERMEMORY_API_KEY")) {
    checks.push(setup(memoryBase, "Add SUPERMEMORY_API_KEY to enable long-term memory."));
  } else {
    checks.push(
      await probe(memoryBase, () => memoryStore.healthcheck(), "Supermemory accepted a memory-list request."),
    );
  }

  const connectionsBase = {
    id: "connections" as const,
    label: "Connected apps",
    required: false,
  };
  if (capabilities.connections.state === "excluded") {
    checks.push(excluded(connectionsBase, "App connections are not included in this deployment."));
  } else if (!environmentReady("COMPOSIO_API_KEY")) {
    checks.push(setup(connectionsBase, "Add COMPOSIO_API_KEY to connect external apps."));
  } else {
    checks.push(
      await probe(
        connectionsBase,
        () => manageConnections([{ name: CANDIDATE_TOOLKITS[0], action: "list" }]),
        "Composio accepted a connection-status request.",
      ),
    );
  }

  const storageBase = { id: "storage" as const, label: "File storage", required: false };
  const storageExcluded =
    capabilities.skills.state === "excluded" &&
    !process.env.EVE_ENABLED_FEATURES?.split(",").includes("file-sharing");
  if (storageExcluded) {
    checks.push(excluded(storageBase, "Durable files and skills are not included."));
  } else if (!environmentReady("BLOB_READ_WRITE_TOKEN")) {
    checks.push(setup(storageBase, "Add BLOB_READ_WRITE_TOKEN for files and saved skills."));
  } else {
    checks.push(
      await probe(
        storageBase,
        async () => {
          await listBlobs({ limit: 1 });
        },
        "Vercel Blob accepted a list request.",
      ),
    );
  }

  const requiredIssue = checks.some(
    (check) => check.required && (check.state === "setup_required" || check.state === "error"),
  );
  const providerError = checks.some((check) => check.state === "error");
  const report: ReadinessReport = {
    checkedAt: new Date().toISOString(),
    overall: requiredIssue ? "action_required" : providerError ? "degraded" : "ready",
    checks,
  };
  cached = { report, at: now };
  return report;
}
