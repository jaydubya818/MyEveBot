# Local Mac access acceptance — 2026-09-30

Production: https://sofie-personal-agent.vercel.app

Hosted deployment: `dpl_8u9XT91nvBDDEDocUW5mRH5U3g4W`, source `055d66f`, based on the exact previously live release `f74eec988a7d1a3d606a47db8f7ca3be5b5b0c12`.
Local companion source: `e926284` (adds tested filename wildcards; no hosted runtime change).
Migration: `0075_local_computer.sql`, applied after validating the current production migration lineage.

## Exact prompt acceptance

Model picker: GPT-6.1 Sol. A fresh normal owner chat used the exact prompt:

> hello sol, can you review my read.me and tell me about this app

Sol checked Mac connectivity, discovered the main README, read `/Users/jaywest/Myeve/README.md`, and produced “MyEve app overview”. No filename/path or repeated consent was supplied.

Session: `wrun_41M3SRGE6W0GZD57SJCV96J0A2`.
Completed read job: `d9be6dbc-4a4d-4c7f-bb4c-8c08e35007e9`.
The returned SHA-256 was independently compared with the local file and matched. No file content or pairing token is stored in this report.
Screenshot: `/private/tmp/sofie-mac-readme-success.png`.

## Failures caught and repaired by the live test

- Production intentionally excluded the integrations feature group. Added a separate `local-computer` feature and enabled only that group, preserving other disabled integrations.
- PostgreSQL timestamps were Date objects; normalized status timestamps to plain JSON ISO strings.
- The model used `README*`; the original substring matcher treated the star literally. The companion now accepts case-insensitive `*` and `?` filename wildcards.
- The original long conversation continued repeating its earlier permission refusals. Fresh conversations took the correct tool path; do not represent the old conversation as repaired.

The companion is currently started manually. Its authenticated heartbeat reports Accessibility and Screen Recording available, but that alone is not an end-to-end desktop interaction test. Autostart is pending separate user authorization; no login service was installed.

The definitive source is the attached `codex/sofie-local-access` worktree. Initial edits in the older main checkout predate the live-release rebase and must not be deployed as a substitute for this branch.
