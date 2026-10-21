# Owner Factory admission adapter

The existing authenticated owner enrollment may bind one reviewed Factory configuration through `ownerFactoryAdapter`. This metadata is local to MyEve. It does not create an account, installation, Factory qualification, execution authority, spending grant, or External Alpha slot.

Migration 0099 retains immutable owner/installation/Work/WorkOrder provenance before preparation. Receiving admission retains the exact signed MissionControl permit and receipt inside the existing capability-policy and route-admission transaction. The writer freezes the original Factory request, attempt, source/configuration/FactoryVersion, route decision and writer generation. A failed route commit rolls back its admission evidence. Backend checks remain independent of preference enablement.

Ordinary disable denies new admissions and preserves the admitted writer. Revoke fences dispatch, custody promotion, protected-verifier claims and renewal, and new native Proof. Cleanup calls the original writer ID, never the newest Work decision. Acknowledgment remains `PENDING_BACKEND` until fresh authenticated terminal resource and known accounting evidence is available. Diagnostic updates cannot renew backend observation freshness. Current-writer control reads precede new effects; bounded durable retries retain older unresolved acknowledgments after a Work-version handoff.

Owner Result readback projects the original Gate C envelope and native Proof into the existing authenticated MissionControl channel. It never creates an Alpha authority or replaces Result verification. The separate MissionControl owner verifier validates the exact immutable binding, signed Result, native Proof, fresh resource observation and accounting. Existing Alpha readback uses its exact migration-0100 DISPATCH receipt binding.

Qualification uses disposable localhost PostgreSQL databases, synthetic identities and keys. The admission suite covers positive canonical receiving transactions, cross-owner denial, stale and substituted permits, concurrent admissions, rollback, legacy/native bypass, disable/revoke, active verifier fencing and lost control acknowledgment after writer succession. Full MyEve MissionControl regression and TypeScript checks are required for this source. Migration governance/catalog reconciliation is owned by the unified integration workstream.

Installed owner configuration and custody remain separate gates. No migration was applied to an installed database. No remote Factory operation, paid execution, deployment, merge, credential mutation or tester activation is authorized by this source.

## Recovery and cross-consumer qualification

The existing operations monitor now retries owner controls independently of active Work steps. Signed callbacks select the backend by exact retained Work version, generation and tuple. Historical Alpha permits retain their original routing; an earlier active or UNKNOWN Alpha authority prevents owner-origin creation, and owner-origin Work cannot acquire a new Alpha authority. Removing optional adapter metadata cannot suppress retained control recovery. A missing runtime or unknown resource/accounting state retains the fence and reports pending cleanup.

Unenrolled statement-only Work stores preserve their prior behavior. Any enrolled owner requires a transactional store; the canonical enrollment lookup supplies that decision without interpreting RLS-hidden rows as absence. Missing schema or unavailable policy remains fail closed.

`owner-result-test-fixture.ts` uses real signed Gate C admission, signature-bound TestEvidence/DiffEvidence, protected cloud evidence projection and `NativeResultStore.retain`. Terminal resource custody and accounting are seeded in disposable PostgreSQL. This is deterministic receiver qualification, not evidence of a cloud execution or resource cleanup.

The optional exact-source consumer check runs with `MYEVE_OWNER_RESULT_MC_SOURCE` pointing to a clean MissionControl checkout and `MYEVE_OWNER_RESULT_MC_SHA` holding its full commit. Run the MissionControl MyEve Vitest suite with those variables plus the dedicated localhost `MYEVE_EXTERNAL_ALPHA_TEST_DATABASE`. The check authenticates the readback packet, verifies original Result and Proof through MissionControl, and rejects a validly re-signed foreign Mission and a substituted Factory attempt. Omitting these source variables leaves cross-consumer verification explicitly `NOT_RUN`.
