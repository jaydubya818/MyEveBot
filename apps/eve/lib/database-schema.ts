export const CURRENT_DATABASE_MIGRATION = "0111_external_alpha_access_extension.sql";

// Existing installations keep their qualified schema requirement until the
// operator installs the corresponding schema and explicitly enables its rollout.
export function requiredDatabaseMigration(env: NodeJS.ProcessEnv = process.env): string {
  // Every external-alpha installation reads external_alpha_policy.extended_until (0111, additive,
  // default off), so it requires 0111. 0111 sorts after 0110, so hosted testers also get the mailbox.
  if (env.MYEVE_EXTERNAL_ALPHA_POLICY) return CURRENT_DATABASE_MIGRATION;
  // Hosted private beta (mailbox + private previews) only: its additive tables are required once the hosted profile is configured.
  if (env.MYEVE_HOSTED_PROFILE) return "0110_hosted_factory_mailbox.sql";
  if (env.MYEVE_APPLICATION_PASSWORDS === "true") return "0108_application_passwords.sql";
  if (env.MYEVE_MISSIONCONTROL_MODE === 'APPROVED_NONPRODUCTION') return "0107_factory_preparation_generation_guard.sql";
  if (env.MYEVE_ALPHA_OWNER_BINDING) return "0084_three_owner_cloud_accounting.sql";
  return env.MYEVE_DURABLE_WEB_SESSIONS === "true"
    ? "0083_web_session_revocations.sql"
    : "0082_factory_concrete_grant_binding.sql";
}
