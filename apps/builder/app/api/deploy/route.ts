import { assembleDeployment, templateFiles, templateInfo } from "@/lib/assemble";
import { requiredKeys, validateConfig, type AgentConfig, type DeployTarget } from "@/lib/config";
import { validCron } from "@/lib/schedule-codegen";
import { resolveBetaRelayTrust } from "@/lib/relay-trust";
import { buildEnv, connectStorage } from "@/lib/deploy-service";
import {
  assertRequiredProjectEnvKeys,
  createDeployment,
  createProject,
  listProjectEnvKeys,
  upsertEnv,
  VercelApiError,
} from "@/lib/vercel-api";

// The deploy pipeline: project → storage connections → env vars →
// deployment, all against the user's Vercel account with their token.
// Secrets exist only inside this request; the builder stores nothing.
// `dryRun` returns the assembled file list and env keys for the review step
// without touching any account.

export const maxDuration = 120;

interface DeployRequest {
  target?: DeployTarget;
  config?: AgentConfig;
  dryRun?: boolean;
  /** Required to deploy into a project that already exists (replaces its
   * env vars and production deployment); without it we return 409 so the
   * wizard can ask the user first. */
  confirmExisting?: boolean;
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as DeployRequest | null;
  if (body === null || body.config === undefined) {
    return Response.json({ error: "Missing config" }, { status: 400 });
  }
  const config = body.config;

  const problem = validateConfig(config);
  if (problem !== null) return Response.json({ error: problem }, { status: 400 });
  for (const schedule of config.schedules) {
    if (!validCron(schedule.cron)) {
      return Response.json(
        { error: `Invalid cron expression: ${schedule.cron}` },
        { status: 400 },
      );
    }
  }

  const info = await templateInfo();
  const stamps = {
    templateVersion: info.version,
    templateRelease: info.release,
    builderUrl: new URL(request.url).origin,
  };

  if (body.dryRun === true) {
    const files = await templateFiles(config.features);
    const envKeys = buildEnv(config, stamps).map((entry) => entry.key);
    if (config.relay) envKeys.push(
      "MYEVE_RELAY_ENABLED", "MYEVE_RELAY_ORIGIN", "MYEVE_RELAY_KEY_ID",
      "MYEVE_RELAY_KEY_VERSION", "MYEVE_RELAY_PUBLIC_KEY",
      "MYEVE_RELAY_ENCRYPTION_KEY", "MYEVE_RELAY_ARTIFACT_PRIVATE_KEY",
    );
    if (config.postgres.mode === "create") envKeys.push("DATABASE_URL (new Neon database)");
    if (config.postgres.mode === "connect") envKeys.push("DATABASE_URL (from connected database)");
    if (requiredKeys(config.features).blob && config.blob.mode !== "manual") {
      envKeys.push("BLOB_READ_WRITE_TOKEN (from Blob store)");
    }
    const scheduleFiles = config.schedules.map((_, index) => `agent/schedules/custom-*.ts (#${index + 1})`);
    return Response.json({ files: [...files, ...scheduleFiles], envKeys });
  }

  const target = body.target;
  if (target === undefined || typeof target.token !== "string" || target.token.trim().length === 0) {
    return Response.json({ error: "Missing Vercel token" }, { status: 400 });
  }
  const token = target.token.trim();
  const teamId = target.teamId ?? null;

  try {
    // Resolve and verify trust before creating or changing a project. A URL
    // lookup alone never authorizes a signing key; the owner enters its
    // independently supplied fingerprint in the wizard.
    const relay = config.relay
      ? await resolveBetaRelayTrust(config.relay.fingerprint)
      : null;
    const project = await createProject(token, teamId, config.projectName);
    if (project.existed && relay) {
      return Response.json({
        error: "Relay pairing is available only for a new MyEve project in this beta. An existing project needs a separate key-preserving migration.",
        stage: "relay",
      }, { status: 409 });
    }
    // Nothing has been mutated yet on the existing-project path (createProject
    // only reads it), so this is a safe place to stop and ask.
    if (project.existed && body.confirmExisting !== true) {
      return Response.json(
        {
          error: `A project named "${project.name}" already exists on this Vercel account. Deploying into it will replace its environment variables and production deployment.`,
          code: "project_exists",
        },
        { status: 409 },
      );
    }
    await connectStorage(token, teamId, project.id, project.name, config);
    let env = buildEnv(config, stamps, relay);
    if (project.existed) {
      // Redeploying into an existing agent: keep its VAPID key pair so the
      // browser push subscriptions signed against the old public key survive.
      const existingKeys = await listProjectEnvKeys(token, teamId, project.id);
      if (
        existingKeys.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY") &&
        existingKeys.includes("VAPID_PRIVATE_KEY")
      ) {
        env = env.filter(
          (entry) =>
            entry.key !== "NEXT_PUBLIC_VAPID_PUBLIC_KEY" && entry.key !== "VAPID_PRIVATE_KEY",
        );
      }
    }
    await upsertEnv(token, teamId, project.id, env);
    const persistedEnvKeys = await listProjectEnvKeys(token, teamId, project.id, "env");
    assertRequiredProjectEnvKeys(
      persistedEnvKeys,
      buildEnv(config, stamps, relay).map((entry) => entry.key),
    );
    const files = await assembleDeployment(config);
    const deployment = await createDeployment(token, teamId, project.name, files);
    return Response.json({
      projectId: project.id,
      projectName: project.name,
      projectExisted: project.existed,
      deploymentId: deployment.id,
      url: deployment.url,
      inspectorUrl: deployment.inspectorUrl,
      readyState: deployment.readyState,
    });
  } catch (error) {
    if (error instanceof VercelApiError) {
      console.error(`deploy failed at ${error.stage}:`, error.message);
      return Response.json({ error: error.message, stage: error.stage }, { status: 502 });
    }
    console.error("deploy failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Deploy failed", stage: "deploy" },
      { status: 500 },
    );
  }
}
