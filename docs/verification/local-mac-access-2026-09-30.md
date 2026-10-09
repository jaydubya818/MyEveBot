# Local Mac access acceptance — 2026-09-30

Production: https://sofie-personal-agent.vercel.app

Final hosted deployment: `dpl_8LcoMWxteaMkAMccpeBNtbSschy7`, source `f607aad`, based on the exact previously live release `f74eec988a7d1a3d606a47db8f7ca3be5b5b0c12`.
Local companion source: `e926284` (adds tested filename wildcards; no hosted runtime change).
Migration: `0075_local_computer.sql`, applied after validating the current production migration lineage.

## Exact prompt acceptance

Initial model picker: GPT-6.1 Sol. Later screenshot testing exposed that the saved primary Agent preference overrode that picker; this initial run actually used Poolside. A fresh normal owner chat used the exact prompt:

> hello sol, can you review my read.me and tell me about this app

The initial run checked Mac connectivity, discovered the main README, read `/Users/jaywest/Myeve/README.md`, and produced “MyEve app overview”. No filename/path or repeated consent was supplied.

Session: `wrun_41M3SRGE6W0GZD57SJCV96J0A2`.
Completed read job: `d9be6dbc-4a4d-4c7f-bb4c-8c08e35007e9`.
The returned SHA-256 was independently compared with the local file and matched. No file content or pairing token is stored in this report.
Screenshot: `/private/tmp/sofie-mac-readme-success.png`.

## Failures caught and repaired by the live test

- Production intentionally excluded the integrations feature group. Added a separate `local-computer` feature and enabled only that group, preserving other disabled integrations.
- PostgreSQL timestamps were Date objects; normalized status timestamps to plain JSON ISO strings.
- The model used `README*`; the original substring matcher treated the star literally. The companion now accepts case-insensitive `*` and `?` filename wildcards.
- The original long conversation continued repeating its earlier permission refusals. Fresh conversations took the correct tool path; do not represent the old conversation as repaired.

The companion is currently started manually. Screenshot delivery and interpretation passed the live approval continuation test below. Click/type/key/scroll dispatch was not exercised on the live desktop. Autostart is pending separate user authorization; no login service was installed.

The definitive source is the attached `codex/sofie-local-access` worktree. Initial edits in the older main checkout predate the live-release rebase and must not be deployed as a substitute for this branch.

## Live shell approval acceptance

Requested only `pwd` through `local_computer_task`. The native chat rendered the exact `{operation:"shell", command:"pwd"}` approval. Before approval, canonical Action `action_a3e9824a-27ac-4b37-90da-d0b1738da911` was awaiting approval, its decision was pending, and zero jobs were queued. Approved that harmless read-only command as part of the connection test. Companion job `5ea408bc-15ce-4b41-8fbb-4329b0436cd8` completed, returning `/Users/jaywest`; The chat displayed the actual result. Exactly one job was recorded.

## Sol model selection and second exact-prompt test

The first screenshot reached the model as an image output but failed at Poolside with an input-length error. The UI had shown GPT-6.1 Sol while `agents.preferred_model` selected Poolside. Source `4dd8687`, deployed as `dpl_5ZBqw179zSEJpk9k9oV8MKAmuGNK`, makes the primary chat honor its picker after protected owner-channel, partner and selected-Work routes resolve.

A fresh chat repeated the exact original prompt and produced a complete README review without a supplied path or repeated consent. Session `wrun_41M3SSKNA80GW1QMCVQK629N36`; read job `75c3d35e-b6d3-4aae-8858-f626a59f1c1c`. The returned checksum independently matched the local README. Proof: `/private/tmp/sofie-sol-readme-success.png`.

That screenshot follow-up exposed a separate continuation problem: request context disappears across the approval pause, causing the selected model to fall back to the saved Agent preference. Source `f607aad` uses Eve's durable per-session state to retain the primary chat picker selection. It preserves all protected model routes. Regression results: 45 focused tests passed, plus full type checking and executor governance (734 sources). Final live continuation verification passed below.

## Final live acceptance

Final deployment: `dpl_8LcoMWxteaMkAMccpeBNtbSschy7` (`f607aad`), promoted to the live Sofie alias.

The exact original prompt passed again in session `wrun_41M3ST7MQ40GMTQ7W7CA5P01A9`. Completed Mac job `76a73255-22f4-4fcf-b722-175fc1cdd3d7` read the actual root README; its checksum matched the local file. Sofie returned an app overview and specific README recommendations. No path or additional permission wording was supplied.

A separate direct desktop test in session `wrun_41M3STDV980GNV4J8JZKPM2JHN` requested exactly `{operation:"screenshot"}` through the native approval card. After approval, job `9e33c0bb-d5aa-4fa3-bfa9-830c345ff82b` completed with one 1496×967 PNG. The model continuation successfully interpreted the image and described the Codex app and README preview visible on the main display. The previous Poolside/input-length failure did not recur. No click, typing, or file mutation was requested. Proof: `/private/tmp/sofie-sol-desktop-success.png`.

### Remaining limitations

- The Mac companion must remain running. It is running manually; automatic login startup has not been installed because automatic approval review required explicit authorization for persistence. The separate user question is still pending.
- Fresh conversations pass. Old refusal-filled conversations can continue repeating outdated claims.
- The final README session invoked and completed `start_task`. A follow-up screenshot request in that same closed task hit the existing `RUN_RECOVERY_REQUIRES_OWNER_REVIEW` guard before model execution. No authority was bypassed; the separate fresh-chat screenshot test passed. The general completed-task follow-up flow remains a separate issue.
