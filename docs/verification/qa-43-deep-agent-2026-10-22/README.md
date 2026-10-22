# MyEve PR #93 — Deep Agent base (do not merge to main)

Recorded 22 October 2026, America/Los_Angeles.

| Field | Value |
| --- | --- |
| PR | [#93](https://github.com/jaydubya818/MyEveBot/pull/93) |
| Branch | `cursor/qa-deep-agent-b54d` |
| Base | `codex/q37-private-alpha-continuation` |
| Head SHA at preservation | `1801b57ceb2d3d18325cc5115c78d9fae9b68dc6` |
| Scope | QA-43: cross-platform tmpdir in Deep Agent process-recovery tests; builder manifest claim for `engineering_direct.test.ts` and `engineering_factory.ts` |

This branch is the designated Deep Agent continuation. It must not be merged into `main`. Automatic Vercel Git deploys for `cursor/qa-deep-agent-b54d` remain disabled in `apps/eve/vercel.json`.

Main-line QA fixes live on PRs #91, #92, and #94 and on their consolidated integration candidate. Combining those with #93 would mix the Q37 continuation history into `main` and is out of scope.

No merge, deploy, or tester activation is authorized by this note.
