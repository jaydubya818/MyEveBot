# Explicit local owner MyApps installation

This path supports the platform owner's Alpha Tasks runtime in an explicitly registered local, nonproduction, non-Vercel process. It does not enable external-tester projects, hosted execution, production credentials, or a third Alpha slot. Those installation decisions remain separate. No runtime is created when registration is absent.

Use the owner's existing canonical application PostgreSQL database and capability policy in the same database. Apply the separately authorized schema/grants before registration; application startup neither migrates nor grants permissions. The runtime role must not own protected tables or be able to change enrollments, policy evidence, accounting custody or admission assertions. Existing signed web authentication remains required even on the local API.

The operator supplies `MYAPPS_LOCAL_REGISTRATION` as a strict JSON object containing:

- `version: 1`, `kind: "OWNER_FACTORY"`;
- the exact `ownerId`, `installationId`, and primary Sofie `agentId`;
- a `runtimeId`, private `target`, and absolute `sourceRoot`;
- the independently qualified `runtime` descriptor for `alpha-tasks-node-json-v1`, including the immutable local image ID, trusted adapter digest and data contract. Runtime network access and secrets must remain disabled.

Set `MYAPPS_LOCAL_REGISTRATION_SHA256` to the canonical `digest(registration)` from `packages/myapps/src/alpha-tasks/contracts.ts` (the `sha256:` prefix is required). The descriptor is not a secret and must contain no passwords or signing keys. Its owner and installation must match `MYEVE_OWNER_ID` and `MYEVE_CAPABILITY_INSTALLATION_ID`. The existing capability database URL must exactly match the canonical `DATABASE_URL`.

All existing local gates must also hold: `MYAPPS_LOCAL_INTEGRATION=1`, `MYEVE_MISSIONCONTROL_MODE=APPROVED_NONPRODUCTION`, `MYEVE_CAPABILITY_CONTROL_ENABLED=true`, and capability environment `qualification`. The actual process and supplied configuration must both be nonproduction and non-Vercel. An external-alpha installation name or policy always denies this bootstrap. Capability preferences alone do not activate it. Do not set these flags to disguise another hosting environment.

Place each verified complete source closure at `sourceRoot/<candidate-tree>.json`. The directory and file must be regular, owned by the process user, and not writable by group or others; symlinks are denied. Each closure is bounded, reconstructs its original Git tree, and is compared with the signed Result candidate. No body-authored source path or executable command is accepted. `PRIVATE-APP-PROFILE.md` in the release preparation packet explains the separate private source compatibility gate; a valid tree alone does not prove a runnable task app.

After original Gate C Result, native Proof, exact permit/receipt, cleanup, accounting and current capability qualification pass, prepare a release through the operator command in the configured process environment:

```sh
node --import tsx apps/eve/scripts/prepare-local-owner-app.ts ORIGINAL_RESULT_UUID RELEASE_NUMBER
```

The command derives owner, Mission, Work, source, runtime, current installed base and package identity from trusted configuration and canonical stores. It prepares the candidate but does not preview, execute it, approve an installation or activate the app. The explicit release number preserves retry identity; a conflict must be investigated rather than retried with a new number.

Open `/apps/installed`. Preview the release, review the retained Inbox decision, and approve installation as the owner. The web route, Sofie tool and Inbox response path each initialize the same registered runtime on a cold process; no earlier request or manual `bindLocalApps` call is required. Changed or removed registration cannot reuse a cached binding. Restart after a reviewed configuration change; a restart does not clear unresolved operations or spending.

Sofie exposes Alpha Tasks only when the exact registered primary agent's current capability policy allows it. Execution repeats that check and canonical MyApps authorization. Partner, Routine, owner-channel, role, guest and subagent contexts do not gain this tool. The agent cannot approve an installation. This registration does not qualify the legacy CRM adapter or `/api/myapps/ui`; use the Alpha Tasks page and API. Unrelated Inbox actions continue to their existing consumer.

Before any actual installation claim, qualify the real role, enrollment, source/profile and authenticated session; exercise installation, a task edit, update, rollback, cold restart, policy disable and UNKNOWN recovery. The shipped tests use public synthetic source and disposable databases. They do not authorize or certify a real installation.
