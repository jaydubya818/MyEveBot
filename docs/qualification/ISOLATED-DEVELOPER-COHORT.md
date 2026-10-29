# Isolated developer qualification: proposed operator runbook

Status: **BLOCKED — EXACT OWNER ACTIONS REQUIRED**. This is a preparation
contract, not a cohort grant, deployment approval, price renewal or release.

## Policy conclusion

A new database and new identities can establish a separate technical boundary.
Existing capability admission explicitly supports `qualification`. Existing
accounting schema installation creates no cohort or grant; it permits one
immutable cohort and two immutable slots per accounting database. Neither fact
authorizes a new funded qualification cohort. The current external-alpha release
also denies Work for a fresh activated cohort. An empty database, a new scope,
an omitted chat-only marker or an environment flag cannot authorize execution.

The shortest proposed path is **one separately funded nonproduction owner-origin
qualification journey**, with two new test owners: Q1 performs the journey and
Q2 is the cross-owner isolation control. Use dedicated qualification services,
not the production-only external-alpha host adapter or a generic Vercel preview
exception. The canonical capability policy and Work must share the application
database; give the recovery witness its own independently controlled database.

The release and financial authorities must expressly approve this new authority
boundary under their applicable policy. If their policy imposes a global hold on
the sponsor/provider account, that hold still applies. A new project, database or
billing label cannot evade it. Use separately approved funding without extending
or replacing the original testers' grants. No existing policy approval for this
new boundary has been established.

Historical remediation is a separate workstream. Keep original records,
UNKNOWN exposure, holds, custody references and all original denied cases
unchanged. Do not import or reinterpret them as zero in the new cohort. Do not
repeat historical searches to prepare this plan. New qualification proves only
the new tuple; it cannot qualify either original tester or clear a historical
security restriction. The new verifier must not replay or repackage prohibited
historical cases as new tests.

## Exact proposed scope

Proposal key: `qdev-20261029-01`. These are **requested resource names**, not
claims that cloud resources or user accounts exist. Operator-issued actual IDs,
principals, endpoints and immutable approval references must be recorded before
installation; no placeholder ID may reach admission.

The adjacent [machine-readable proposal](isolated-cohort-proposal.json) contains
the exact proposed bounds and null approval/resource/rollback references. It is
not accepted by any runtime as an authorization document. Owners approve a new
immutable charter through the canonical authority process; filling this JSON
with arbitrary strings cannot establish authority.

| System | Requested resources / binding |
|---|---|
| Qualification host | Dedicated nonproduction service environment `myeve-qdev-20261029`; paid dispatch OFF and no production credentials/routes. Separate app, Relay, Factory and MissionControl service identities; an independently controlled recovery witness. |
| PostgreSQL 17 | Separate logical databases `myeve_qdev_20261029_app`, `myeve_qdev_20261029_factory`, `myeve_qdev_20261029_relay`, `myeve_qdev_20261029_missioncontrol`, `myeve_qdev_20261029_accounting`, `myeve_qdev_20261029_witness`. Separate operator/auditor/runtime roles, no PUBLIC CONNECT or cross-service grants. App capability policy and Work use the same app database. |
| Authentication | Two newly created principals `qdev-20261029-q1` and `qdev-20261029-q2`, with new primary Agents and enrollment records. These labels are not authenticated owner IDs. Do not clone tester accounts, passwords, sessions, memory or allowances. |
| Artifact storage | New runtime store `myeve-qdev-20261029-artifacts`, private per owner/Work/attempt; immutable inventory and exact rollback bytes. No legacy store, public bucket or direct model credential. |
| Independent custody | `myeve-qdev-20261029-verifier` in a separately administered account/principal unavailable to coding agents and the producer. Protected criteria/keys/answers stay there; publish only specification identities, digests and artifact-bound verdict/Proof. A folder or separate role on the coding agent's unrestricted host is insufficient. |
| GitHub | Existing private `jaydubya818/myeve-beta-dashboard`; exact input commit `d1619cc870ad63e4442e078e73dad377dfb3ccf6`, tree `396f4b7240ef2aaccc79e73f1d2757f9d322f69f`. Proposed output branch `codex/qdev-20261029-journey`; do not seed it with the hand-built reference application. No production deployment. |
| Public requirements | Proposal commit `2fb0dba40295b7915756efc7e625753730f8221b`; criteria SHA256 `b315b6b6c0c8e6f7903d39026395afc7b59816247df0f6f1838d8ed82deb4348`. Custodian must finalize and protect a new immutable qualification specification before the journey. |

Proposed model-exposure ceiling for this **new** single journey: USD 5.20
(5,200,000 microUSD), at most four explicitly admitted sequential project Works,
at most USD 1.30 each, including all Sofie, coding, Factory and verifier model
exposure. Q2 receives no paid Work. These are proposed maximums, not available
balances or a claim that the existing runtime enforces this project parent.
If the chosen execution plan cannot fit, refuse it before dispatch; no automatic
retry, top-up, replacement Work or extension. Infrastructure/storage costs need
their own owner-approved hard ceiling before resource creation; no quote or
funding authority is inferred here. Existing provider rates alone do not cover
hosting, tools, tax or other charges.

## Minimum external actions, in order

| Action / owner | Exact system and resource; permission | Expected effect and cost | Rollback | Verification |
|---|---|---|---|---|
| 1. Release + financial authority | Approve immutable charter `qdev-20261029-01`, fresh owner/cohort identities, independent funding reference, maximum 5.20 USD model exposure, four Work maximum, concurrency one, expiry, infrastructure ceiling and current price revision. Authority must explicitly permit a new qualification cohort without borrowing historical grants. | Establishes the financial/policy basis only. Approval itself costs zero; no model call or resource purchase. Any account-wide financial/security hold still denies. | Revoke the new charter; retain every reservation and UNKNOWN. No refund, replacement cohort or allowance reset. | Independently authenticate approver and approval digest, funding scope and global-hold disposition. Reject missing scope, expiry, cap or economic-account authority. |
| 2. Platform + identity operator | Provision only the named qualification services/databases/stores and Q1/Q2; create nonproduction service roles and an operator-owned restore point. Allow reviewed schema installation only on the new target IDs. Do not change either tester installation. | Empty isolated stores and inactive enrollment. Charges depend on the selected host/provider and must fit the charter's infrastructure ceiling; actual quote required before create. No paid inference. | Disable new ingress/admission and revoke new credentials. Preserve databases, logs, artifacts and any uncertain resources. Restore only the new environment from its exact pre-run snapshot; no destructive automatic cleanup. | Record actual resource IDs/endpoints/principals and provider isolation controls. Run the read-only accounting preflight before enrollment, verify no inherited grants/data and test denied access from both historical and coding principals. Local fixture ACL tests do not establish real IAM isolation. |
| 3. GitHub / Relay administrator | Register a repo-specific nonproduction connection to `jaydubya818/myeve-beta-dashboard`, exact base above and approved output branch. Permit metadata/contents/actions/deployments read; contents write only through the admitted coding/publication boundary. No repository admin, workflow-edit or production deployment permission. | Real repo health discovery and authorized source retrieval/output. Access grant costs zero; hosted CI usage, if billable, needs the infrastructure ceiling. Tokens stay in the service; do not expose them to models. | Revoke the new connection/installation; freeze output branch and retain source/CI evidence. Never rewrite main or delete original history. | Authenticated Relay discovery and execution return the exact repo/base; foreign repository/owner denied. Verify output publication cannot trigger deployment before the first push. |
| 4. Independent reviewer + acceptance/custody operator | Establish supported human/authorized review and the separate verifier principal/store. Accept exact candidate source and the new public cohort/operating-profile contracts; finalize/protect acceptance and register immutable issuer/key-purpose/profile identities. | Independent source/specification verdicts and enforceable custody. Manual review/provisioning fees, if any, need explicit pricing. No grant to the restricted review chat and no rerouting the stopped experiment through another coding agent. | Revoke new verifier/issuer/profile authority, keep protected material and public digests under custodian retention. Admission remains OFF. | Coding and producer principals must fail to read/list holdouts or keys. Reviewer accepts exact source trees/artifacts; public results say PASS/FAIL/NOT_RUN with exact identities. A self-authored receipt is insufficient. |
| 5. Execution/release authority, after engineering revalidation | Approve one exact installed tuple and bounded run for Q1 at the approved dashboard baseline, profile, Work parent/children and fresh source/FactoryVersion. Permit the required nonproduction build, test, verifier and isolated MyApps serving operations only. | Enables the real journey within the signed charter, with all model routes reserved before dispatch. Maximum 5.20 USD model exposure plus separately capped infrastructure. Q2 remains an isolation control. | Revoke admission, fence original in-flight Work, stop through original authenticated controllers, retain UNKNOWN/full exposure and all evidence. Restore the exact pre-run MyApps revision if compatible. No automatic retry or new paid grant. | Independently join Sofie intent, plans, two coding sessions, Relay calls, actual generated Git source, build/test artifacts, protected verdict, signed Result/Proof, MyApps response bytes and interruption/recovery. Synthetic fixtures are not journey evidence. |

The independent reviewer access restriction remains in force. This runbook does
not authorize another agent to retry the stopped review or historical experiment.
Use only a supported process explicitly authorized by the responsible owner.
Action2 may create empty resources first. Schema installation and the preparation
audit require Action4's exact-source acceptance before operator use. The original
four tester Work gates stay unchanged; a new cohort needs a separately approved,
scope-bound qualification runner and actual evidence.

## Executable preparation and engineering handoff

On the newly provisioned **accounting** database, the operator installs the
exact independently reviewed schema/function files with enrollment and paid
dispatch OFF. Do not omit the current chat-only narrowing merely to make Work
possible. A new productive cohort contract requires separate review and explicit
adoption; the old broad schema is not a new paid grant.

Configure a new operator-owned `qdev_accounting_auditor` libpq service with the
exact target host/database/auditor role. Keep its service file and password file
outside coding-agent access; the Unix password file must have mode0600. Use
`PGSERVICEFILE`/`PGPASSFILE` to select those private files if necessary. Do not
copy tester credentials or put a password-bearing URL in command arguments.
This script performs only a read-only transaction:

```sh
PGSERVICE=qdev_accounting_auditor psql -X --set=ON_ERROR_STOP=1 \
  --file=scripts/unified-beta/check-isolated-accounting.sql
```

Expected observation: `PREPARATION_OBSERVATION_ONLY_EXECUTION_NOT_AUTHORIZED`,
with the actual database name and installed function-body digest. Compare that
digest with the independently approved source. This checks PostgreSQL17,
dedicated naming, empty accounting tables and denied PUBLIC access. It does not
authenticate a funding grant, prove provider account isolation, install a
runtime, create users/roles, establish protected custody or permit execution.
After enrollment it deliberately refuses an "empty preparation" claim.

The ordinary public regression is executable with a fresh localhost PostgreSQL17
cluster and a dedicated test admin database (never application `DATABASE_URL`):

```sh
node --test apps/eve/test/isolated-cohort.integration.mjs
```

Supply `MYEVE_ISOLATED_COHORT_TEST_DATABASE` for that fixture. It creates and
removes only its randomly named synthetic databases/roles. It proves fresh
preparation, actual service-role connection denial, unchanged synthetic UNKNOWN
history and current fresh-cohort Work denial. It creates no protected tests.

After charter/profile acceptance, engineering must implement and independently
qualify the selected new-cohort admission/parent binding before installation.
Do not treat environment provisioning as completed engineering: the current
chat-only release and external-alpha tuple cannot represent this new journey.
Every charged Sofie/native/Factory/verifier child must bind the same approved
project parent before dispatch, and lost acknowledgments remain charged/fenced.
Use the existing canonical ledgers, owner-origin admission and recovery contracts;
do not create a competing balance ledger or infer authority from absence of Alpha.

Freeze exact MyEve/Factory/Relay/MissionControl source commits and trees, compute
Factory source/configuration/FactoryVersion and execution-contract digests from
actual source, obtain independent acceptance and run exact-source hosted CI.
Current unqualified candidate identities must not inherit prior acceptance.
The expired production price card remains unchanged. The isolated cohort needs
its own approved qualification price card and adapter, not renewal or reuse of
the original production grant. That source/configuration change requires fresh
execution/FactoryVersion identities, joins and independent qualification.

Before the authorized run record the empty target DB snapshot IDs, authenticated
service/control incarnation IDs, immutable artifact-store versions, prior MyApps
installation revision (or explicit absent), Git input commit/tree, protected spec
digest, issuer/key-purpose IDs, and exact code rollback commits. Missing actual
references are a blocker, not permission to create placeholder evidence.

Success here would mean **READY FOR ISOLATED DEVELOPER QUALIFICATION** only after
the new environment, source, authority and custody gates actually pass. It would
not activate or qualify the two original testers.
