# ER2 real-SDK local qualification — 2026-09-26

**Decision: ADAPT. Release/provider qualification: NOT QUALIFIED.**

The source worktree named in the implementation request disappeared during this session. Its committed starting revision `0a74624` was restored into `codex/digital-worker-mvp` at `/Users/jaywest/.codex/worktrees/digital-worker-mvp/Myeve`. The original main checkout's unrelated edits were preserved. This record extends the earlier sprint checkpoint; it does not replace its open gates.

## Implemented

- A separate, pinned Deep Agents 1.14.1 experimental `HarnessProvider`, outside the app's default dependencies and registration. MyEve supplies the model, current authority, model budget reservation, virtual files and checkpoint custody. Built-in filesystem, shell, MCP and subagent calls cannot reach an effect through this adapter.
- Actual SDK start/observe/checkpoint/resume/stop/result methods. Same-instance competing starts are rejected. Stop fences a pending file write; stopped checkpoints cannot resume. Model loops are bounded. Unknown usage is explicit. Fabricated model readiness and evidence are ignored, and a retention failure cannot produce a durable result revision.
- A real SIGKILL/fresh-process recovery fixture. The process is killed after an edit receipt is saved but before the graph tool returns. The restarted SDK resumes that pending call; the retained candidate and receipt remain exact and the file effect occurs once.
- Fixed virtual checkpoint restoration for newly created approved files.
- Fixed two failures discovered by invoking the real protected Docker verifier: Docker's `get <exact name>: no such volume` diagnostic, and non-root initialization of a root-owned fresh volume. Only fixed volume initialization runs as UID 0. Candidate execution is explicitly UID 1000 with dropped capabilities, denied network and a read-only candidate mount.

## Observed capability matrix

| Capability | Local result | Limit |
|---|---|---|
| Real pinned SDK with MyEve file tools | PASS | Scripted model; no authenticated Sofie turn. |
| Built-in write/read, shell, injected MCP and subagent bypass denial | PASS | Forbidden calls were attempted, not merely hidden. No MCP server or actual subagent was run. |
| Path traversal, protected-file writes, malformed tool arguments, revoked file authority | PASS | Virtual selected files only; no OS symlink traversal surface is exposed. |
| Model-call budget denial, same-instance competing starts, loop bound | PASS | Trusted host implementation is synthetic; no production spend ledger integration. |
| Pending-write Stop fence and stopped-checkpoint refusal | PASS | Remote model transport cancellation and billing termination NOT_RUN. |
| Candidate and graph recovery after SIGKILL | PASS | Real Node process loss and real SDK; test-only disk checkpointer and scripted model. |
| Candidate retention failure | PASS | No durable result revision is reported when the changed snapshot was not retained. |
| Normal and potato mode permission equality | PASS | Authority equality only; live initiative/behavior comparison NOT_RUN. |
| Independent protected verification | PASS | Two real local Docker candidates: integer PASS/fraction FAIL, then PASS/PASS at a different exact revision. |
| Provider usage and cost | UNKNOWN | No external model called; unknown coverage does not mean zero provider cost for future runs. |
| MCP execution, ephemeral subagents, raw shell | UNSUPPORTED | Disabled pending a separately qualified MyEve-mediated adapter. |
| Production admission, Action Gateway and authenticated Work/Chat parity | NOT_RUN | Trusted authority-facts caller and production checkpoint/budget/writer host remain missing. |
| Live inspect/plan/edit/fail/diagnose/repair journey | NOT_RUN | Exact-payload/model-cost permission requested; no response at this checkpoint. |

[Docker evidence](docker-evidence.json) records the pinned image, exact candidate SHAs, criteria/profile hashes, stdout/exit results and cleanup. The harness cannot write these expected assertions. Resource checks confirmed the named test containers and volumes were absent after each verification. This supports only that bounded local trace, not a system-wide zero-leak or zero-resource claim.

## Validation

- Real SDK package: 11 tests with the optional real Docker test enabled, including hard-kill recovery; separate TypeScript check.
- App regression: 1,284 passed, 40 skipped across 166 files.
- Root Node regression: 151 passed.
- Migration manifest: 49 ordered migrations; no migration added.
- Repository TypeScript/capability/skill/executor checks passed after reviewing the two changed executor fingerprints: 623 classified sources, zero unknown entries.
- UI was not changed. No browser, live model, GitHub publication, Relay peer or MyFactory run was substituted for these checks.

The restored worktree initially lacked app-local TypeScript 5.9.3 and Spectrum 12.8.0 dependencies. Those exact lockfile versions were restored into local ignored dependency directories; no app dependency manifest or lockfile was changed.

## Remaining order and blockers

1. Finish ER1's concrete trusted policy/context/budget/provider qualification source and live Work/Chat parity. Do not mark this experimental SDK qualified to make admission succeed.
2. Approve and run the bounded live model fixture through an appropriate cost-enforcing host, then qualify actual MCP/subagent behavior, cancellation and metering before accepting ER2. This session requested permission for only synthetic quantity-parser context/test output to the configured Sofie provider, capped at $2; the earlier session's automatic-approval rejection was not bypassed.
3. Bind native Sofie to approved Work, exact source manifest, protected verification and immutable Proof of Work; repeat model/process/worker recovery. M1 remains PARTIAL.
4. Only then proceed through the plan's M2–M7 and ER3–ER6 gates. The earlier private GitHub publisher credential/manifest and live CI/review, hosted Factory contracts and live peer qualifications remain separate prerequisites.

No production deployment, merge or external Alpha is authorized by these observations.

## Post-deploy monitoring and validation

This experiment is unregistered, so it introduces no default provider traffic. For subsequent isolated verifier runs, watch `Verifier volume state is unavailable`, `cleanup is unconfirmed`, `retention failed` and recovery-required jobs. Healthy signals are exact-revision independent evidence, UID 1000 candidate execution and confirmed removal of only task-owned resources. Any unexpected resource, duplicate effect, unretained candidate or false PASS stops qualification immediately; preserve the candidate and reconcile resources before retrying. Owner: implementing engineer, during every bounded dogfood run. Do not activate this provider in production from this record.
