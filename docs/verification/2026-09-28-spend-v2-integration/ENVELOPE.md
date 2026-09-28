# Proposed bounded qualification — not authorized or activated

**Controlled installed-CLI dry run: PASS. Real provider qualification: PENDING. Credential: HUMAN_ACTION. Live MyFactory: NOT_RUN / NOT READY.**

This supersedes the old $1.90 and $1.02 examples; neither was live authorization. The four-operation proposal below includes actual client search/output. It is a fresh Work plan, never a budget increase to an admitted Work. [Exact dry-run evidence](efe9-envelope-dry-run.json) and [public price card](price-card.json).

## Exact locally qualified pins

Producer: `efe9e856f8fffbdb785497444a08d39e54d8f78d`. Reviewed consumer: `8b55e1924e6f3ed462c331d9e6aa5ea19845de00`; [independent exact-pair review](INDEPENDENT_REVIEW.md) PASS. The documentation follow-up contains the review without changing `qualified-consumer-source.json` or reviewed runtime bytes.

Factory ID: `factory-beta` (isolated local qualification identity). FactoryVersion: `cfb1521974b00b6e06370fb8050db499859ca1a03b91cd3b9e88663a8439cfa1`. Source digest: `e22a763392777c6f2e2c7ed5d78ddd028e0572cb36c28f5f8a0da83c4d6f9f03`. Configuration digest: `231825a383ba4a74fdbe8803cca3a1089b2a25d701ac58d0ec81391c43cd3b69`.

Executor: installed `codex-cli 0.157.0`, macOS arm64, Node `v24.18.1`, model `gpt-5.4-mini-2026-03-17`. Producer verifier: `node:22-bookworm`, observed image digest `sha256:363e1587494626837fa7f9a23bdb453d13b0ff3c67c705c2805cfc69c2d2fad7`; command `node --test`. Existing execution snapshot has `timeoutMs=1800000`; the Work deadline is the shorter **600 seconds** and must be enforced by the ledger/STOP flow. Do not claim a 600-second child timeout or silently change snapshot configuration. The separate UNKNOWN fault-injection test uses a shorter child timeout; it is not the successful envelope configuration.

These exact pins qualify the controlled loopback path. No executable real-provider connected configuration is installed. Adding that configuration requires producer-owned review, exact pin comparison and a matching controlled test before a live authorization is actionable; do not pretend the mock backend pin independently qualifies commercial execution.

## Work and acceptance

Fixture: `/private/tmp/q37-readiness-qualification/live-fixture`, base `024bab53fbde4577deab812a1e9705f8118b176f`, no remote. Preserved `../2026-09-27-live-readiness/live-fixture.bundle` SHA-256: `6e72f003b10d9e37d4d4df6cd8e57c44cb8e25556b2ac10b180f078f31d45b1b`. Create a disposable clone from that exact bundle. Only `quantity.mjs` may change.

Objective: implement trimmed-stdin positive-integer JSON conversion with `invalid_quantity` behavior for invalid input. All ten protected checks and `node --test` must pass against the exact candidate. Produce one local candidate commit, signed producer receipt, immutable MyEve custody and a protected independent verification result. The Work remains **PARTIAL**, never Ready from Factory evidence.

Allowed effects: one disposable local Work/attempt/workspace, metered provider calls only after separate live authorization, local Git candidate/evidence and offline verification. No remote push/PR, external Relay peer, deployment, package installation, hosted paid tool, production learning promotion, paid native repair or separate paid Sofie explanation. Local deterministic Current Truth reports route, Factory/version, ceiling/spend/reservations/UNKNOWN, execution, custody, verification, blocker and next step without another billed model.

## Complete conservative plan

Provider: OpenAI global standard Responses endpoint. [Official model/pricing source](https://developers.openai.com/api/docs/models/gpt-5.4-mini): 400,000-token context; input $0.75, cached input $0.075 and output $4.50 per million tokens. Use the entire context as the input reservation bound, full input price without cache discounts, and output cap 8,192 including billed reasoning tokens. Exclude regional surcharge, priority/batch/flex, other modalities, hosted/unknown tools and server-side conversation. Revalidate exact model access and pricing immediately before any live admission; the dry-run card expiry is not reusable live authority.

Per operation: `ceil(400000 × 750000 / 1000000) + ceil(8192 × 4500000 / 1000000) = 336864 microUSD`.

| Bound | Proposal |
| --- | --- |
| Productive model operations | 3: client lookup request, implementation tool request, productive final response |
| Protected completion operations | 1 separate read-only completion child/session |
| Maximum paid operations | 4 total per Work, durable across restart/attempt |
| Minimum complete reservation | 1,347,456 microUSD |
| Hard Work ceiling | **$1.35** (1,350,000 microUSD) |
| Protected completion reserve | **$0.336864** and one slot |
| Remaining arithmetic margin | 2,544 microUSD |
| Maximum Factory attempts | 1 |
| Work duration | 600 seconds |

The local client lookup itself consumes no paid slot. Every Responses request, including any retry, consumes a new durable slot and full reservation. A real model may need more than four requests; it must stop, not extend this plan. No automatic budget increase, unbounded retry, native paid repair or paid explanation is included.

The successful controlled run uses these exact Work/base/model/context/output/price/operation/ceiling values and the recorded FactoryVersion. Across three separate completed test Works it records three real client search outputs, three completion children and twelve scripted provider responses; a thirteenth response tests UNKNOWN on a separate Work. This aggregate does not increase a single Work's four-call allowance. Real model quality, provider acceptance and commercial billing are not proven by scripted responses.

## Intended provider path and account-owner handoff

Intended path: MyEve backend-reviewed configuration → authenticated connected MyFactory PREPARE/START → exact WorkOrder/attempt → installed `codex exec` → task-scoped local gateway → OpenAI Responses. Only the gateway holds the real provider secret and dispatches billed requests after atomic ledger admission. The productive child and separate completion child each create model requests; client lookup, local Git, producer Docker verifier, MyEve protected verifier and deterministic Current Truth add no model-provider charge. No personal CLI login may substitute for the dedicated service identity.

The account owner must supply **non-secret** dedicated OpenAI project/service identity IDs, confirmed access to the exact snapshot with billing enabled, global standard endpoint/region, permission scope, approved gateway-only secret-store reference, and an explicit expiry/revocation deadline plus responsible owner. Use restricted Responses permissions where available. Keep the secret in the approved store; never paste it into chat, Git, evidence, the CLI child or fixture. If platform expiry is unavailable, require manual revocation at the recorded deadline. Account limits supplement this enforced Work ceiling.

No credential was searched, copied, read or tested. Current producer connected execution defaults to **DISABLED** and permits only backend-injected **LOCAL_SPEND_FIXTURE** loopback mode. A credential alone cannot activate it. A real backend connection remains the producer owner's work after the intended identity/endpoint inputs are known; it must reuse this exact ledger/gateway and must not bypass or relabel the fixture restriction. A final live request must resolve that configuration and revalidate pins rather than carrying this blocker forward as READY.

## Stops and cleanup

Stop paid admission on UNKNOWN/missing usage, expired or mismatched price card, wrong model/provider/version/configuration, hosted/unknown tools, credential failure, reserve/slot denial, deadline, cancellation, authority conflict, artifact integrity failure, duplicate execution or failed acceptance. Preserve consumed slots and UNKNOWN exposure across restart, retry, cancellation and later generations. Historical completion is never current completion proof. Historical READ/STOP cannot fence a newer writer.

Cleanup: STOP the exact attempt; retain authority until productive/completion children and verifier resources are proven gone and the durable fence remains. Reconcile known usage; retain UNKNOWN reservation until authoritative settlement, never refund on timeout. Preserve signed results, custody, logs and ledger history. Revoke temporary qualification and credential authority, stop task-owned resources, verify no orphan execution, then remove only disposable fixtures after evidence capture. This execution/fencing/recovery cleanup passes locally; live credential revocation and commercial reconciliation remain **NOT_RUN**.

**Required human action:** identify the dedicated account/service identity and approved secret reference using only the non-secret fields above. No live approval or provider call is requested by this document. Final real-provider configuration must receive its own affected qualification/review before presenting one executable live authorization; the current local exact-pair review has passed.

Code trace at the pinned producer: `apps/supervisor/src/server.ts` requires injected dependencies and loopback for `localSpendFixture`; `apps/supervisor/src/dispatch-control.ts` exposes DISABLED otherwise. `apps/supervisor/src/spend-gateway.ts` supports HTTPS upstreams in isolation but does not install a real connected configuration. The account/secret-store input and producer-owned configuration remain distinct prerequisites.
