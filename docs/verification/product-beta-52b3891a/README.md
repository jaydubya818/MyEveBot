# Product/Beta 52b3891a compatibility evidence

Source: 9caacf60c6affae48f3cdaadfd3ecd7ca50dd0c2. Target: 52b3891a2685307cbb50bba97680070700df4cc0. Exact target remote SHA verified. See [consolidation crosswalk](../../private-alpha/CONSOLIDATION-52b3891a.md) and compatibility.json.

Results: whole-branch merge analysis 10 conflicts; expansion-only delta 2 conflicts; semantic overlap requires explicit adoption. No checkout merge/rebase, backend changes or migration allocation. Source code is unchanged during this comparison. The synthetic trees are analysis outputs only.

Rerun on 2026-09-29: owner UX 22 PASS; product browser 14 PASS; Canvas browser 18 PASS; desktop1440/mobile390 light/dark accessibility 136 scans, zero violations. All existing fixtures, no new ones. Product source test isolation does not qualify the combined application, which remains NOT_RUN here. Canonical Result/Proof/Golden Journey remain PARTIAL and live providers NOT_RUN.

Rerun logs and Playwright reports are in this directory. Screenshots and scans: `output/playwright/product-beta-52b3891a/product` and `…/canvas`. Prior private-alpha and work-canvas evidence directories were restored byte-for-byte.

Commands: `npm test --workspace=eve-agent -- components/owner`; `npm exec -- playwright test product.spec.ts --config apps/eve/test/private-alpha/playwright.config.ts`; `npm exec -- playwright test --config apps/eve/test/private-alpha/work-canvas.config.ts`. Used the existing credential-isolated local-server.cjs and previously qualified production build RFEurEcRHisRbRDICvEZA. No production credentials, provider requests, database migration, merge or deployment.

Merge analysis: `git merge-tree --write-tree --name-only --messages PRODUCT BETA` and `git merge-tree --write-tree --name-only --messages --merge-base=cdd7f2c BETA PRODUCT`. Exit 1 means the recorded conflicts, not a failed branch mutation. No merge commit was created.
