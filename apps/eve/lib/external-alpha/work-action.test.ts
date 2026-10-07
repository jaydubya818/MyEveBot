import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { digest } from "../engineering/contract.ts";
import { engineeringWorkEnabled, hostedFactoryQueue } from "../engineering/deployment-mode.ts";
import { externalAlphaLimits, externalAlphaPolicySchema } from "./policy.ts";
import { externalAlphaCanonicalCreate } from "./work-action.ts";
import { externalAlphaWorkConfig, externalAlphaWorkEnabled } from "./work-config.ts";
import {
  alphaTasksCriteria,
  alphaTasksCriteriaSha256,
  alphaTasksObjective,
  alphaTasksTitle,
  alphaTasksTupleSha256,
  canonicalAlphaTasksWork,
  deterministicUuid,
} from "./work-tuple.ts";
import { canonicalJson, requestIdFor, uuidFromHex, writerIdFor } from "./work-authority.ts";

const owner = randomUUID();
const policy = externalAlphaPolicySchema.parse({
  version: 1, kind: "TWO_EXTERNAL_OWNERS_V1", cohortId: randomUUID(), slot: "1", ownerId: owner,
  projectId: "prj_fixtureproject1", clientId: "external-alpha-" + "a".repeat(32), repository: "fixture/myeve-alpha-workspace-01",
  baseSha: "1".repeat(40), treeSha: "2".repeat(40), workspacePolicy: "ISOLATED_WORKSPACE_V1", dayBoundary: "UTC_MIDNIGHT",
  model: "openai/gpt-5.4-mini", provider: "vercel-ai-gateway/openai", sourceDigest: "3".repeat(64), factoryVersion: "4".repeat(64),
  limits: { ...externalAlphaLimits }, publication: false, automaticRepair: false, fallback: false,
});
const workConfig = {
  allowedFiles: ["src/a.ts"], checkCommands: ["npm test"],
  factory: { origin: "https://myfactory-cloud-production.vercel.app", trustedTeamId: "team_x", receiptKeys: [{ keyId: "a".repeat(64), publicKey: "k" }] },
};
const installed = (over: Record<string, string> = {}) =>
  ({
    VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: policy.projectId, MYEVE_OWNER_ID: owner,
    MYEVE_EXTERNAL_ALPHA_POLICY: JSON.stringify(policy), MYEVE_EXTERNAL_ALPHA_POLICY_SHA256: digest(policy),
    MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify(workConfig), MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: "pem", ...over,
  }) as unknown as NodeJS.ProcessEnv;

describe("canonical first-project tuple", () => {
  it("pins the ten criteria and both digests", () => {
    expect(alphaTasksCriteria).toHaveLength(10);
    expect(alphaTasksCriteriaSha256).toBe("266874e4e72dcce0f02ff58bedf56801d6e9906080ed6e7b987dc6537a20b466");
    expect(alphaTasksTupleSha256).toBe("22768f0af6d9aa49f6f0c6553bf1a44ee7599377c1b1935904b998167bf70577");
  });
  it("derives stable ids that a different owner or index cannot collide with", () => {
    const a = canonicalAlphaTasksWork("o/r", "owner-1"), b = canonicalAlphaTasksWork("o/r", "owner-1"), c = canonicalAlphaTasksWork("o/r", "owner-2");
    expect(a).toEqual(b);
    expect(a.idempotencyKey).not.toBe(c.idempotencyKey);
    expect(new Set(a.criteria.map((x) => x.id)).size).toBe(10);
    expect(deterministicUuid("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("identifier derivation matches the documented construction", () => {
    const key = "0123456789abcdef".repeat(4);
    const id = uuidFromHex(key);
    expect(id).toBe("01234567-89ab-8def-a123-456789abcdef");
    expect(requestIdFor(id)).not.toBe(writerIdFor(id));
  });
  it("canonicalJson equals the engineering digest ordering", () => {
    const v = { b: [{ z: 1, a: 2 }], a: "x" };
    expect(canonicalJson(v)).toBe('{"a":"x","b":[{"a":2,"z":1}]}');
    expect(digest(v)).toBe(require("node:crypto").createHash("sha256").update(canonicalJson(v)).digest("hex"));
  });
});

describe("externalAlphaCanonicalCreate", () => {
  const good = () => ({
    title: alphaTasksTitle, objective: alphaTasksObjective, repository: policy.repository, maxCostUsd: 1.3, maxDurationSeconds: 180,
    criteria: alphaTasksCriteria.map((statement) => ({ statement, method: "test" })),
  });
  const env = installed();
  it("normalises the canonical request to the server's stable ids", () => {
    const out = externalAlphaCanonicalCreate(good(), owner, env);
    expect(out).toEqual(canonicalAlphaTasksWork(policy.repository, owner));
  });
  it("refuses everything else with the canonical instruction", () => {
    const bad = [
      { ...good(), title: "Other" }, { ...good(), objective: "Other" }, { ...good(), repository: "x/y" },
      { ...good(), maxCostUsd: 2 }, { ...good(), maxDurationSeconds: 600 },
      { ...good(), criteria: good().criteria.slice(1) },
      { ...good(), criteria: good().criteria.map((c, i) => (i ? c : { ...c, method: "human" })) },
      { ...good(), criteria: good().criteria.map((c, i) => (i ? c : { ...c, statement: c.statement + "." })) },
    ];
    for (const b of bad) expect(() => externalAlphaCanonicalCreate(b, owner, env)).toThrow(/EXTERNAL_ALPHA_TUPLE_MISMATCH/);
    expect(() => externalAlphaCanonicalCreate(undefined, owner, env)).toThrow(/TUPLE_MISMATCH/);
    expect(() => externalAlphaCanonicalCreate(good(), randomUUID(), env)).toThrow(/NOT_ELIGIBLE/);
    expect(() => externalAlphaCanonicalCreate(good(), owner, {} as NodeJS.ProcessEnv)).toThrow();
  });
});

describe("enablement is limited to a fully provisioned external-alpha installation", () => {
  it("is true only with policy, Work configuration and a signing key", () => {
    expect(externalAlphaWorkEnabled(installed())).toBe(true);
    expect(externalAlphaWorkEnabled(installed({ MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: "" }))).toBe(false);
    expect(externalAlphaWorkEnabled(installed({ MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: "" }))).toBe(false);
    expect(externalAlphaWorkEnabled(installed({ MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: "{" }))).toBe(false);
    expect(externalAlphaWorkEnabled(installed({ MYEVE_EXTERNAL_ALPHA_POLICY_SHA256: "0".repeat(64) }))).toBe(false);
    expect(externalAlphaWorkEnabled(installed({ MYEVE_ALPHA_OWNER_BINDING: "{}" }))).toBe(false); // canary binding conflicts
    expect(externalAlphaWorkEnabled(installed({ MYEVE_PRODUCTION_CANARY_CONFIG: "{}" }))).toBe(false);
    expect(externalAlphaWorkEnabled(installed({ VERCEL_ENV: "preview" }))).toBe(false);
    // An installation name without policy is still not enabled (fail closed).
    expect(externalAlphaWorkEnabled({ EVE_PROJECT_NAME: "myeve-alpha-tester-1" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
  it("rejects non-production Factory origins and any path, port or credentials", () => {
    for (const origin of ["http://myfactory-cloud-production.vercel.app", "https://evil.example.com", "https://myfactory-cloud-production.vercel.app:8443", "https://u:p@myfactory-cloud-production.vercel.app", "https://myfactory-cloud-production.vercel.app/x"])
      expect(externalAlphaWorkConfig({ MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify({ ...workConfig, factory: { ...workConfig.factory, origin } }) } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
  it("leaves every non-external-alpha deployment, including the canary, unchanged", () => {
    const legacy = (env: NodeJS.ProcessEnv) =>
      (env.MYEVE_ENGINEERING_MODE === "dogfood" && env.VERCEL_ENV !== "production") || hostedFactoryQueue(env);
    const cases: Record<string, string>[] = [
      {}, { MYEVE_ENGINEERING_MODE: "dogfood" }, { MYEVE_ENGINEERING_MODE: "dogfood", VERCEL_ENV: "production" },
      { MYEVE_BETA_MODE: "private-alpha", MYEVE_ENGINEERING_MODE: "private-alpha", MYEVE_FACTORY_WORKER_ENABLED: "true", MYEVE_OWNER_ID: "o", MYEVE_FACTORY_ID: "f" },
      { MYEVE_ALPHA_OWNER_BINDING: "{}", MYEVE_PRODUCTION_CANARY_CONFIG: "{}", VERCEL: "1", VERCEL_ENV: "production" },
      { MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify(workConfig), MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: "x" },
    ];
    for (const c of cases) expect(engineeringWorkEnabled(c as unknown as NodeJS.ProcessEnv), JSON.stringify(c)).toBe(legacy(c as unknown as NodeJS.ProcessEnv));
    expect(engineeringWorkEnabled(installed())).toBe(true);
  });
});
