# Work Canvas interaction qualification

Status: **PASS for the disconnected interaction candidate. Live canonical integration remains pending.**

Route: `/work-canvas`, linked from `/product-preview`. See [product guide](../../private-alpha/WORK-CANVAS.md) for the design and integration contract. This follow-up builds on remotely verified product checkpoint d41c47c. Tested source hashes are in source-manifest.json; the pushed source SHA is supplied in the durability handoff.

## Final checks

- 9 focused tests passed: candidate/verification gating, invalid or cross-journey choices, separate confirmation, repeated confirmation, expiry, failed checks, required change instructions, plus prior display-boundary tests.
- Required typecheck passed: TypeScript, registry, skill routing and executor governance; UNKNOWN=0.
- Production build passed without inherited provider/database credentials.
- 18 browser scenarios passed: all four journeys on desktop 1440×1000 and mobile 390×844; all engineering choices; failure/retry/expiry; keyboard confirmation; focus placement; same-screen continuation; journey reset.
- 80 WCAG A/AA scans passed with zero reported violations, across light/dark themes and both viewports. Captures assert horizontal fit, persistent MyEve navigation/header and composer, and no outer-page scroll.
- 80 screenshots retained, covering request, investigation, delegation, verification, Result, choices, confirmation scope, proof, artifacts, continuation, failed checks and expired proposals.
- Observed prototype journeys performed zero mutation requests. This is fixture isolation evidence, not live provider or cross-owner safety proof.

Visual review found and corrected inherited radio spacing and mobile ancestor scrolling. A stricter navigation visibility assertion caught the latter even when interaction checks passed. Final captures were reviewed after the correction. Earlier captures are excluded from this dossier.

Protected agent, lib, scripts and migration paths are unchanged. Existing `/work` and canonical execution surfaces remain unchanged. No deployment, publication, email send, sharing, live Computer session or Q37 qualification occurred. Chromium mobile emulation is covered; physical iOS/Android keyboards and assistive-technology usability still need live-device qualification.

## Selected screenshots

| State | Desktop | 390px mobile |
| --- | --- | --- |
| Engineering Result | [Light](../../../output/playwright/work-canvas/desktop-engineering-result-light.png) | [Light](../../../output/playwright/work-canvas/mobile-engineering-result-light.png) |
| Four publication choices | [Light](../../../output/playwright/work-canvas/desktop-engineering-choices-light.png) | [Light](../../../output/playwright/work-canvas/mobile-engineering-choices-light.png) |
| Exact confirmation scope | [Light](../../../output/playwright/work-canvas/desktop-engineering-decision-light.png) | [Light](../../../output/playwright/work-canvas/mobile-engineering-decision-light.png) |
| Proof of Work | [Dark](../../../output/playwright/work-canvas/desktop-engineering-proof-dark.png) | [Dark](../../../output/playwright/work-canvas/mobile-engineering-proof-dark.png) |
| Email reply | [Dark](../../../output/playwright/work-canvas/desktop-email-artifact-dark.png) | [Light](../../../output/playwright/work-canvas/mobile-email-artifact-light.png) |
| Research sharing | [Light](../../../output/playwright/work-canvas/desktop-research-decision-light.png) | [Light](../../../output/playwright/work-canvas/mobile-research-decision-light.png) |
| Proactive continuation | [Light](../../../output/playwright/work-canvas/desktop-proactive-continuation-light.png) | [Light](../../../output/playwright/work-canvas/mobile-proactive-continuation-light.png) |

## Reproduce

Use the existing lockfile install and installed Chrome. Install axe-core into `/private/tmp/private-alpha-qa` as in the prior private-alpha dossier. Run:

```
npm test --workspace=eve-agent -- components/owner/work-canvas.test.ts components/owner/product.test.ts
npm run typecheck --workspace=eve-agent
npm run build --workspace=eve-agent
node apps/eve/test/private-alpha/local-server.cjs
npm exec -- playwright test --config apps/eve/test/private-alpha/work-canvas.config.ts
```

Build without production environment files; the local-server script supplies only fixture authentication on loopback port 3196. Restart it after rebuilding. Archive the previous `output/playwright/work-canvas` directory before recapture, because audit output appends. Stop the task-owned server afterward. Logs here normalize terminal whitespace only.
