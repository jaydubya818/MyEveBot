# Peer conversation UI qualification — September 23, 2026

The owner requested real bidirectional agent conversations and direct guest information retrieval. This report distinguishes delivery from an authored reply.

## Verified

- A fresh conversation at localhost:3001 failed the harmless READY_FOR_AGENT_CHAT model canary with `AI Gateway received no credentials`. No outbound peer message was requested or sent by this canary.
- Atlas's exact durable message.send relationship remains active, requires Action approval, and has the approved seven-day Relay grant ending September 30 16:49 UTC.
- The isolated candidate UI at localhost:3004/manage/relay successfully copied an Atlas message proposal without asking for or supplying an internal resource. Canonical Federation must resolve the binding before approval.
- The seven-day default grant-expiry preference was saved through the UI and retained after reload. Never-until-revoked is visible; no live grant was changed to Never.
- 41 draft, peer-permission, and canonical tool tests pass, along with TypeScript and executor governance. The candidate UI build passes.

## Defects corrected

- Relay's owner message composer still required a raw messaging resource despite canonical automatic binding. Removed that field and omitted resource from proposals.
- Reply recipient is now read-only and derived from the authenticated incoming sender; replyTo and conversationId remain attached.
- Delivery acknowledgments are explicitly labeled as receipts, not agent-written replies. Canonical tool guidance likewise forbids claiming a conversational answer from acknowledged:true.

## Not qualified or implemented

The current message receiver records a bounded acknowledgment only. It does not invoke the receiving agent to author a response. Existing separately authorized reply messages have exact conversation/request/participant correlation, but a real two-agent dialogue has not passed UI testing. Automatic reply generation is not implemented by this change.

The current web chat is an owner workspace, not a guest information portal. Direct visitor access needs an explicit audience decision and an isolated, read-only context containing only owner-shared information. Do not expose the owner chat/session or private Knowledge tools to visitors.

Remaining acceptance cases: authenticated model canaries on both agents; exact Action approval and one delivery; actual peer-authored reply and a second conversational turn; replay/duplicate prevention; refusal after revocation/expiry; missing-relationship guidance; authorized published information retrieval; denial of private/unpublished information; guest conversation/session isolation.

## Integration boundaries

This branch stacks on the unmerged grant-expiry settings candidate. Shared runtime Knowledge and Composio changes were not modified. No migrations were run. No Production deployment or access expansion occurred. Complete the outstanding runtime tests before claiming end-to-end qualification.
