import { describe, expect, it } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { digest } from "../engineering/contract.ts";
import { engineeringWorkEnabled, hostedFactoryQueue } from "../engineering/deployment-mode.ts";
import { externalAlphaLimits, externalAlphaPolicySchema } from "./policy.ts";
import { externalAlphaCanonicalCreate } from "./work-action.ts";
import { assertExternalAlphaWorkBinding, externalAlphaFactoryPinSha256, externalAlphaWorkConfig, externalAlphaWorkConfigSchema, externalAlphaWorkEnabled } from "./work-config.ts";
import {
  fixtureConfigurationDigest, fixtureFactoryId, fixtureFactoryVersion, fixtureResultKeys, fixtureSourceDigest, fixtureVerifierPolicySha256,
} from "./result-test-fixture.ts";
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
  model: "openai/gpt-5.4-mini", provider: "vercel-ai-gateway/openai", sourceDigest: fixtureSourceDigest, factoryVersion: fixtureFactoryVersion,
  limits: { ...externalAlphaLimits }, publication: false, automaticRepair: false, fallback: false,
});
const receiptPair = generateKeyPairSync("ed25519");
const receiptPublicKey = receiptPair.publicKey.export({ type: "spki", format: "pem" }) as string;
const receiptKeyId = require("node:crypto").createHash("sha256").update(receiptPair.publicKey.export({ type: "spki", format: "der" })).digest("hex");
const workConfig = {
  allowedFiles: ["src/a.ts"], checkCommands: ["npm test"],
  factory: {
    origin: "https://fixture-alpha-factory.vercel.app", trustedTeamId: "team_x", receiptKeys: [{ keyId: receiptKeyId, publicKey: receiptPublicKey }],
    resultVerification: {
      factoryId: fixtureFactoryId, sourceDigest: fixtureSourceDigest, configurationDigest: fixtureConfigurationDigest,
      verifierPolicySha256: fixtureVerifierPolicySha256, resultKeys: [fixtureResultKeys().key],
    },
  },
};
const signingKey = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }) as string;
const pin = externalAlphaFactoryPinSha256(policy, externalAlphaWorkConfigSchema.parse(workConfig));
const installed = (over: Record<string, string> = {}) =>
  ({
    VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: policy.projectId, MYEVE_OWNER_ID: owner,
    MYEVE_EXTERNAL_ALPHA_POLICY: JSON.stringify(policy), MYEVE_EXTERNAL_ALPHA_POLICY_SHA256: digest(policy),
    MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify(workConfig), MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN: workConfig.factory.origin, MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: signingKey,
    EVE_PROJECT_NAME: "myeve-alpha-tester-1", MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256: pin, ...over,
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
    for (const origin of ["http://myfactory-cloud-production.vercel.app", "https://evil.example.com", "https://fixture-alpha-factory.vercel.app:8443", "https://u:p@myfactory-cloud-production.vercel.app", "https://fixture-alpha-factory.vercel.app/x"])
      expect(externalAlphaWorkConfig({ MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify({ ...workConfig, factory: { ...workConfig.factory, origin } }) } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
  it("leaves every non-external-alpha deployment, including the canary, unchanged", () => {
    const legacy = (env: NodeJS.ProcessEnv) =>
      (env.MYEVE_ENGINEERING_MODE === "dogfood" && env.VERCEL_ENV !== "production") || hostedFactoryQueue(env);
    const cases: Record<string, string>[] = [
      {}, { MYEVE_ENGINEERING_MODE: "dogfood" }, { MYEVE_ENGINEERING_MODE: "dogfood", VERCEL_ENV: "production" },
      { MYEVE_BETA_MODE: "private-alpha", MYEVE_ENGINEERING_MODE: "private-alpha", MYEVE_FACTORY_WORKER_ENABLED: "true", MYEVE_OWNER_ID: "o", MYEVE_FACTORY_ID: "f" },
      { MYEVE_ALPHA_OWNER_BINDING: "{}", MYEVE_PRODUCTION_CANARY_CONFIG: "{}", VERCEL: "1", VERCEL_ENV: "production" },
      { MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify(workConfig), MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN: workConfig.factory.origin, MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: signingKey },
    ];
    for (const c of cases) expect(engineeringWorkEnabled(c as unknown as NodeJS.ProcessEnv), JSON.stringify(c)).toBe(legacy(c as unknown as NodeJS.ProcessEnv));
    expect(engineeringWorkEnabled(installed())).toBe(true);
  });
});

describe("the Factory pin binds every field the Factory will recompute", () => {
  const cfg = () => externalAlphaWorkConfigSchema.parse(structuredClone(workConfig));
  it("is the digest of the exact projection and changes with every pinned field", () => {
    const base = externalAlphaFactoryPinSha256(policy, cfg());
    expect(base).toMatch(/^[a-f0-9]{64}$/);
    const variants: Array<[string, () => string]> = [
      ["cohort", () => externalAlphaFactoryPinSha256({ ...policy, cohortId: randomUUID() }, cfg())],
      ["owner", () => externalAlphaFactoryPinSha256({ ...policy, ownerId: randomUUID() }, cfg())],
      ["base", () => externalAlphaFactoryPinSha256({ ...policy, baseSha: "9".repeat(40) }, cfg())],
      ["tree", () => externalAlphaFactoryPinSha256({ ...policy, treeSha: "9".repeat(40) }, cfg())],
      ["project", () => externalAlphaFactoryPinSha256({ ...policy, projectId: "prj_other" }, cfg())],
      ["client", () => externalAlphaFactoryPinSha256({ ...policy, clientId: "external-alpha-" + "b".repeat(32) }, cfg())],
      ["files", () => externalAlphaFactoryPinSha256(policy, { ...cfg(), allowedFiles: ["src/a.ts", "src/b.ts"] })],
    ];
    for (const [name, f] of variants) expect(f(), name).not.toBe(base);
    // File order is not significant (the Factory sorts).
    expect(externalAlphaFactoryPinSha256(policy, { ...cfg(), allowedFiles: ["src/b.ts", "src/a.ts"] })).toBe(
      externalAlphaFactoryPinSha256(policy, { ...cfg(), allowedFiles: ["src/a.ts", "src/b.ts"] }),
    );
  });
  it("Work authority is unavailable unless the operator's pin equals MyEve's projection", () => {
    expect(externalAlphaWorkEnabled(installed())).toBe(true);
    for (const bad of ["", "0".repeat(64), "not-a-digest", pin.toUpperCase()])
      expect(externalAlphaWorkEnabled(installed({ MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256: bad })), bad).toBe(false);
    const e = installed();
    delete (e as Record<string, string | undefined>).MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256;
    expect(externalAlphaWorkEnabled(e)).toBe(false);
  });
  it("the result-verification pins must reproduce the policy FactoryVersion", () => {
    const wrong = cfg();
    wrong.factory.resultVerification.configurationDigest = "e".repeat(64);
    expect(() => assertExternalAlphaWorkBinding(policy, wrong, installed())).toThrow("EXTERNAL_ALPHA_FACTORY_VERSION_BINDING");
    const dup = cfg();
    dup.allowedFiles = ["src/a.ts", "src/a.ts"];
    expect(() => assertExternalAlphaWorkBinding(policy, dup, installed())).toThrow("EXTERNAL_ALPHA_FILES_DUPLICATE");
    expect(() => assertExternalAlphaWorkBinding(policy, cfg(), installed({ MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256: "0".repeat(64) }))).toThrow("EXTERNAL_ALPHA_FACTORY_PIN_MISMATCH");
    expect(() => assertExternalAlphaWorkBinding(policy, cfg(), installed())).not.toThrow();
  });
  it("a slot or workspace mismatch disables Work even with everything else correct", () => {
    expect(externalAlphaWorkEnabled(installed({ EVE_PROJECT_NAME: "myeve-alpha-tester-2" }))).toBe(false);
    expect(externalAlphaWorkEnabled(installed({ MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: "" }))).toBe(false);
  });
  it("rejects old Result families and reuse of the receipt signer for Result custody", () => {
    const old = structuredClone(workConfig);
    (old.factory.resultVerification as any).factoryId = "myfactory-cloud-production";
    expect(externalAlphaWorkEnabled(installed({ MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify(old) }))).toBe(false);
    const same = structuredClone(workConfig);
    same.factory.resultVerification.resultKeys[0].publicKey = receiptPublicKey;
    expect(externalAlphaWorkEnabled(installed({ MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify(same) }))).toBe(false);
  });

});
