# Alpha Tasks local integration

Original profile base: `47d7b88287f4f8b3dab53a7bf81a06dc52819176`. Adopted into the unified-beta source with the authenticated owner interface and Sofie adapter.

This implements a separate fixed Alpha Tasks profile over the existing MyApps and Needs You tables. The existing explicit local host can bind `alphaTasks` alongside CRM. This exposes `/api/myapps/alpha` and `/apps/installed` only behind the unchanged local integration guard. It does not activate a production host, tester, installation, model, or Factory execution. Existing External Alpha verification and historical Result/Proof records are read, not modified. CRM keeps its reference profile and excludes Alpha Tasks records from CRM interpretation and approval delivery.

## Provenance and identity

`retainedAlphaTasksOrigin` reuses the existing signed External Alpha Result verifier and requires the canonical owner policy, settled accounting, cleanup, exact ten-criterion Work, original Proof hash, request digest, source/configuration/FactoryVersion, candidate commit/tree/patch, and signed MissionControl permit binding. It rejects unknown accounting across the owner, stale Work, revoked policy/permit, and unavailable enrollment. Accepted Work retains its original version/generation and Result identity; current Work versions govern the new installation approval. The original Proof remains PARTIAL because private installation does not establish GitHub publication or final product qualification.

`myapps.source-closure.v1` supplies the complete bounded tree: at most 128 regular files, 1 MiB per file and 4 MiB total. The verifier recomputes every Git blob/tree SHA-1 and requires equality with the authentic Result's candidate tree. It rejects path traversal, symlinks, submodules, duplicates, file/directory collisions and inconsistent bytes. A patch and root tree object alone are insufficient.

The separate `myeve.app-package.alpha-tasks.v1` descriptor preserves owner, installation, connection, tenant, project, Mission, Plan, WorkOrder, original Work, permit, Result, Proof, authority, request, Factory WorkOrder, run, attempt, FactoryVersion and candidate identities. The app ID is stable across releases of the same owner/installation/Mission. No reference-CRM Result or replacement FactoryVersion is fabricated.

## Fixed runtime and local wiring

`composeLocalAlphaTasks(pool, input)` accepts trusted operator custody configuration, immutable runtime profiles and an inert source-closure loader. These are not request-body fields. The runtime is denied when either the actual process or supplied local configuration is production/hosted, and requires explicit local integration configuration. Current qualification installation and capability policy are checked on every admission and commit through the existing Capability Control Plane. No existing host guard or deployment gate is changed.

The profile requires Node ESM exports `src/tasks.js:createStore(path)` with `list/create/update`, and `src/render.js:renderTaskList(tasks)`. Its data contract is `{next,tasks}`, with unique positive task IDs, title, done and optional Low/Medium/High priority. This is a declared supported profile, not a claim that the private protected candidate conforms to it.

`LocalAlphaTasksIsolation` executes the actual candidate only in a new local Docker container. The image is pinned by immutable image ID and must already exist (`--pull=never`). Network, host secrets, writable source, privilege escalation and capabilities are denied. The container uses UID/GID 65534, a read-only root, 4 MiB data tmpfs, 128 MiB memory, one CPU, 32 PIDs, bounded output and a five-second internal timeout. The profile's adapter digest includes the harness and every trusted source/data/isolation validation unit. Candidate render output is untrusted data; a UI must never insert it as raw HTML.

For local integration, construct `AlphaTasksApps` using that composition. Prepare a package from the canonical retained origin and verified source closure. `alphaTasksCommands(apps)` is the shared UI/agent command adapter; its Principal comes from trusted session/capability resolution. It exposes catalog, preview, requestInstall, install, decideInstall, rollbackCandidate, setEnabled, list, create, update and render. It accepts no body-authored principal, package, arbitrary command or approval boolean. `decideInstall` records a human owner response in the canonical inbox before installation; it cannot bypass the retained decision checks. `apps.consumeOwnerResponse` plugs into the existing UniversalInbox delivery loop and handles only this profile's durable requests.

The owner page covers loading, empty, failed reads, success, expired/stale approvals, pause/resume and recovery-required states. Task mutations retain an exact request ID and body after a lost response. Candidate HTML is never inserted into the page. The owner reads only retained task state; mutations execute the isolated package. A rollback creates a new release and requires the same preview/approval sequence. The existing `installed_apps` Sofie tool exposes the same typed task operations and can prepare previews or request owner decisions. It rechecks the owner each call, excludes guests/roles/subagents, and strips installation permission. It cannot approve installation or toggle the owner's app.

## Install, update, rollback and failures

Preview executes the pinned candidate against synthetic empty data. An exact candidate/runtime/base/data revision/current Work/policy binding is presented in Needs You, with a five-minute expiry. Installation requires the canonical retained human-owner response, serializes with state/data changes, and preserves data through an identity migration. Package versions increase monotonically. Rollback creates a new candidate version from a previously installed source/profile; it requires a new preview and owner decision and never downgrades storage or rewrites history.

Runtime mutations use durable request hashes and receipts. A replay returns the existing receipt and a conflicting input is rejected. Each preview or operation is journaled before execution, and its UUID identifies the exact `myapps-alpha-<UUID>` container and staging-directory prefix. Output is returned only after exact-container removal and absence verification. A known cleaned-up failure preserves data and records DENIED; ambiguous cleanup records UNKNOWN. Pending/UNKNOWN operations block further execution, previews and installation. A lost COMMIT acknowledgment cannot overwrite a committed success.

Process-crash recovery is intentionally conservative: preserve RUNNING/UNKNOWN receipts and original evidence. An authorized local operator must inspect the exact operation/container/staging prefix and reconcile cleanup before any new execution. There is no automatic retry, receipt clearing, unknown-exposure forgiveness or generic recovery command. The internal container timeout still bounds candidate execution if the host process disappears.

## Validation and boundaries

Synthetic offline qualification:

- 14 Vitest checks: real PostgreSQL lifecycle and canonical Inbox delivery under a non-superuser, non-bypass role; owner RLS; data-preserving update/rollback; duplicate-safe mutation; stale approval/revocation; cleaned-up failure and UNKNOWN preview fencing; CRM coexistence; canonical retained signed Result and accepted historical Work; PARTIAL/UNKNOWN rejection; local/production guard and command-authority boundaries.
- 25 Node checks: existing CRM/SQLite regressions, strict Alpha Tasks contracts/source closure, actual isolated candidate operations, denied network/host-secret/source access, failure and timeout cleanup.
- Signed synthetic owner browser qualification uses the real UI/API, ordinary-role PostgreSQL and isolated candidate. It covers authentication, cross-owner/cross-origin denial, first installation, edits, update/rollback with preserved data, response loss and duplicate-safe retry, pause/resume, read failure/reload, keyboard use, desktop/mobile layout and accessibility. It is separate from installed Clerk/custody qualification.
- Application TypeScript and Sofie caller/permission regression checks.

The lifecycle fixture injects synthetic provenance/capability admission; the importer tests independently exercise real canonical signed Result/Proof/permit data in disposable PostgreSQL. This does not establish the full installed capability-to-private-candidate chain, actual private runtime profile, second Factory-produced release, hosted CI, or unified Golden Journey. The update/rollback test is explicitly a package-only update against one synthetic candidate, not evidence of a second Factory Result.

No MyApps storage migration is added. Exact original admission provenance is retained by the separate MissionControl migration 0100; the separate unified migration supplement preserves all historical migration checksums. Installation and data remain in the existing MyApps and Needs You tables.

Actual private source closure, protected custody qualification and installation-specific FactoryVersions remain unresolved. Independent review of this exact source successor and explicit final activation authorization are still required. Nothing here authorizes protected cloud execution, application deployment, production migration, paid calls, merges or tester activation.

## Review correction: exact admitting permit

The importer now follows the immutable authority DISPATCH binding to the exact admission receipt and signed permit. It verifies the historical signed receipt as well as the permit, and never selects another permit by creation time. A second valid permit does not change a Result's origin; revoking the actual admitting permit denies installation even if another permit remains valid. Missing historical bindings fail closed, without backfill. The current policy, enrollment and accounting checks still apply.

The 120-hour External Alpha policy window, enrollment expiry, changes to Work control/lifecycle and unresolved exposure anywhere under that owner may stop previews, installs and mutations. Retained task data remains visible in the owner catalog while its read capability and local host are available. Testers should report the displayed failure instead of repeatedly starting new Work or assuming an expiry renewed their allowance.
