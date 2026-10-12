# Installed MissionControl permits

This engineering candidate binds an owner-approved MissionControl Mission, Plan and WorkOrder revision to the existing canonical MyEve AlphaTasks Work. It adds no accounting ledger, Factory execution endpoint or execution budget. The installed runtime is not qualified for activation.

An operator-provisioned `mc-owner-enrollment/v1` document pins the MyEve owner, canonical MissionControl authentication subject, installation, connection, origins, FactoryVersion, execution contract, capability baseline and Ed25519 permit keys. Request handlers cannot create or replace enrollment. A signed execution permit lives at most five minutes; a separate signed admission receipt lives at most ten seconds and binds the fresh MyEve and Relay capability decisions. MyEve rechecks canonical policy, agent revision, receiver incarnation and enrollment, policy identity, Work generation and all expiries before retaining admission. PostgreSQL repeats the currentness check before local authority admission and dispatch. Shared reservation remains in the existing accounting path.

Retained permit, receipt, Work binding, control and original Factory readback records are immutable and owner-scoped. Controls commit their receiving fence before acknowledgment. A fence does not establish remote cleanup or release an UNKNOWN reservation. Revoke acknowledgment remains `PENDING_BACKEND` until canonical backend evidence establishes cleanup.

The Result endpoint accepts only the dedicated, short-lived connection HMAC request. It refreshes the existing Factory request with the canonical signed challenge verifier; this operation cannot issue, claim, replay, stop or settle execution. It returns original signed Factory evidence, retained Result and immutable Proof with the same Mission and Work identity. Stale Factory attestation remains pending. MissionControl independently verifies the evidence and must preserve PARTIAL and UNKNOWN outcomes.

## Migration and rollback

`0094_missioncontrol_permit_bindings.sql` is additive and installs no enrollment, key, grant or spending authority. Existing installations retain their previous required schema until this mode is enabled. Installing the migration on an existing database still requires the normal explicit migration authorization and a reviewed role-grant package. The canonical Work runtime must receive EXECUTE on `missioncontrol_assert_dispatch(text,uuid,integer,integer,boolean,text)` as part of that package; the installed application also needs narrowly scoped SELECT/INSERT and the documented enrollment/snapshot functions. Do not grant enrollment or policy-evidence mutations to the application role.

Rollback disables new admissions, reconciles retained authority through the original path, and retains the additive schema and all evidence. Never delete an enrollment or undo an accounting reservation to roll back application code. A restored database cannot be activated without an independently retained recovery witness and requalification.

## Remaining qualification

Installed action wiring, canonical Relay lease transport, durable control delivery, an independently retained hosted recovery witness, actual owner bindings, custody-derived FactoryVersions, the same-Mission MyApps package, hosted checks and installed Golden Journey remain required. Local synthetic PostgreSQL and protocol tests are engineering evidence only. The existing hosted capability guard remains in force; this change does not turn it off.
