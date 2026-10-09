# Admin clarity and owner documentation

## Scope

Reviewed the 20 admin sections visible in the qualified local runtime through the browser. Added a Documentation destination with 12 searchable owner guides, reachable from each settings section. Topics cover first use, the admin map, service health, connections/channels, Agents/roles/skills, Memory/Knowledge, recurring work, approvals, Relay, Jev, backup, and troubleshooting.

This change improves presentation and recovery guidance; it does not repair missing credentials, provider outages, backup backend failures, or stale task lifecycle state.

## Changes

- Plain-language navigation descriptions wrap instead of truncating.
- Documentation separates its topic index from the selected article. Bookmark URLs survive reload; browser Back and keyboard navigation work.
- Documentation does not wait on capability loading, so help is reachable during service problems.
- Generic capability badges say Configured rather than implying a live health check passed.
- System explicitly distinguishes catalog reachability from authenticated model inference.
- Connections failures expose retry and System navigation instead of an empty-looking list and environment-variable instruction. Refresh is available after account authorization. Disconnect no longer removes an account optimistically before the server confirms success; failure is inline.
- Backup failures explain that unavailable inventory is not empty data and link to System. Data tabs expose their current state to assistive technology.

## Verification

- Clean locked dependency installation in the isolated worktree; canonical runtime dependencies unchanged.
- TypeScript no-emit check: pass.
- Next production build: pass, including TypeScript and static page generation.
- Focused Vitest suites: 16 tests passed (12 owner-data tests, 1 owner-data component test, 3 activation tests).
- Browser preview at localhost:3005, isolated from the running localhost:3001 application.
- Documentation search: Jev returned three relevant guides; backup returned two. Empty search results and Clear search recovered correctly.
- Jev guide content and related settings links rendered; no provider inference invoked by browsing documentation.
- Bookmarked #jev reload, article opening, Back to all guides, and browser Back passed.
- Keyboard focus moved to the selected article heading; Shift+Tab reached Back to all guides and Enter activated it.
- Mobile at 390×844: document clientWidth and scrollWidth both 390; readable single-column article and no page-level horizontal overflow. Viewport override restored afterward.
- Desktop screenshot visually reviewed against the existing dark theme.
- git diff --check: pass.

## Limits and preserved state

No source changes were made in the shared runtime checkout. No canonical server/worker/engine/Relay restart, schema migration, grant change, credential change, external message, or Production action was performed. Preview uses the existing protected local configuration in memory and a separate port; no secrets were committed.

The preview lacks some deployment-specific integrations. Actual OAuth authorization, disconnect execution, backup recovery, and provider inference were not claimed as live-qualified by this UI change. Existing authentication and backend availability issues require separate operational work.
