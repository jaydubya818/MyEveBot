import { createHash, createHmac, generateKeyPairSync, verify } from "node:crypto";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalPermitJson } from "../missioncontrol/execution-permit.ts";
import { ownerFactoryWorkTuple } from "../missioncontrol/owner-factory-binding.ts";
import {
  confirmHostedRequest, confirmationDigest, confirmationSigningBytes, confirmationSubmission, hostedConfirmationBinding, hostedConfirmationSchema,
  hostedPlanSpecification, planContentDigest, signHostedConfirmation,
} from "./hosted-confirmation.ts";
import { assemblyProfileSchema } from "./custody-profile.ts";

const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const keys = generateKeyPairSync("ed25519");
const pem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const keyId = createHash("sha256").update(keys.publicKey.export({ type: "spki", format: "der" })).digest("hex");
const enrollment: any = { schema: "mc-owner-enrollment/v1", environment: "APPROVED_NONPRODUCTION", installationId: "inst-a", revision: 2, ownerId: "owner-a",
  ownerSubject: "user_a", missionControlOwnerId: "op-a", tenantId: "tenant", projectId: "project", connectionId: "conn-a", issuer: "https://mc.example.com",
  audience: "https://myeve.example.com", clerkIssuer: "https://dear-sunbird-98.clerk.accounts.dev", clerkAudience: "convex", clerkAuthorizedParty: "https://mc.example.com",
  activeFrom: 0, expiresAt: Date.now() + 3600_000, revokedAt: null, factoryVersion: hex("factory"), executionContractSha256: hex("contract"),
  capabilityPolicySha256: hex("policy"), maxCostMicrousd: 1_300_000, maxDurationSeconds: 180, permitKeys: [],
  ownerFactoryAdapter: { factoryId: "f", sourceDigest: hex("s"), configurationDigest: hex("c"), configurationHash: hex("h"), profileHash: hex("p"), repository: "jay/app", agentId: "agent" } };
const work = (stage: number): any => ({ id: `work-${stage}`, scopeId: "owner-a", version: 1, generation: 1, criteriaVersion: 1, title: `Stage ${stage}`, objective: "o",
  criteria: [], repository: "jay/app", maxCostUsd: 1.3, maxDurationSeconds: 180 });
const works = [work(1), work(2), work(3)];
const planSha256 = hex("journey-plan");
const plan = hostedPlanSpecification({ request: "Add a dark mode toggle", title: "Add a dark mode toggle", planSha256, repository: "jay/app", workflowId: "wf", workIds: works.map(w => w.id) });
const binding = hostedConfirmationBinding({ enrollment, proposalId: "prop-a", proposalDigest: "sha256:" + hex("proposal"), plan, planSha256, repository: "jay/app", works,
  maxCostMicrousd: 1_300_000, maxDurationSeconds: 180, now: 1_700_000_000_000, nonce: "4b2a4cf0-5b0e-4a7e-9a39-0b9a6c2f7d11" });

describe("hosted Sofie confirmation (MyEve side)", () => {
  it("binds the person, their installation/connection, the exact Plan, repository, Work tuples, limits, a <=10 minute window and a nonce", () => {
    expect(binding).toMatchObject({ schema: "myeve-hosted-confirmation/v1", installationId: "inst-a", subject: "user_a", myeveOwnerId: "owner-a", connectionId: "conn-a",
      enrollmentRevision: 2, repository: "jay/app", limits: { factoryVersion: hex("factory"), maxCostMicrousd: 1_300_000, maxDurationSeconds: 180 } });
    expect(binding.expiresAt - binding.issuedAt).toBeLessThanOrEqual(600_000);
    expect(binding.planContentSha256).toBe(planContentDigest(plan));
    expect(plan.metadata).toEqual({ myevePlanSha256: planSha256, works: ["work-1", "work-2", "work-3"] });
    expect(plan.workOrderBlueprints.map(b => b.id)).toEqual(["stage-1", "stage-2", "stage-3"]);
    expect(binding.works.map(w => w.tupleSha256)).toEqual(works.map(w => ownerFactoryWorkTuple(w, enrollment)));
    // Changing any Work or the Plan changes what is signed.
    expect(planContentDigest({ ...plan, summary: "x" })).not.toBe(binding.planContentSha256);
    expect(hostedConfirmationBinding({ enrollment, proposalId: "prop-a", proposalDigest: binding.proposalDigest, plan, planSha256, repository: "jay/app",
      works: [work(1), { ...work(2), generation: 2 }, work(3)], maxCostMicrousd: 1_300_000, maxDurationSeconds: 180, now: binding.issuedAt, nonce: binding.nonce }).works[1].tupleSha256)
      .not.toBe(binding.works[1].tupleSha256);
  });

  it("signs with the enrolled installation key only, and the submitter envelope names only the installation and the confirmation action", () => {
    const signed = signHostedConfirmation(binding, pem, keyId);
    expect(verify(null, confirmationSigningBytes(binding), keys.publicKey, Buffer.from(signed.signature, "base64url"))).toBe(true);
    expect(confirmationDigest(binding)).toBe(createHash("sha256").update(`myeve-hosted-confirmation/v1\n${canonicalPermitJson(binding)}`).digest("hex"));
    expect(() => signHostedConfirmation(binding, pem, hex("other-key"))).toThrow("HOSTED_CONFIRMATION_KEY");
    const secret = "s".repeat(40);
    const packet = confirmationSubmission("sofie.confirmPlan", { installationId: "inst-a", confirmation: signed, submit: { envelope: {}, payloadJson: "{}" } }, "project", secret, 1_700_000_000_000);
    expect(packet.envelope).toMatchObject({ serviceId: "myeve-hosted-confirmation", capability: "sofie.confirmPlan", repositoryId: "installation:inst-a",
      expiresAt: 1_700_000_060_000, payloadDigest: "sha256=" + createHash("sha256").update(packet.payloadJson).digest("hex") });
    const { signature, ...unsigned } = packet.envelope;
    expect(signature).toBe("sha256=" + createHmac("sha256", secret).update(["mc-service-command-v1", unsigned.serviceId, unsigned.capability, unsigned.projectId,
      unsigned.repositoryId, unsigned.commandId, String(unsigned.issuedAt), String(unsigned.expiresAt), unsigned.payloadDigest].join("\n")).digest("hex"));
    expect(JSON.parse(packet.payloadJson).schema).toBe("mc-sofie-confirmation-submission/v1");
    // Cross-repository parity fixture for MissionControl's verifier (written only when requested).
    if (process.env.MYEVE_CONFIRMATION_PARITY_OUT) writeFileSync(process.env.MYEVE_CONFIRMATION_PARITY_OUT, JSON.stringify({ binding, signed, packet, secret,
      publicKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString(), keyId }));
  });

  it("is hosted-profile only, and the configuration is non-secret and strict", async () => {
    await expect(confirmHostedRequest({ profile: "myeve.private-beta.owner/v1", installationId: "inst-a", missionControlOrigin: "https://mc.example.com",
      confirmation: {} as never, store: {} as never, base: {} as never, request: "r", planSha256, credential: () => undefined })).rejects.toThrow("HOSTED_CONFIRMATION_PROFILE");
    const config = { signerEnv: "MYEVE_CONFIRMATION_KEY", submitterEnv: "MYEVE_CONFIRMATION_SUBMITTER", connectionSecretEnv: "MYEVE_MISSIONCONTROL_SECRET", keyId,
      workflowId: "wf", stage: { maxCostUsd: 1.3, maxDurationSeconds: 180, budgetMinutes: 30, requestDeadlineSeconds: 300 } };
    expect(hostedConfirmationSchema.parse(config)).toEqual(config);
    expect(() => hostedConfirmationSchema.parse({ ...config, privateKey: pem })).toThrow();
    expect(() => hostedConfirmationSchema.parse({ ...config, stage: { ...config.stage, maxCostUsd: 1.31 } })).toThrow();
    expect(assemblyProfileSchema.shape.hostedConfirmation).toBeDefined();
  });
});
