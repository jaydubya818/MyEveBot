# Private-alpha product source qualification

Status: **remotely durable qualified product source candidate; whole-product release PARTIAL**.

Branch: `codex/private-alpha-product-expansion`. Baseline and immutable product source hashes are in `source-manifest.json`; tested product checkpoint `ef0771797474216b2275bda349fa2d83ccd45dfe` was pushed and verified against origin. See `durability.json` for the receipt. No protected backend or migration change is included.

## Evidence

- Application suite: 1,105 PASS; 40 environment-gated skipped.
- Root/security suite: 135 PASS.
- Required typecheck: TypeScript, capability registry, skill routing, executor governance PASS; 580 classified sources, UNKNOWN=0. Existing Routine activation stays disabled.
- Production build: PASS with no runtime credentials or database URL inherited.
- Desktop 1440px / mobile 390px browser: 14 scenarios PASS, including three approval classes, history, mounted artifact editor, search/source outage, late-response rejection, keyboard focus trap/return, empty states, and disconnected fixture write count zero.
- Light/dark accessibility: 56 WCAG A/AA scans, zero violations; no horizontal overflow in captured views.
- Independent boundary review: findings corrected, 17 focused checks independently passed; see independent-review.md.

Browser API responses are controlled fixtures, except local session authentication. They establish UI behavior, not live provider, channel, canonical execution, production database or two-owner release qualification. No provider calls, deployment, publication, real sharing, or production data writes were performed.

Only fixture observations can report zero here: disconnected preview writes 0; wrong-owner rows in display-adapter tests 0; false Ready in candidate fixture 0. Actual cross-owner database safety, duplicate external effects and live verification are **NOT_RUN**, not inferred zero.

## Reproduce

1. `npm ci --ignore-scripts` in the isolated source checkout.
2. Run `npm test --workspace=eve-agent`, `npm test`, and `npm run typecheck --workspace=eve-agent`.
3. Build `npm run build --workspace=eve-agent` without production environment files or credentials.
4. Install axe-core in `/private/tmp/private-alpha-qa`; run `node apps/eve/test/private-alpha/local-server.cjs` on unused loopback 3196.
5. Run `npm exec -- playwright test --config apps/eve/test/private-alpha/playwright.config.ts` using installed Chrome. Restart the server after rebuilding to avoid cached chunks.

Final logs are retained here; screenshots and per-scan evidence are under `output/playwright/private-alpha`. Historical imported Beta UX evidence remains historical, not evidence of this new source. Initial browser findings (Computer refresh label/contrast; test selectors; visually empty artifact icons) were corrected before final capture.

## Post-integration monitoring and rollback

Canonical owner should inspect approval 401/409/503 rates, incomplete search-source reads, artifact detail failures and console errors in a bounded post-deploy smoke window. Healthy behavior: explicit source errors, no phantom completion, exact bound decisions, source-linked revisions. Roll back this product delta if navigation breaks, stale private results persist, or approval/authority semantics change. Do not roll back protected migrations or execution from this branch.

No deployment occurred; production monitoring is a future canonical-owner action.
