export const CURRENT_DATABASE_MIGRATION = "0083_web_session_revocations.sql";

// Existing installations keep their qualified schema requirement until the
// operator installs durable sessions and explicitly enables the rollout.
export function requiredDatabaseMigration(env: NodeJS.ProcessEnv = process.env): string {
  return env.MYEVE_DURABLE_WEB_SESSIONS === "true"
    ? CURRENT_DATABASE_MIGRATION
    : "0082_factory_concrete_grant_binding.sql";
}
