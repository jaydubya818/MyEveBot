import { expect, it, vi } from "vitest";
import { digest } from "../engineering/contract.ts";
import { factoryExecutionConfigurationHash } from "../engineering/factory-configuration-hash.ts";
import { permitFixture } from "./permit-test-fixture.ts";

/** Hosted private beta: the Factory qualification scope is the capability owner (myeve.hosted:<installation>:<owner>), never the Work owner id. */
const scope = vi.hoisted(() => ({ hosted: false }));
vi.mock("../capability-control/owner-scope.ts", () => ({ capabilityOwnerId: (ownerId: string) => scope.hosted ? `myeve.hosted:jay:${ownerId}` : ownerId }));
const { assertOwnerFactoryConfiguration } = await import("./owner-factory-binding.ts");

const sourceDigest = "1".repeat(64), configurationDigest = "2".repeat(64), factoryVersion = digest({ sourceDigest, configurationDigest });
const profile = { repository: "jaydubya818/sofie-first-build", policyVersion: 1 };
const config = (scopeId: string) => ({ engineering: { ownerId: "owner", agentId: "agent_1", profile }, commands: ["npm test"],
  connection: { origin: "http://127.0.0.1:8783", factoryId: "f", sourceDigest, configurationDigest, factoryVersion,
    qualification: { scopeId, profileHash: digest(profile), qualifiedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(), mode: "LIVE", spendEnforced: true } } }) as never;
const work = { id: "w1", scopeId: "owner", version: 1, generation: 1, criteriaVersion: 1, title: "t", objective: "o", criteria: [], repository: profile.repository, maxCostUsd: 1.3, maxDurationSeconds: 600 } as never;
const enrollmentFor = (c: never) => ({ ...permitFixture({ ownerId: "owner", workId: "w1", workVersion: 1, workGeneration: 1, tupleSha256: "a".repeat(64), maxCostMicrousd: 1_300_000, maxDurationSeconds: 600 }).enrollment,
  installationId: "jay", factoryVersion, ownerFactoryAdapter: { factoryId: "f", sourceDigest, configurationDigest, configurationHash: factoryExecutionConfigurationHash(c), profileHash: digest(profile),
    repository: profile.repository, agentId: "agent_1" } }) as never;

it("hosted: accepts the Factory qualified for the hosted per-person scope and refuses one qualified for the plain owner id", () => {
  scope.hosted = true;
  const hosted = config("myeve.hosted:jay:owner"), plain = config("owner");
  expect(assertOwnerFactoryConfiguration(work, enrollmentFor(hosted), hosted)).toMatch(/^[a-f0-9]{64}$/);
  expect(() => assertOwnerFactoryConfiguration(work, enrollmentFor(plain), plain)).toThrow("MISSIONCONTROL_OWNER_FACTORY_BINDING_DENIED");
});
it("not hosted: unchanged, the qualification scope must be the Work owner", () => {
  scope.hosted = false;
  const plain = config("owner"), hosted = config("myeve.hosted:jay:owner");
  expect(assertOwnerFactoryConfiguration(work, enrollmentFor(plain), plain)).toMatch(/^[a-f0-9]{64}$/);
  expect(() => assertOwnerFactoryConfiguration(work, enrollmentFor(hosted), hosted)).toThrow("MISSIONCONTROL_OWNER_FACTORY_BINDING_DENIED");
});
