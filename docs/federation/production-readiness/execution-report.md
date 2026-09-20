# Readiness execution report — 2026-09-20

**Result: NO-GO. Preparation and local baseline checks complete; independent security and production platform gates remain NOT_RUN.**

## Completed work

Verified canonical MyEve HEAD matches `60d341f9909936f03e4d72e1a7f845721ef82c46` and Relay checkout matches `614c638d6fc4099db8064540326f5de4438e93a1`. Cloned MyEve locally into an isolated readiness checkout at the exact merged SHA. The earlier federation checkout and its untracked duplicate files were preserved. No source, migration, Relay configuration, deployed flag, enrollment, grant or publication was changed.

Prepared the two-gate plan, reviewer handoff with 18 adversarial scenarios, and actual production-platform runbook with 17 acceptance scenarios, evidence requirements, stop/cleanup procedures and signoff rules. No external reviewer was contacted, no external penetration test started and no production deployment changed.

Executed the merged-source federation regression: **48 passed across 3 files** (`adapter.test.ts`, `review-regressions.test.ts`, `work-authority.test.ts`). Added and executed a local negative-probe script: **25 boundary probes passed**, five boundary checks for each of unset/empty/false/TRUE/1. Owner GET returned disabled, owner POST and artifact GET returned 404, client access threw disabled, and a separate worker process refused startup. These directly exercise code; they do not attest the configuration of any deployed installation or prove full production readiness.

Tests used Node v24.18.1 and the existing local dependency installation via a symlink; Vitest reported 3.2.7. No fresh lockfile install, production-image vulnerability scan, broad build, database migration or real model call was performed in this readiness pass. Previous live evidence is referenced as history, not reexecuted or relabeled.

## Reproduction

From this checkout's `apps/eve` directory with the existing project dependencies installed:

```sh
../../node_modules/.bin/vitest run lib/relay
node --import tsx ../../scripts/federation-readiness/check-disabled.mjs
```

The negative script never enables federation and restores its own flag after running. Worker subprocesses receive only PATH and a disabled flag. No production secrets are needed. It uses actual modules with local `.invalid` Request objects, not a deployed HTTP server.

## Evidence

- [Regression output](evidence/federation-tests.txt)
- [Disabled boundary results](evidence/disabled-probes.json)
- [Probe stderr (empty on success)](evidence/disabled-probes.stderr.txt)
- [Source and evidence hashes, environment and gate status](evidence/manifest.json)
- [Reproducible negative-probe script](../../../scripts/federation-readiness/check-disabled.mjs)

## Outstanding external dependencies

The product owner has been asked to identify the independent assessor and actual production Agent platform/operators/environment, with credential locations rather than values. No response was available when this report was prepared. The runbooks specify the remaining target, test-window, limits and access details needed. Existing disposable qualification infrastructure cannot substitute for those inputs. No claim is made that an external reviewer is scheduled or that a production installation is already safe or disabled based solely on local source checks.

Known review targets include signing-key history/recovery, production egress/DNS isolation, retention during idle/offline operation, actual model cancellation and deployment-scale concurrency. These are unqualified boundaries, not newly proven vulnerabilities. No security fixes or federation features were introduced.

Federation remains disabled by default in the unchanged source. General production enablement remains prohibited pending both gate signoffs and a separate explicit rollout decision.


## Target-preparation continuation

Read-only authenticated Vercel metadata inspected both projects, deployments, domains, environment names/scopes and the known Relay Neon resource. Sanitized local client configuration and installed CLI versions were inspected without retrieving credentials into output. No hosted application/private data was read, no database migrated, no infrastructure provisioned, and no golden-path/adversarial requests sent. Source analysis identified deployment-wide flags, single-owner MyEve authentication, Relay's absent production bindings initializer and the difference between real CLI MCP connectivity and a complete receiving platform.

Prepared deployment topology, resource/configuration matrix, synthetic identity plan, strict session budget/envelopes, G01–G13 mapping to all existing P01–P17 requirements, independent assessor handoff, disabled Codex configuration and non-executable target manifest. The read-only inventory collector is the only executable infrastructure scaffold. Earlier 48/25 local test results are historical within this task and were not rerun or relabeled as hosted evidence. Documentation links, JSON/TOML/Python syntax, inventory redaction and unchanged product source are checked for this continuation.

Final status: **NO-GO — EXTERNAL QUALIFICATION PENDING.** Stop pending the numbered owner/operator actions in deployment-target.md; neither gate is passed.
