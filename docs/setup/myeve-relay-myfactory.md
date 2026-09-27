# Set up MyEve, Relay, and MyFactory together

**Gate B local qualification (2026-09-27): PASS.** From canonical baseline `7bf276493eb2b3206a50eea0c4c9c262b7396014`, registered migration **0056** extends the existing route Run, session fencing, Gate C admission and protected verifier. One scoped Work has at most one current productive writer; immutable historical Runs and custody remain available. Both Factory success and Factory-failure → new native repair journeys end in protected verification PASS and a **PARTIAL Result**, never Ready. [Implementation, immutable migration checksum, exact journey evidence and validation](../verification/2026-09-27-gate-b/REPORT.md). M1 local regression is PASS; M1 live remains NOT QUALIFIED; Gate C remains PASS/CLOSED. **Live MyFactory = NOT READY / NOT_RUN**: the local synthetic transport is qualified, but a concrete live adapter proving durable remote fencing/quiescence is not configured or qualified. Independent review of this implementation is pending.


**Canonical Digital Worker integration (2026-09-27):** `codex/digital-worker-integration` combines M1 implementation `90d668f`, its documentation-only `78b6bef` update, and qualified Gate C `96ae446`. [Combined evidence and canonical commit identity](../verification/2026-09-27-digital-worker-integration/REPORT.md) record local M1 **PASS** (Result **PARTIAL**), M1 live **NOT QUALIFIED**, Gate C **PASS / CLOSED**, and **zero cross-boundary authority violations / false Ready**. Migration 0053 and Gate C 0054 are unchanged; the legacy remote migration is renumbered byte-for-byte to registered 0055. The dirty older Digital Worker implementation is superseded, with its historical evidence preserved under its owner. That immutable baseline preceded Gate B; the forward 0056 tranche and its actual local qualification are recorded above. Live MyFactory remains **NOT_RUN**.


MyEve is the owner's agent and chat app. Relay is a separate control plane for scoped capabilities between agents and owners. MyFactory is a local supervisor that turns an admitted WorkOrder into a reviewed candidate. You can use MyEve alone, then connect either service independently. None of these connections lets Sofie approve, merge, or deploy her own code.

## Gate B single-writer lifecycle

Gate B uses the current `engineering_route_runs` writer slot and normal route admission. Migration `0056_factory_writer_handoff.sql` adds durable dispatch identity, writer generation, stop/quiescence/fence state and immutable historical custody. Its SHA-256 is `dc4a908d6f3abd665824cb249459df850a92ff7c4346fded461a2061ba72b2bc`. Existing migrations are unchanged. Qualification applied it only to disposable databases; this is not a live migration or rollout instruction.

1. Fence the native Run under the canonical Work lock only after native calls, mutations and verifier resources are resolved. Preserve its session, workspace and budget history.
2. Advance the Work revision/generation and use normal admission for one bounded Factory request. Bind Work, route Run, writer generation, request/WorkOrder/remote attempt, exact FactoryVersion, repository/base, allowed paths and deadline.
3. Commit the dispatch claim as UNKNOWN before transport I/O. Replay and restart reuse this identity and never blindly resend. UNKNOWN or STOPPING continues occupying the writer slot and blocks native and human acquisition.
4. Gate C authenticates and durably admits the returned bytes. Independently reconcile the exact Factory attempt. Cancellation, expiry and signed completion alone cannot establish quiescence. The trusted transport must stop productive processes **and durably reject delayed dispatches** for the same identity before reporting terminal state.
5. Fence the terminal Factory Run, then establish immutable candidate custody using the existing workspace and exact receipt/commit/tree/patch. Producer, FactoryVersion, attempt and receipt remain MyFactory provenance. No native writer is manufactured for verification.
6. Run the existing protected verifier with its normal lease, process-loss recovery and resource inspection. Local PASS produces PARTIAL; publication, independent review and owner acceptance remain separate. On FAIL, a new normal native admission/Run/session can repair the exact retained Factory draft. Earlier native and Factory custody remains immutable on historical Runs.

Human takeover follows stop → reconciliation → proven terminality → Work control transfer. Late authenticated results remain historical and cannot replace newer custody. The shared Work/Chat projection reports the Factory state, blocked next step, retained candidate history and verification outcome. It grants no authority.

The trusted `FactoryExecutionTransport` is an internal server interface, not a model-facing tool or user-supplied quiescence claim. The local tests use a durable synthetic producer with terminal tombstones. Existing producer attestation alone does not implement this live control contract. A live adapter and its exact-attempt remote fencing remain prerequisites to any separately authorized bounded live qualification. **Live MyFactory = NOT READY / NOT_RUN.**

See the [Gate B dossier](../verification/2026-09-27-gate-b/REPORT.md) for reproduction commands, seven PostgreSQL race pairs, eight SIGKILL boundaries, historical preservation, role tests and both local journeys.

## 1. Get MyEve working first

Follow the [README getting started section](../../README.md#getting-started) to run the app locally, or deploy it with MyEve Builder to your own Vercel project. Builder installs MyEve; the Relay and MyFactory connections are configured afterward in their own systems and the MyEve project. Configure owner authentication, the database, and migrations before testing chat. On Vercel, the app and Eve agent service belong to the same project; `/eve/v1/**` must route to the agent service. Send a harmless chat message and confirm a reply before connecting other systems.

Use separate credentials and data stores for each installation. Keep secrets in ignored local environment files or the relevant deployment's secret settings; never put them in the browser or in Git. [`apps/eve/.env.example`](../../apps/eve/.env.example) lists the optional connection names.

## 2. Connect MyFactory for local software work

For the Digital Worker integration, MyFactory producer attestation is **LOCALLY QUALIFIED** at `fcd8afd`. Q37 now consumes its exact protocol through the existing authenticated local attempt endpoint and persists Work-bound receipt/admission states. Exact replay reuses one admission; conflicting manifests are retained as CONFLICT; stale/cancelled/retired-key results remain historical. The [durable consumer report](../verification/2026-09-27-q37-integration/myfactory/gate-c/durable/REPORT.md) links the real protocol, signing-key policy, artifact transport and local evidence. Migration **0054 is registered** and **Gate C is PASS locally and closed**. Independent MyEve protected verification and Gate B **PASS locally** through registered **0056**; live Factory is **NOT_RUN**; readiness is **NOT_READY**. Receipt custody confers no writer or publication authority.

Migration 0054 is Q37-owned and locally qualified on fresh and populated disposable PostgreSQL schemas. It has not been applied to any existing database. Its canonical registration and the two explicitly authorized existing fingerprint updates are complete; all 54 migrations validated in that historical Gate C qualification. The current Gate B chain validates 56 migrations; unrelated inventory entries remain unchanged. Gate B now reuses the canonically integrated writer/session fencing and Gate C admission with the approved forward 0056 extension; no protected owner worktree was modified. These setup instructions do not authorize live Digital Worker execution or a writer transfer.

MyFactory runs on the owner's Mac. In its [source repository](https://github.com/jaydubya818/MyFactory), follow [Run the work desk](https://github.com/jaydubya818/MyFactory#run-the-work-desk) and [hosted routing](https://github.com/jaydubya818/MyFactory/blob/codex/local-factory/docs/hosted-routing.md). Register a `myeve` client for the approved repository, configure its route (repository path, base ref, and check commands), enable `FACTORY_HOSTED_INTAKE=true`, and configure the host's Linear connection. Start the connected supervisor with `npm run start:connected`; its work desk is loopback-only at `http://127.0.0.1:8788`. The host polls Linear every 15 seconds, so the Mac must be awake and the supervisor running to admit queued requests. The [connection guide](https://github.com/jaydubya818/MyFactory/blob/codex/local-factory/docs/connections.md) covers registration, token custody, and read-only Linear verification.

Attach the approved Linear connector to **your MyEve Vercel project**. Set these values in that project's server-side environment and redeploy:

| MyEve setting | Source |
| --- | --- |
| `MYFACTORY_REPOSITORY` | Exact allowed `owner/repo` registered on the MyFactory host |
| `MYFACTORY_LINEAR_TEAM_ID`, `MYFACTORY_LINEAR_WORKSPACE_ID` | IDs of the host's configured Linear queue |
| `MYFACTORY_LINEAR_CONNECTOR` | Name of the Linear connector authorized for this Vercel project |
| `MYFACTORY_CLIENT_TOKEN` | Private token for the registered `myeve` client; server-side only |
| `MYFACTORY_RECEIPT_PUBLIC_KEY` | Public half of the host's receipt-signing key |

The hosted app submits a signed request through Linear; it never calls the Mac's loopback port from the cloud. Ask Sofie: “Create one MyFactory WorkOrder for `owner/repo` to update the setup guide. Limit changes to `README.md`; acceptance criteria: the three components and verification steps are documented. Do not start coding or publish anything.” Sofie should return a request ID and Linear issue link. An `awaiting_local_factory` result proves only that the request is queued. Ask Sofie to check the **same request ID** with `get_factory_work_order`, then compare the verified receipt's WorkOrder ID with the local work desk. A `received_by_factory` receipt proves admission, not completed coding. If a response is uncertain, read back the same request ID before any retry; do not file a replacement issue.

The local owner chooses when to start a coding attempt, reviews exact checks and diff, and confirms any draft-PR publication. Merge and deployment remain separate owner decisions.

MyFactory's current README describes the first real target-repository draft-PR qualification as pending. Treat receipt/admission verification and draft-PR publication as separate milestones.

## 3. Connect Relay only when its boundary is ready

Deploy Relay separately with its own account, database, keys, and operator controls. Read the [Relay source and deployment guide](https://github.com/jaydubya818/relay) and MyEve's [federation architecture](../federation/architecture.md). MyEve federation is disabled unless `MYEVE_RELAY_ENABLED=true`; enabling it requires an exact HTTPS `MYEVE_RELAY_ORIGIN`, pinned Relay signing key ID/public key, a separate encryption key, and the owner/artifact settings described there. Apply MyEve's Relay migration and run its worker under supervision for the intended installation. Authorize each Agent and capability explicitly in Relay; do not reuse MyEve's owner session or MyFactory's client token as a Relay grant.

Relay can also submit MyFactory WorkOrders from its own `/factory` surface where that integration is deployed and configured. Give the Relay Vercel project its **own** MyFactory client registration, Linear connector authorization, token, and receipt public key, plus `MYFACTORY_RELAY_ACCOUNT_ID`; use the same [hosted routing contract](https://github.com/jaydubya818/MyFactory/blob/codex/local-factory/docs/hosted-routing.md). MyEve-to-MyFactory intake does not depend on Relay, and enabling Relay does not silently enable MyFactory. Check each deployment's qualification and grants before using it for real work.

## 4. Use Foreman when you want delegated issue work

Foreman is a separate Linear agent workflow. Follow the [Sofie–Foreman setup](../../apps/eve/docs/qualification/sofie-foreman-handoff.md) to attach its Linear connector and configure `FOREMAN_LINEAR_CONNECTOR`, `FOREMAN_LINEAR_WORKSPACE_ID`, `FOREMAN_LINEAR_TEAM_ID`, `FOREMAN_LINEAR_DELEGATE_ID`, and `FOREMAN_REPO`. Set `NEXT_PUBLIC_LINEAR_WORKSPACE_URL` to show the **Linear issues** shortcut in MyEve's sidebar. Tell Sofie to delegate one scoped issue and ask for the issue URL. In Linear, confirm the Foreman delegate in Properties and use **View progress** to open its session; Activity shows updates. Foreman may produce a draft PR. It is not the local MyFactory WorkOrder path.

## Check the whole path

1. Confirm MyEve chat replies on the actual deployment and its Linear sidebar shortcut opens the intended workspace.
2. Confirm the MyFactory host's Linear connection is ready, hosted intake is enabled, and the approved repository route exists. Do not expose port 8788 publicly.
3. Send exactly one bounded MyFactory test request from Sofie. Check the Linear issue, the local WorkOrder, and the signed receipt for the same request ID. Do not interpret a queued issue as a completed run.
4. If using Relay, verify its own account/grants and submit a separate bounded request from Relay; confirm it maps to its own registered client and the same host receipt contract.
5. If using Foreman, delegate a separate test issue and verify the Linear agent session and any draft PR independently.

If Sofie reports a 404 HTML response to chat, check the production alias and the app's `/eve/v1/**` route before diagnosing Linear or MyFactory. If a WorkOrder remains `awaiting_local_factory`, check the host's intake status, Linear access, and whether the Mac is awake; read back the same request ID. Do not weaken authentication or copy another component's token to make a test pass.
