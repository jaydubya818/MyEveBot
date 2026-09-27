# Orchis → Sofie live conversation qualification

Status: **`WAITING_FOR_TESTER`** (September 27, 2026 UTC). Do not report
reciprocal communication `PASS` until a real tester-originated exchange meets
every acceptance check below.

## Current production evidence

- Relay's exact Orchis Agent → Sofie Agent `message.send` grant is active for
  seven days, through October 3, 2026 at 23:33:32 UTC, at 10 calls/hour. The
  signed grant audit was verified. It adds no Knowledge, Factory, or private
  memory access.
- Sofie's production Relay connection is active. Her exact incoming Orchis
  policy permits messages, and automatic replies are enabled with a nonempty
  owner-approved public profile. Model authentication is present; the selected
  free model appears in the provider catalog at zero cost. These are readiness
  checks, not evidence that an actual reply was generated.
- Sofie's authorized production inbox has zero incoming requests from the
  exact Orchis Agent since grant issue. Delivery, request/reply correlation,
  provenance, and duplicate suppression remain **NOT_RUN**.
- MyEve PR #41 changes only the displayed incoming-status label. It remains
  **not deployed** as part of this qualification; the current label can read
  “Relay auth required” before a request-specific authority check runs.
- The separate Vercel access token exposed during operator UI work was
  revoked, and Vercel listed zero matching active tokens afterward. Its scope
  was a Vercel team. No replacement is required for this live message path;
  any separate workflow depending on that token needs a newly scoped token.

## Acceptance after Orchis sends

Orchis must initiate “Send Sofie a harmless beta hello and ask for a short
acknowledgment” from her own signed-in Eve. Do not inspect Orchis's private
grants, access her account, or synthesize a send on her behalf. Monitor only
Sofie's authorized inbox and Relay records available from Sofie's side.

For the first real request, record its Relay request ID and conversation ID
privately. Verify the signed sender is the registered Orchis Agent, the
destination is Sofie, the exact seven-day grant was active at submission, and
the signed delivery appears once in Sofie's durable inbox. Correlate Sofie's
local incoming record and Relay acknowledgement with that same request.

Verify the automatic result contains a substantive written reply, with
`replyTo` pointing to the incoming request and the same conversation and
participant binding. A bare acknowledgment or `replyStatus: "unavailable"`
is not a reply pass. Check signed provenance and that the response used only
the approved public profile and incoming message. Re-poll/re-read the same
request without sending another message; verify one response and one local
effect, with no duplicate execution.

If Orchis provides a sanitized error, correlate only the identifiers and
approximate time she supplies against authorized Sofie/Relay records. Keep
the state `WAITING_FOR_TESTER` until a real incoming request exists; record a
failed step explicitly rather than inferring success from configuration.
