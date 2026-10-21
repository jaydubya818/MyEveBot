# Sofie completed enterprise Result consumer

Inactive, isolated candidate extending accepted MyEve 4b8cacce64f260b0816ff615222a3cac621d749b. The existing three-tier routing, proposal and owner-authorized draft flow is preserved. No external-alpha source changes or production authority.

Use `enterprise.result` with the exact Mission ID and approved Plan digest after the authenticated MissionControl owner creates a connection bound to that Mission/Plan. Model input cannot supply owners, scope, authorization, verdicts or administrative operations. Owner and initiator must both be the configured primary web-session owner.

The tool uses canonical durable Action admission and a unique server-generated target for each read observation. It verifies the request-bound HMAC, configured owner/tenant/project/connection, Mission/Plan, independent verification/FactoryVersion/candidate/evidence and settlement identities. The explanation follows the typed canonical projection. No narrative or Factory success implies enterprise PASS. Owner acceptance is separate; expired or changed evidence requires a new read. A lost read acknowledgment permits a new observation without resending execution or settlement.

The exact native-successor hybrid runner invokes `apps/eve/test/missioncontrol-result.integration.mjs` through `MC_SOFIE_RESULT_CONSUMER_ROOT`. This module uses actual executed native/delegated Results, an ephemeral Convex database and a disposable PostgreSQL database with the canonical MyEve migrations. It does not create fake successful Results or change owners to manufacture a positive match. Mutation-based fault injections only prove denial and restore the original synthetic records.

The existing draft integration fixture remains a separate regression. Hosted CI covers contracts, type checking and real database intake/denial; private-image actual hybrid evidence is separately qualified locally. Golden Journey owns composed browser, owner acceptance/reconnect UX, release-gate and security adoption. Neither source candidate is adopted automatically.
