# Approved live local qualification — in progress

**Release result: NOT YET QUALIFIED.** This record updates the earlier [Golden Work dossier](../README.md); the approved repository was supplied after that report was written. No draft PR, live candidate, CI continuation, review continuation or live Ready for Review is claimed here yet.

## Approved fixture and verified preflight

- Private repository: `jaydubya818/myeve-golden-work-qual`.
- Issue: `https://github.com/jaydubya818/myeve-golden-work-qual/issues/1`, open and bounded to `quantity.mjs`.
- Base: `main` at `db5d95cf3d1dadf04a118f38bd5b388a5a226c31` at preflight.
- The repository contains only small UTF-8 text files. Its existing `quantity-ci` workflow runs `npm test` under Node 20. Its existing base-commit workflow run has a real failure because `quantity.mjs` is absent. That base failure **does not** satisfy the required post-publication CI-failure gate.
- Eleven `node:test` cases check positive, zero, negative, fractional and whitespace inputs. The qualification profile allows changes only to `quantity.mjs`.
- Independent reviewer: `jaydubya818`. The App bot is the planned publisher. The deterministic branch will be `myeve/work-<Work UUID>`.
- The repository owner confirmed it is a disposable private fixture approved for draft PRs and throwaway Work branches.

## Local preparation

The trusted publisher now supports a GitHub App private key read from macOS Keychain and a short-lived installation token narrowed to exactly this repository and the approved permissions. The key and token are never placed in the executor workspace or Work state. The local harness uses task-owned PostgreSQL on `127.0.0.1:55468`, Next on `localhost:3103`, a loopback SQL bridge on 3102, and the bounded model broker on 3101. The executor image is pinned to `myeve-golden-executor@sha256:f4cf5d653d247d013ebe3054d5333278923736832e4af11f9c350bfec2bea82c`.

The first Run has an explicit, recorded `parse-int-fraction` fault instruction. Its first candidate is meant to pass limited protected checks but fail the real post-publication `quantity-ci` on fractional input. The later Run must inspect and correct that failure. This is intentional qualification fault injection, not evidence that the model organically made that mistake. A profile without this flag uses ordinary issue execution.

Development-only Gateway OIDC credentials were pulled into a mode-600 temporary file. No production database or customer repository was used. The App registration and Keychain import are waiting for the account owner's GitHub identity confirmation. The identity prompt and generated private-key download must be completed by the account owner; the project provides a Swift Keychain importer that verifies readback before deleting the downloaded PEM.

## Checks completed so far

- Read-only GitHub issue, tree, workflow and base CI verification: PASS.
- Scoped App minting tests: 2 PASS; GitHub adapter boundary tests: 4 PASS.
- Eve regression suite: 1,115 PASS, 40 skipped (the PostgreSQL suites were previously enabled separately in the prior dossier). [Log](eve.log).
- Typecheck, capability registry, skill validation and governance inventory: PASS, 596 classified sources, UNKNOWN=0. [Log](typecheck.log).
- Real PostgreSQL/Docker Golden integration fault suite: 11 case groups PASS; GitHub and coding executor remain simulated in this suite. [Log](integration.log).
- Updated Eve production build with Webpack: PASS. [Log](build.log).
- Swift Keychain importer typecheck and live harness syntax check: PASS.

## Required continuation

1. Account owner completes GitHub sudo confirmation. Register the named private App with only the approved repository permissions, install it on only this repository, and generate/download its private key. A GitHub App's new access grant needs explicit action-time confirmation under the computer-use policy; generating the credential itself requires account-owner handoff.
2. Import the PEM into Keychain with the checked Swift script; capture only the non-secret App and installation IDs.
3. Start the local harness, sign in to `/work`, admit issue #1 and approve the exact first candidate. Disconnect the browser during processing.
4. Observe a real failed PR check, automatic fresh Run/reverification/update, then submit an authorized changes-request review as the independent human reviewer. Keep the feedback within the existing criterion and allowed file.
5. Observe automatic review continuation, final CI/check evidence and deterministic Ready for Review. Kill/restart the actual worker during a safe phase and separately qualify controlled auth loss, delay/duplicate events, branch takeover/give-back and resource cleanup.
6. Update this trace with exact Work/Run/candidate/PR/check/review IDs, honest intervention and coordination debt counts, and a new merge decision.

There is no reason to add CODEOWNERS for this local test. GitHub does not automatically request code owners while a PR remains a draft; the independent reviewer can submit the required changes request directly. The existing main ruleset already requires a review before any merge, and this qualification never merges.
