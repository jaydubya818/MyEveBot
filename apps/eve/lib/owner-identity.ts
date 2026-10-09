function configuredValue(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

export function deploymentOwnerId(env: NodeJS.ProcessEnv = process.env): string {
  return (
    configuredValue(env, "MYEVE_OWNER_ID") ??
    configuredValue(env, "SOFIE_OWNER_ID") ??
    "owner"
  );
}
