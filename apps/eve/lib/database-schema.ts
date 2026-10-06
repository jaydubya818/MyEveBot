export const CURRENT_DATABASE_MIGRATION = "0084_three_owner_cloud_accounting.sql";

// Existing installations keep their qualified schema requirement until the
// operator installs the corresponding schema and explicitly enables its rollout.
export function requiredDatabaseMigration(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MYEVE_ALPHA_OWNER_BINDING) return CURRENT_DATABASE_MIGRATION;
  return env.MYEVE_DURABLE_WEB_SESSIONS === "true"
    ? "0083_web_session_revocations.sql"
    : "0082_factory_concrete_grant_binding.sql";
}
