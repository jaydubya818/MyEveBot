# Pricing renewal (pinned Factory source)

The Factory pins two model prices that expire (`production-model-provider.mjs` and `cloud-harness-plan.mjs`). After a
window ends every paid path fails closed. Expiry is a control, not a defect: never extend `validUntil` silently, never
backdate a revision, never add a skip or "allow expired" mode.

## Detection
- `.github/workflows/pricing-window.yml` runs daily (15:17 UTC) and on demand. It fails when either pinned window is
  expired or ends within 3 days. Local run: `node scripts/unified-beta/pricing-window-check.mjs --root <factory checkout> --warn-days 3`.
- While a window is expired this check is red. That is accurate and intentionally not suppressible.

## Current state (2026-10-21)
- Pinned alpha Factory source `a29f6926`: both prices `...20261010-v2`, expired 2026-10-17T00:00Z.
- MyFactory main carries owner-approved `...20261020-v3` (valid to 2026-10-28T00:00Z) but on a different lineage
  (a29f6926 is not an ancestor of main), so v3 cannot be adopted by repinning. See `PRICING-V3-EVALUATION.md` in the
  limited-beta-prep record.

## Renewal steps (each needs explicit owner approval; none may be automated)
1. Owner (Jay): re-check the `openai/gpt-5.4-mini` rate on Vercel AI Gateway and OpenAI; decide whether to renew.
2. Factory change on the pinned lineage: new revision record (never edit or backdate an old one), updated price
   constants, refreshed producer-governance hashes for exactly the two price sources, repinned source identity
   (new sourceDigest and FactoryVersion; no qualification evidence is inherited).
3. MyEve change: repin the Factory ref everywhere it is pinned (workflows, `scripts/myapps-composition/current-pins.mjs`,
   `scripts/unified-beta/qualification-envelope.mjs`, `docs/myapps/terminal-source-qualification-*.json`), requalify.
4. Independent review before merge; hosted CI green; only then any installation or registration change.
5. Put the new `validUntil` minus 5 days on the owner's calendar and keep the guard workflow enabled.

## Owners
- Rate decision and approval: Jay.
- Factory successor commit and MyEve repin: engineering, reviewed independently.
- Guard workflow health: engineering; a red guard is an alert to act on, not noise to mute.
