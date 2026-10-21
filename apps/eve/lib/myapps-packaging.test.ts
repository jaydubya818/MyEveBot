import { expect, test } from "vitest";
import { CAPABILITY_DEFINITIONS, getAvailableCapabilities, getCapability } from "./capability-registry.ts";

test("packaged MyApps has one existing catalog owner and grants no general discovery authority", () => {
  expect(CAPABILITY_DEFINITIONS.filter((entry) => entry.source.reference === "agent/tools/installed_apps.ts")).toHaveLength(1);
  const environments: NodeJS.ProcessEnv[] = [
    { NODE_ENV: "test" },
    { NODE_ENV: "production", MYAPPS_LOCAL_INTEGRATION: "1", DATABASE_URL: "postgres://fixture" },
    { NODE_ENV: "development", VERCEL: "1", MYAPPS_LOCAL_INTEGRATION: "1" },
    { NODE_ENV: "development", MYAPPS_LOCAL_INTEGRATION: "1" },
  ];
  for (const env of environments) {
    const capability = getCapability("tool.installed_apps", env);
    expect(capability?.availability).toMatchObject({ status: "disabled", configured: false });
    expect(capability?.permissions).toEqual(["apps.query", "apps.command"]);
    expect(getAvailableCapabilities({}, env).some((entry) => entry.id === "tool.installed_apps")).toBe(false);
  }
});
