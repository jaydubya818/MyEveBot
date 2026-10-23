export const CURRENT_DATABASE_MIGRATION = "0109_external_alpha_chat_only.sql";

// Existing installations keep their qualified schema requirement until the
// operator installs the corresponding schema and explicitly enables its rollout.
export function requiredDatabaseMigration(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MYEVE_EXTERNAL_ALPHA_POLICY && env.MYEVE_APPLICATION_PASSWORDS === "true") return CURRENT_DATABASE_MIGRATION;
  if (env.MYEVE_APPLICATION_PASSWORDS === "true") return "0108_application_passwords.sql";
  if (env.MYEVE_MISSIONCONTROL_MODE === 'APPROVED_NONPRODUCTION') return "0107_factory_preparation_generation_guard.sql";
  if (env.MYEVE_EXTERNAL_ALPHA_POLICY) return "0092_private_result_acceptance.sql";
  if (env.MYEVE_ALPHA_OWNER_BINDING) return "0084_three_owner_cloud_accounting.sql";
  return env.MYEVE_DURABLE_WEB_SESSIONS === "true"
    ? "0083_web_session_revocations.sql"
    : "0082_factory_concrete_grant_binding.sql";
}
