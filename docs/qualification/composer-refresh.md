# Composer refresh qualification

A newer server transcript remounts `ChatThread` so the agent hook can adopt its
updated events and session cursor. Previously, that remount detached the focused
textarea. Keyboard input arriving afterward was lost, leaving an empty composer
and disabled Send button. The focus-only intermediate repair also reset the caret.

The parent now retains the focused thread and its selection. The new composer
restores both in a layout effect after becoming ready, without scrolling. Moving
focus elsewhere or changing threads clears that handoff. Server transcript
refresh, ownership checks, draft state, send eligibility and execution authority
are unchanged.

`test/owner-ux/composer-refresh.spec.cjs` creates owner-authenticated disposable
threads and holds an actual server read while the stale local transcript renders.
It covers an empty composer, an existing draft, a middle caret, selected text,
thread-search focus, focus moved during remount and switching away/back without a
blur event. It verifies no Eve POST is sent and cleans up its own thread IDs.
The existing Owner UX Playwright configuration includes this file automatically.

Run the existing disposable Owner UX fixture documented in its README, then:

```sh
cd apps/eve
npx playwright test -c test/owner-ux/playwright.config.cjs test/owner-ux/composer-refresh.spec.cjs
```

The unchanged production-mode independent journey remains in
`test/owner-journey/independent.spec.cjs`, using the committed guarded local runner.
Owner UX CI runs both the focused regressions and its full journey matrix at the
exact pushed source. The proposal branch is excluded from Git deployments.

The historical E2 failure at `d2f2d4f82620aebc97f62c50c459df2708be0096` showed an
empty composer immediately after filling “What changed?” and before reconnect.
The confirmed refresh race produces the same visible failure, but the historical
trace cannot establish its exact scheduling. A later ordinary passing journey
alone does not prove that race is fixed. This repair's evidence is the controlled
before/after regression plus the unchanged journey; it does not qualify installed
External Alpha, real custody, current provider pricing or deployment.
