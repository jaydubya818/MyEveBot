# Owner conversation qualification

The operator browser controller recognizes a completed assistant turn followed
by `session.waiting` with `wait: next-user-message` as the normal continuation
boundary. It does not change Eve's session protocol or application runtime.

Before continuation, the controller matches owner-scoped browser storage to the
exact thread, session and Work, verifies the latest turn completed, and compares
its waiting event to the authenticated durable session tail. Failed or cancelled
turns, pending human-input/authorization requests, terminal sessions, stale
copies and unavailable readback prevent Send. An ambiguous acknowledgment is
never automatically retried.

`apps/eve/scripts/owner-conversation-qualification.mjs` is the canonical operator
helper. Retired temporary helpers are historical evidence and must not be used
for a future qualification. The helper establishes conversation readiness only;
separate live model/Work authority is required before invoking its Send helper.
It cannot restore a revoked grant or reopen an expired budget.

Run the affected regression without providers or production credentials:

```sh
node --test apps/eve/scripts/owner-conversation-qualification.test.mjs
```

The root `npm test` CI step includes this suite. It exercises completed turn →
normal waiting → one owner message → the same conversation, plus identity,
staleness, failure, cancellation, authorization, deadline and acknowledgment
denials. Synthetic events exist only inside deterministic tests; production
qualification reads actual persisted browser and server state.

An earlier qualification stopped at an overly restrictive waiting-state guard
after productive execution and evidence custody succeeded. Preserve that failed
qualification record and its earned execution evidence. Fixing the observer
does not authorize another Factory execution.
