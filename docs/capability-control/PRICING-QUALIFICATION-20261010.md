# Pricing dependency qualification — 2026-10-10

PR #70 remains HOLD. The PostgreSQL integration pins Factory `ff8d464e111e40bb81ad642b4c91ce2df7f33f03`, containing independently reviewed test fixtures and a pricing proposal that is **not adopted**. This changes only CI's isolated source checkout; no installation, executable authority or production pin is changed.

Factory's historical production rate card expired October 10 UTC and its deterministic card expired October 9. Both retain model `openai/gpt-5.4-mini`; current authoritative sources confirm the same rates. The [Factory pricing record and exact proposed patch](https://github.com/jaydubya818/MyFactory/tree/ff8d464e111e40bb81ad642b4c91ce2df7f33f03/docs/capability-control/pricing-20261010) preserve history and record approval/source identity effects. Adoption remains an explicit decision. CI must keep failing the real expiry check until then.

The composed actual-Factory test now imports Factory's canonical synthetic policy fixture and uses its restricted runtime role with exact owner/installation/agent bindings. Missing and foreign-owner bindings are explicitly denied. No runtime authorization bypass, permissive fixture callback or weakened accounting assertion was introduced. Fixture cleanup removes the disposable policy schema and role.

Validation: MyEve capability PostgreSQL 47 checks and browser/accessibility 10 checks pass; TypeScript passes. With the reviewed but unadopted Factory price patch, the composed real PostgreSQL suite passes all 49 tests across three files. Before fixture repair, that candidate had 48 passes and one `CAPABILITY_INSTALLATION_UNQUALIFIED` failure. The published Factory runtime still has expired prices, so this candidate-only pass is not evidence that published-head integration CI is green.

No fake PostgreSQL clock, production binding, paid operation, grant, deployment, credential change or external-alpha change. Fresh-clone qualification remains blocked by the storage hold. Existing Checkpoint E deployment gates remain unchanged.
