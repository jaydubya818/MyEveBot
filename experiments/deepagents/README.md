# Isolated Deep Agents experiment

This package implements `HarnessProvider` against **deepagents 1.14.1**. It is deliberately outside the npm workspaces and is not imported by the app, registered with Sofie, or considered a qualified route provider. The lockfile pins the tested dependency graph.

```sh
npm ci --prefix experiments/deepagents --ignore-scripts
npm run typecheck --prefix experiments/deepagents
npm test --prefix experiments/deepagents
```

The tests use a scripted model and the real SDK. The optional protected-verifier test requires the official, pinned Node image:

```sh
docker pull node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
MYEVE_ER2_VERIFIER_IMAGE=node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 npm test --prefix experiments/deepagents
```

## Boundary

Only `myeve_read_file` and `myeve_write_file` reach the model. A second tool-call check rejects injected built-in calls. The provider filesystem denies every operation; it has no host mount, shell, memory store, MCP client or publication credential. The default SDK subagent tool is inaccessible. Disabling those capabilities is **not** qualification of their use.

`ExperimentHost` is a trusted dependency. It must supply the exact bounded Work/context, reserve the sole writer and stable run key, check current per-effect authority, durably reserve model budget, retain immutable scoped checkpoints and provide its own graph checkpointer. Retention must fence old generations, forbid a stopped-to-running regression, and preserve ambiguous effects. The isolated test hosts are not production implementations of these obligations. Do not substitute the test hosts for the missing production admission/Action Gateway integration.

Start and resume each consume one provider instance. Resume requires the original run key, a fenced/dead prior process, fresh authorized context, matching Work/generation, an intact retained workspace and the matching graph checkpoint. Stop first fences file effects and requests model cancellation; a receipt is not a claim that remote billing stopped. Usage is `UNKNOWN`, never zero. The model cannot supply a result SHA or verification status. Unretained or unchanged file state has no result revision.

The model and any transport are supplied by MyEve. External LangSmith tracing must be disabled. This package does not load credentials or choose a model endpoint. The declared operation support describes the adapter API, **not** production qualification.

## Evidence and decision

See [the qualification record](../../docs/verification/2026-09-26-deepagents-spike/README.md). The decision is **ADAPT; NOT QUALIFIED**. Local SDK isolation, hard-kill recovery and independent Docker checks passed. Live model behavior, MCP/subagents, full gateway integration and provider usage/cancellation remain open. No M1, ER3, MyFactory, GitHub, Relay or release gate is closed.

Official API references consulted: [Deep Agents overview](https://docs.langchain.com/oss/javascript/deepagents/overview), [backends](https://docs.langchain.com/oss/javascript/deepagents/backends), and the installed `deepagents`/LangChain/LangGraph declarations and implementation for the pinned versions.
