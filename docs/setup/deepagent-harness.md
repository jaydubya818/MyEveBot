# DeepAgent / Deep Agents harness

A harness is the execution loop that calls a model, exposes tools, retains checkpoints and produces a result. It is distinct from the agent's identity, the owner's permissions and the software-delivery supervisor.

MyEve's deployed chat runs on the **Eve framework**. The separately developed **Deep Agents** adapter experimented with the `deepagents` SDK, pinned to 1.14.1 in its isolated package. That package is not present or registered in this release checkout. Do not describe Sofie as running Deep Agents in production.

The historical experiment implements a `HarnessProvider` with start, observe, checkpoint, resume, stop and result operations. It exposes only MyEve-mediated reads and writes of selected virtual files. Built-in shell, unrestricted filesystem access, MCP and subagents are disabled. MyEve must provide current authorization, writer fencing, durable spend reservation, scoped checkpoints and result custody. Neither the model nor the harness can declare its own verification successful.

Its recorded decision was **ADAPT; NOT QUALIFIED**. Real SDK tests with a scripted model, process-loss recovery and protected Docker verification passed; production admission, live provider behavior, usage/cancellation and authenticated chat integration were not qualified by those tests. No MyFactory, Relay, GitHub or release gate follows from that evidence.

Historical source: the `codex/q37-private-alpha-continuation` development line, `experiments/deepagents/README.md` and `docs/verification/2026-09-26-deepagents-spike/README.md`. Its source must be reconciled and separately qualified before adding it to this deployment. The current work repairs Mac access, chat continuity and configured service connections; it does not activate that experimental execution provider.
