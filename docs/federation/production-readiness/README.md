> Latest: [live KMS compatibility probe](kms-live-probe-report.md): **FAILED**. Google explicitly rejects signing data above 65,536 bytes; the unchanged Relay canonical maximum is 262,057 bytes. No further signing or provisioning. Both external gates remain NOT_RUN. Earlier readiness status below predates this provider result.

> Latest: [final engineering closure](final-engineering-closure.md). **HOSTED TARGET READY FOR RESOURCE PROVISIONING; overall NO-GO.** Local three-worker simulation and stop PASS. Relay retains direct KMS workload authority under the approved application-admission boundary. KMS provider compatibility and both external gates remain unverified/NOT_RUN. Earlier checkpoints below are historical where superseded.

> Latest checkpoint: [final hosted engineering report](final-hosted-engineering-report.md). **HOSTED TARGET INCOMPLETE**: KMS custody decision and assembled three-worker validation remain open. Both external gates are NOT_RUN; no paid resources were provisioned. Older status below is historical.

> Current preparation: [KMS and isolated credential report](kms-preparation-report.md). Synthetic Vercel secrets are staged on disabled branches; KMS and hosted controls remain incomplete. Both external gates are NOT_RUN. Earlier status below is historical where superseded.

# MyEve Federation Production Readiness

Started 2026-09-20. **NO-GO — EXTERNAL QUALIFICATION PENDING.**

Authorized-target update: three empty Neon databases were created in existing free resources and migrated (MyEve27 each; Relay22). A hosted Neon migration defect was fixed and requalified separately. All temporary database credentials are revoked. Construction stopped because the existing Relay security contract mandates KMS/HSM for hosted signing/wrapping, triggering the owner's explicit stop condition. Vercel secret upload was also rejected by automatic approval review. No app or worker was deployed; hard budgets remain missing. See the [26-point authorized target report](authorized-target-report.md). **HOSTED TARGET INCOMPLETE; both gates NOT_RUN.**

This plan covers only independent security review/penetration testing and production Agent-platform qualification. No federation features, protocol extensions, rollout, or default enablement are included. MyEve's historical PR review and disposable live qualification remain valid within their recorded scope; neither closes these gates.

## Frozen baseline

- MyEve: `60d341f9909936f03e4d72e1a7f845721ef82c46` (merged authority).
- Relay: `614c638d6fc4099db8064540326f5de4438e93a1`.
- Isolated branch: `codex/myeve-federation-production-readiness`.
- Existing application source, migrations and defaults must remain unchanged during qualification. Any remediation requires a separately reviewed fix and affected-gate retesting against the new SHA. Relay pin changes require a separate decision.
- `MYEVE_RELAY_ENABLED` remains absent or false by default. An explicitly opted-in, isolated qualification installation may be used after its target/operator/scope is recorded; it must not enroll existing users or enable the general deployment. Passing both gates still requires an explicit rollout decision.

## Execution plan and current ledger

| Step | Owner | Deliverable / exit condition | Current status |
| --- | --- | --- | --- |
| 1. Freeze scope and source | Readiness coordinator | Exact source pins, isolated checkout, baseline evidence | COMPLETE |
| 2. Reproduce local security boundaries | Readiness coordinator | Existing 48 tests and negative disabled-route/worker probes | COMPLETE: 48 tests; 25 negative boundary probes |
| 3. Prepare independent assessment | Readiness coordinator | Source map, adversarial cases, rules of engagement, report requirements | COMPLETE: security-review.md |
| 4. Assign reviewer and authorize concrete targets | Product owner + independent assessor | Named assessor independent of implementation, target list, test window, limits, credentials via secret store | BLOCKED: identities and targets not supplied |
| 5. Execute independent review and penetration test | Independent assessor | Review plus deployed black/gray-box evidence, findings and signed conclusion | NOT_RUN |
| 6. Prepare production qualification | Readiness coordinator + platform operator | Actual deployment/version matrix, scenario checklist, cleanup and rollback | PREPARED: deployment-target.md and qualification-session.md; target not provisioned; local source fixes recorded in deployment-blockers-report.md |
| 7. Execute production qualification | MyEve, Relay and peer operators | All platform scenarios demonstrated on actual deployment stack with synthetic accounts | NOT_RUN |
| 8. Retest and decide readiness | Assessor + operators + product owner | Findings closure, matching tested SHAs/config, two explicit gate signoffs | NOT_RUN; NO-GO |

Steps 5 and 7 may use the same isolated production-stack installation if operators approve its scope. Failure of an isolation/authority assertion stops testing and preserves evidence. Scheduling and procurement remain unassigned until an assessor and operators are identified; no date is invented.

## Gate closure rules

**Security gate:** independent assessor identity and independence statement; frozen scope; code/config review and penetration-test report; evidence for every mandatory scenario; retest of fixes; zero unresolved critical/high findings and zero unresolved isolation, authority, replay or disclosure-boundary failures regardless of severity. Other residual findings need named product-owner acceptance with owner, deadline and rationale. A missing/not-run mandatory case is not a pass. Prior AI PR review and coordinator tests cannot self-certify this gate.

**Production platform gate:** named real peer platform/version/operator; real MyEve and Relay deployment identifiers linked to pins; actual auth, database, ingress, worker, key custody, runtime and telemetry; every mandatory scenario passes with redacted evidence and operator attestation. Disposable Ava, hosting shims, unit mocks and local model calls do not substitute. No latency/load/recovery objective is claimed until operators record the intended envelope and measured results.

Both signoffs must identify the same release candidate and deployment configuration. Evidence becomes stale when relevant runtime, trust pins, auth, network, persistence or platform versions change. Retest affected boundaries before reconsidering readiness. Existing non-federation release restrictions are not waived by this plan.

## Needed to continue external execution

1. Independent assessor name/provider and report recipient; explicit instruction to send the prepared package if desired.
2. Operator approval of the identified reusable projects and isolated target configuration; exact qualification deployment IDs, complete peer receiver/version, and responsible operators. Existing personal deployments are excluded.
3. Approved test window, target ownership/scope, synthetic test tenants, rate/concurrency ceilings, model-spend limit and stop contact.
4. Secret-store references and access mechanism for test principals, logs, database inspection, key-management and worker controls. Do not place secret values in reports or chat.
5. Intended production load, retention, availability and recovery targets for measured acceptance.

See [execution report](execution-report.md), [security review package](security-review.md), and [platform qualification runbook](platform-qualification.md).

Latest work: [KMS design and shared controls](kms-controls-design.md). The durable
PostgreSQL core and purpose-separated signing/lifecycle are locally tested;
provider size support and hosted adapters remain blockers. No resource approval
or external-gate PASS is implied. See [worker specification](worker-specification.json).
