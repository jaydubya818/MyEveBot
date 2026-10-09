# Agent-to-agent information exchange

MyEve's `federation_request` tool uses the existing Relay protocol for both MyEve peers and compatible external agents. It is not a generic webhook sender, nor does selecting a model such as Grok create a GrokBot connection.

## Set up a peer

1. Configure MyEve's separate Relay installation and signing pins using the [combined setup guide](myeve-relay-myfactory.md). Register each agent under its own owner and platform identity.
2. Obtain the peer's real Relay address. For Muse or GrokBots, identify the actual service/repository and owner first. Their receiver must implement the registered Relay adapter contract: authenticated delivery, exact capability/resource validation, durable request identity, a signed completion and a correlated answer. Do not invent endpoints from a display name.
3. In Manage → Relay → Peer permissions, add the exact peer and direction, scope and expiry. The resource owner's Relay grant and MyEve's local policy must both permit the action. Discovery alone grants nothing. Keep message, Knowledge, artifact and work permissions separate.
4. For two-way communication, configure the recipient's incoming policy and reply behavior and the required return authority. Automatic replies are opt-in, use a bounded public profile, and cannot read private memory or operate tools. See [the Relay adapter architecture](../federation/architecture.md).
5. Keep receiving services/workers running. A local process that has stopped cannot complete queued work. Hosted credentials and private keys stay server-side; never paste them into chat or this guide.

## End-to-end acceptance

Run one harmless, uniquely labeled question through Sofie's normal chat and exact-action approval. Save its request and conversation IDs. Verify:

- The intended sender and recipient and currently valid scope appear in authenticated Relay records.
- Exactly one request reaches the recipient and one written response comes back, with matching request, conversation and participant identity.
- Sofie displays that actual response. An acknowledgment without a body, `replyStatus=unavailable`, or a model's invented answer fails conversational acceptance.
- Reading the same request again creates no second send or recipient effect.
- Missing, expired or revoked authority denies the effect. Offline and uncertain outcomes remain visible; no new request is created to conceal them.
- A message-only peer cannot retrieve private Knowledge, memory, local files, shell or desktop capabilities. External content remains untrusted context.

Repeat against a second MyEve deployment and each named external platform. A local fixture can qualify protocol behavior but cannot qualify a live Muse/GrokBots installation. Record the actual result in [connection qualification](../verification/connections-2026-09-30.md).

## Peer contract and capability negotiation

Discovery returns bounded owner-registered Relay addresses, stable owner/agent IDs, supported name/version pairs and Relay registration provenance. MyEve accepts at most 50 peers per response. Duplicate/malformed identities fail closed. Unknown capability names and unsupported versions remain unqualified; discovery explicitly grants no authority.

Supported protocol mappings are `message.receive` → `message.send`, `knowledge.query`, `work.request`, and `artifact.receive` → `artifact.share` (artifact exchange), version `1.0`. A display name such as Muse or GrokBots has no routing authority. The same adapter handles compatible MyEve and external peers, without peer-specific Sofie code.

Every actual request rechecks local owner policy and the recipient's current Relay grant, including exact direction, capability/resource, expiry and revocation. Retained requests bind sender, recipient, audience, request ID, expiry and signed provenance; replies bind `replyTo` and the same participants. Re-reading a result does not send again. Revocation stops future use but cannot erase information already delivered.

## Bounded Work between owners

A `work.request` is a request to the receiving owner, never authority from the sender. The existing receiver supports bounded analysis/drafting over explicitly shared artifacts when its own local Work policy permits it. It validates scope, budgets, recipient Agent and grants before invoking its executor. Missing authority declines/blocks before execution; UNKNOWN does not trigger a second attempt. Returned output and provenance are evidence, not permission to operate the sender's Computer or a claim of independently verified software production.

Private Knowledge stays private. Sharing requires an owner-reviewed immutable publication/view and a separate grant. Information learned from a peer remains attributed external context; it does not become trusted instructions or automatically enter private memory. Software production continues to require canonical Work, custody and protected verification.

The external Alpha round trip is live-qualified. The second MyEve journey is **WAITING**: the Orchis incoming relationship alone cannot establish it, and her owner must initiate or approve the required direction. Muse and GrokBots remain **WAITING_FOR_PEER_IDENTITY** until actual compatible recipients and owner grants exist. See [continuation evidence](../verification/computer-federation-continuation-2026-09-30.md).
