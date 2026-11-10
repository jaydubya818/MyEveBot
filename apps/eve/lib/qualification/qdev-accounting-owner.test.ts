import { expect, it } from "vitest";
import { deriveOwnerJourney, qdevAccountingOwnerId } from "./owner-request.ts";
import { qdevJourneyId } from "./custody-profile.ts";
import { validateJourneyPlan } from "./plan.ts";
import { ownerLocalBundleSchema } from "./host-source.ts";
// The qualified owner-local bundle (evidence-20261106T031610Z, non-secret, assembly omitted).
const bundle = {"version":2,"profile":"myeve.private-beta.owner/v1","installation":"owner-local","ownerId":"bd78f31f-b369-443a-a1d4-6d7d2ecc0118","notAfter":"2026-11-17T00:00:00.000Z","template":{"installation":{"profile":"myeve.private-beta.owner/v1","environment":"myeve-pb-owner-local","repository":"local/dashboard","inputCommit":"d1619cc870ad63e4442e078e73dad377dfb3ccf6","inputTree":"396f4b7240ef2aaccc79e73f1d2757f9d322f69f","outputBranch":"sofie/owner-requests","operatingProfileSha256":"af38f27117c06e8286efad32e70247e6bb86aa57abb28a3e2cc6edf6b9ea6943","factoryVersionSha256":"b001b63ea6a3443badfdc66aad5e9d541a179718c7414904e66bd2e34a4b8a16","sources":{"myeve":"23eeeb0b412a67b1a20ae12a428de568f20c1c6d","factory":"5d47955f84e95e9cf15c31937dbf64cfc0feb827","relay":"e5166e07c6eea366cee92e0511800bdbff620d5a","missioncontrol":"d03748e910b313e4e87b98943942922e89a73e1c"}},"plan":{"slot":"Q1","stages":[{"stage":1,"workCeilingMicrousd":1300000,"operations":[{"key":"s1-coding","purpose":"CODING","reserveMicrousd":650000}]},{"stage":2,"workCeilingMicrousd":1300000,"operations":[{"key":"s2-coding","purpose":"CODING","reserveMicrousd":650000}]},{"stage":3,"workCeilingMicrousd":1300000,"operations":[{"key":"s3-factory","purpose":"FACTORY","reserveMicrousd":650000}]},{"stage":4,"workCeilingMicrousd":1300000,"operations":[{"key":"s4-verifier","purpose":"VERIFIER","reserveMicrousd":650000}]}]}},"credentials":{"accounting":"QDEV_ACCOUNTING_CREDENTIAL","relay":"QDEV_RELAY_CREDENTIAL","accountingDatabaseUrl":"QDEV_ACCOUNTING_DATABASE_URL","journalDatabaseUrl":"QDEV_JOURNAL_DATABASE_URL"},"relay":{"origin":"https://relay.owner-local.invalid","grant":{"connectionId":"owner-local-no-relay","repository":"local/dashboard","baseCommit":"d1619cc870ad63e4442e078e73dad377dfb3ccf6","outputBranch":"sofie/owner-requests","permissions":{"metadata":"read","contents":"write","actions":"read","deployments":"read"},"repositoryAdmin":false,"workflowEdit":false,"productionDeployment":false}},"conversation":{"deliveryUrl":"http://127.0.0.1:8796/"}} as const;

/** Hosted owner "owner" (not a UUID): the hash-pinned accounting ledger sees a stable derived UUID; everything else keeps the MyEve owner id. */
it("maps a non-UUID owner to a stable UUID for accounting only, and leaves UUID owners unchanged", () => {
  const uuid = "bd78f31f-b369-443a-a1d4-6d7d2ecc0118";
  expect(qdevAccountingOwnerId(uuid)).toBe(uuid);
  const a = qdevAccountingOwnerId("owner");
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(qdevAccountingOwnerId("owner")).toBe(a);
  expect(qdevAccountingOwnerId("jay")).not.toBe(a);
});
it("derives a hosted journey for owner 'owner' whose policy owner is the accounting UUID and whose journal id is accepted", () => {
  const t = bundle.template as never;
  const d = deriveOwnerJourney({ ownerId: "owner", template: t, request: "Build a small dashboard with three KPI tiles." });
  expect(d.policy.ownerId).toBe(qdevAccountingOwnerId("owner"));
  expect(qdevJourneyId("owner", d.project, d.policy, validateJourneyPlan(d.plan))).toMatch(/^[a-f0-9]{64}$/);
  expect(() => qdevJourneyId("someone-else", d.project, d.policy, validateJourneyPlan(d.plan))).toThrow("QDEV_JOURNEY_POLICY_OWNER");
  expect(ownerLocalBundleSchema.safeParse({ ...bundle, ownerId: "owner" }).success).toBe(true);
});
