# Optional session surfaces — MyEve handoff

Status: **PARTIAL contract; CMUX/TMUX adapters and Control Center actions DEFERRED**.

MyFactory owns the [canonical contract and upstream review](https://github.com/jaydubya818/MyFactory/blob/codex/environment-fabric/docs/architecture/session-surfaces.md), [qualification report](https://github.com/jaydubya818/MyFactory/blob/codex/environment-fabric/docs/environment-fabric/session-surfaces.md) and [operator runbook](https://github.com/jaydubya818/MyFactory/blob/codex/environment-fabric/docs/runbooks/session-surfaces.md). Do not copy a second schema into MyEve.

The contract separates execution from optional observation. HEADLESS requires no surface provider. TMUX/CMUX availability grants no authority and does not enter productive Work requirements. Requests pin Work/execution generations, environment and attempt; callers cannot supply arbitrary hosts, paths, commands or native session IDs. The pure scope guard is not an authenticated endpoint or complete effect-time authorization.

cmux upstream reviewed: `23d3e8835d9b74bc6859af0e8d5f7ffffe9e27bd`, source version `0.64.25`; installed tmux `3.6a`. No connected Factory attachment qualified. In particular, cmux SSH-tmux mirrors a whole server and must not expose a shared Work/owner server.

Future Control Center actions must consume canonical exact execution plus independently qualified session capabilities, enforce existing owner/operator authority and resolve targets server-side. Show Open in cmux / Attach with tmux only after those integrations pass. Do not require the owner to enter a host, repository path, Work ID or process. Session failure changes session availability only; Work, Result/Proof and Needs You remain canonical. Notifications derive from meaningful deduplicated Current Truth transitions.

Cloud Execution is the provider/controller implementation owner at `faf93359a4c54daaf3e0b713a601366db02ba8d6`. Its image/infrastructure work supersedes the older image blocker. It owns CLOUD + HEADLESS and later optional CLOUD + TMUX. Fabric owns future Owner Computer/Local Factory surface adapters. The current critical path remains existing harness → deterministic cloud execution → independent verifier → Mac-off Golden Journey → P0; this extension must not gate it.

No MyEve runtime, Relay contract, owner decision, Attempt-8 publisher, credential or staging deployment changed in this checkpoint. HEADLESS Golden Journey, cmux crash/close, tmux detach, operator reconnect and live attachment security remain NOT_RUN here. Paid calls and publication effects: zero.
