import assert from "node:assert/strict";
import { test } from "node:test";

import { assertDeletionAuthorization, type DeletionPermit } from "./managed-delete";
import { newManagedEnvironment } from "./managed-environment";

const now = new Date("2026-09-26T14:00:00Z");
const permit: DeletionPermit = {
  environmentId: "environment-one", email: "tester@example.invalid",
  projectId: "prj_one", databaseStoreId: "store_one", blobStoreId: null,
  archiveSha256: "a".repeat(64), approvedAt: "2026-09-26T13:00:00Z",
  ownerArchiveDelivered: true, confirmation: "DELETE environment-one",
};
const environment = {
  ...newManagedEnvironment({ email: permit.email, projectName: "eve-one", now }),
  id: permit.environmentId, state: "healthy" as const,
  projectId: permit.projectId, databaseStoreId: permit.databaseStoreId,
  origin: "https://eve-one.vercel.app", lastExportSha256: permit.archiveSha256,
  lastExportAt: "2026-09-26T13:30:00Z", lastExportSource: "control-plane" as const,
};
const accepted = { permit, permitSha256: "b".repeat(64), archiveSha256: permit.archiveSha256,
  ownerEmail: permit.email, projectName: environment.projectName, environment, now };

test("owner deletion requires exact resource IDs, archive, custody, and authorization", () => {
  assert.doesNotThrow(() => assertDeletionAuthorization(accepted));
  assert.throws(() => assertDeletionAuthorization({ ...accepted, archiveSha256: "c".repeat(64) }), /authorization/);
  assert.throws(() => assertDeletionAuthorization({ ...accepted, permit: { ...permit, projectId: "prj_other" } }), /resource IDs/);
  assert.throws(() => assertDeletionAuthorization({ ...accepted, permit: { ...permit, confirmation: "DELETE something-else" } }), /authorization/);
  assert.throws(() => assertDeletionAuthorization({ ...accepted, environment: {
    ...environment, lastExportSource: "owner-provided",
  } }), /resource IDs/);
  assert.throws(() => assertDeletionAuthorization({ ...accepted, environment: {
    ...environment, lastExportAt: "2026-09-24T13:00:00Z",
  } }), /24 hours/);
});

test("an in-progress deletion resumes only with the same authorization digest", () => {
  const deleting = { ...environment, state: "deleting" as const, deletionAuthorizationSha256: accepted.permitSha256 };
  const later = new Date("2026-10-05T14:00:00Z");
  assert.doesNotThrow(() => assertDeletionAuthorization({ ...accepted, environment: deleting, now: later }));
  assert.throws(() => assertDeletionAuthorization({ ...accepted, environment: deleting,
    permitSha256: "c".repeat(64), now: later }), /resource IDs/);
});
