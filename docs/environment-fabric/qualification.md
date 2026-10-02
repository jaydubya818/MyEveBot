# Environment Fabric — MyEve checkpoint

**Overall: PARTIAL. Live cloud canary is not ready.**

The starting canonical main SHA is `2b22e387c053ba0631efc27c2e8f8a99fff1055e`. This branch preserves cloud documentation checkpoint `125bd01`, including canonical Attempt-8 publication. No MyEve runtime code changed in this checkpoint. Another task's local `d75091eb333a531fa91ed9d39e273948aa9d0eaf` publication-readback/presentation repair remains untouched and must be reconciled when canonical.

[Mac deterministic regressions](mac-regressions.txt): **46 PASS, 8 SKIPPED**. The SQL suite requires its explicitly disposable PostgreSQL configuration and was not enabled; real Mac desktop/screenshot operations were not performed. Existing installed dependency tree was reused for this documentation-only MyEve checkpoint; this is not a fresh dependency-install qualification.

The [Factory report](https://github.com/jaydubya818/MyFactory/blob/codex/environment-fabric/docs/environment-fabric/qualification.md) contains the T3 crosswalk, environment source contracts, routing matrix/denials, adapter projections, source manifest and full Factory regressions. The authoritative environment schemas remain in MyFactory, not copied into MyEve.

| Capability | Status |
| --- | --- |
| Sofie / MyEve | PARTIAL — current product preserved; environment integration pending |
| Relay | NOT_RUN — no contract changes |
| Environment Fabric | PARTIAL — tested pure contracts/routing; registry/admission/UI pending |
| Owner Computer | PASS deterministic regressions; connected E2E NOT_RUN |
| Local Factory | PASS Factory deterministic regression; full environment binding pending |
| Cloud Factory | NOT_QUALIFIED — immutable image blocker; lifecycle NOT_RUN |
| Existing Factory harness | PASS deterministic regression; live NOT_RUN here |
| DeepAgent | NOT_QUALIFIED |
| Candidate custody / verifier | Existing local regressions PASS; cloud NOT_RUN |
| Background Work / Mac-off / browser-off | NOT_RUN for CLOUD |
| Owner publication | Existing Attempt-8 publisher preserved; no effect executed |
| Agent federation | NOT_RUN; existing Alpha history preserved; Muse/GrokBots not qualified |
| P0 Playwright / multi-client / 390px / accessibility | NOT_RUN |

No end-to-end safety counter is reported as zero without running its campaign. Paid model calls and production publication effects initiated by this mission are zero. No candidate or historical Proof changed.

Next external prerequisite: restore VCR upload or make a compatible private Node 24 + Git linux/amd64 image available by immutable digest to dedicated MyFactory staging. [Exact project, registry and constraints](https://github.com/jaydubya818/MyFactory/blob/7a69c472f05d540f490a41e33014b978f1165e82/docs/cloud-execution/phase-2/image-blocker.md). Then finish registry/admission/UI and the cloud lifecycle before Mac-off deterministic qualification and the separately approved paid canary.
