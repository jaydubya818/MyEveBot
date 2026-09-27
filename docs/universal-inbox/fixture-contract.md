# Beta Product Experience contract

Ready for fixture integration. No presentation components are changed.

Browser-safe imports: use `import type` from `lib/universal-inbox/contracts.ts` and load [beta-fixtures.json](../verification/universal-inbox/beta-fixtures.json). Do not import the fixture repository, service or server fixture factory into a browser bundle. For server-side tests use `createFixtureInbox()` and close its repository afterward.

The snapshot contains `inbox`, `needsYou`, `waiting`, `empty`, and structured error examples, pinned to `FIXTURE_NOW`. It includes a correlated Relay/decision thread, canonical approval presentation, an external email with an attachment reference, and follow-up. All identities and accounts are synthetic.

Each page has `{ version, items, nextCursor }`. Each item includes its rendered `needsYou` and `availableActions`; the UI must not duplicate those predicates. The action's `prompt` and `options` remain the question even when the latest thread message changes. Preserve response `idempotencyKey` across a network retry. Regenerate it only for a new user intent after reloading current state.

`createInboxApi` is an unmounted handler factory for integration tests and the future production route. Its authenticator must derive the principal from the canonical server session and its repository must be a qualified production adapter. Never accept `ownerId`, source events, arbitrary Work IDs, authority grants or provider credentials in its public payload.

| Operation | Contract |
| --- | --- |
| GET | `?view=inbox\|needs_you\|waiting\|archive&limit=1..100&cursor=...` |
| POST read/unread/dismiss | `{ operation, itemId, expectedRevision }` |
| POST response | `{ itemId, actionId, actionBinding, expectedRevision, idempotencyKey, answer }` |
| Accepted response | HTTP 202 `{ response }`; item is WAITING, not proof that Work resumed. |
| Read result | HTTP 200 page; `Cache-Control: no-store`. |
| Stale action | HTTP 409; refresh and show the current action instead of silently replaying a new choice. |
| Authentication | HTTP 401. |
| Cross-origin mutation | HTTP 403. |
| Wrong-owner/missing item | HTTP 404 with identical shape. |
| Invalid or oversized input | HTTP 400 / 413. |
| Storage unavailable | HTTP 503; retain the same response key for a safe retry. |

Render loading locally, distinguish empty results from a failed load, preserve a pending answer during retries, and show “Answer recorded; waiting for Work” for 202. Only a subsequent RESOLVED item with a canonical acknowledgment indicates the handoff completed. Approval 202 never means the underlying action has executed. Source content is text, not HTML or agent instructions; attachment references do not authorize downloads.

No live endpoint is mounted by this branch. No Relay, Gmail, Slack or external account connectivity is qualified by these fixtures.

## Integration-preparation handoff

The API factory additionally requires `sourceAuthority` and rechecks every retained source entitlement before returning an item or accepting a response. Scope-bound cursors are opaque and are invalidated when query/owner changes. Additive query fields support bounded Work/correlation threads and feed buckets; see `query.ts`.

The original fixture JSON remains preserved at accepted commit `36675bd`. Current [Beta/feed fixtures](../verification/universal-inbox/integration-preparation/beta-feed-fixtures.json) and [pinned UX crosswalk](beta-ux-crosswalk.md) supersede assumptions that the candidate already has an attention slot. Event additions include optional Work generation/version, Goal context, relation and waiting reason; response inputs remain unchanged. Never manufacture generation values for historical items.
