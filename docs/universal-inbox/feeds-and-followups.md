# Today, Daily Brief, follow-ups and notifications

Composition remains owned by product integration. All functions return data/intents only. Production composition must use `authorizedReader(inbox, sourceAuthority)` so revoked/private source histories cannot leak through a summary.

`todayContribution(reader,since,until)` returns: Needs You count capped at 100; a separate 20-item Needs You page with a correct continuation cursor; important unread incoming messages; active blocked Work; resolutions in the window. Count and page can change between reads; no transactional dashboard-snapshot guarantee is implied.

`dailyBriefContribution(reader,since,until)` returns five independently bounded 20-item pages: new Needs You, unresolved important items (including still-unanswered necessary judgments), resolved since the previous brief, external replies and follow-ups due. Every page has its own continuation cursor; product composition decides whether to paginate. Deduplicate cross-section entries by item ID/correlation where needed. The same resolved reply can legitimately qualify as both a resolution and an external reply.

Window convention is `(since,until]`, normalized UTC. Resolution and owner-action timestamps are dedicated fields; marking an old item read cannot make it a new resolution. Replies use persisted receipt timestamps so delayed delivery appears in the next brief. These are current-state contributions, not a historical replay API: an item settled before composition no longer appears as unresolved.

| State/input | Inbox | Needs You | Today | Daily Brief | Push |
| --- | --- | --- | --- | --- | --- |
| Necessary current owner action | Yes | Yes | Yes | New or unresolved | Only explicit urgent + supported channel + owner opt-in |
| Routine internal transition / retryable failure | Adapter discards | No | No | No | No |
| Informational message | Yes | No | Important + unread only | Important unresolved / reply window | No |
| External/provider/schedule wait | Yes | No | If explicitly important/blocking | Due follow-up / important | No |
| Owner answer awaiting canonical receipt | WAITING | No | If still marked blocking | Important unresolved | No |
| Result/resolution | Informational result/history | No | Recent resolution | Resolution window | No |
| Expired/superseded request | Retained history; no action | No | No actionable card | History as needed | No |

The pure policy returns a stable `notificationKey` but never writes a delivery queue or sends a notification. Existing `review_deliveries`/ExecutionDelivery owns durable send dedupe and permission checks. A crash after resolution before notification is safe because re-reading yields the same key; the delivery owner must consume that key idempotently. No claim is made about live exactly-once push delivery.

`followUpIntent` yields `{ownerId,key,attentionId,workId,correlationId,dueAt,waitingFor,requiresExistingScheduler:true}` for WAITING external/provider/schedule items with an existing target time. The stable key includes item and due time. Waiting-owner items retain their single Needs You request; they do not generate periodic nudges. Once a reply or canonical completion settles the item, no intent is returned. The scheduler must re-read current state before dispatch and dedupe by key; cancel/reschedule semantics stay with the existing scheduler.

A reminder occurrence uses existing reminder ID + normalized scheduled timestamp as source identity. Repeated delivery is one event; the next recurring occurrence is a different event. No new timer, timezone parser, recurrence engine or provider polling loop is introduced.
