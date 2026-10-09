# Telegram current-main integration — 2026-09-24

Source integration is validated; Telegram execution stays release-gated. This
report supersedes the older Telegram branch's integration instructions. Historical
Eve 0.27.13 live-model evidence is not current Eve 0.66.3 qualification.

## Sources and changes

- Main baseline: 67550453ce1c87dd20631ca6664ee78fad5f4e3e.
- Telegram source: codex/telegram-owner-integration at 23a5497.
- Integration merge: b80c56f; Relay companion integration merge: e7a33b3.
- Preserved canonical migrations 0001–0035 and appended owner-channel migrations
  0036–0038. Existing branch-only disposable 0030–0032 owner-channel databases
  require rebuilding or a separately reviewed lineage migration; do not alter ledgers.
- Adapted dispatch and observation to Eve `sessions.create` / `sessions.attach`.
  Cancellation uses the same client and accepts its `no_active_turn` response.
- Preserved the current lazy Computer sandbox; did not restore obsolete eager
  provider provisioning or the old sandbox configuration format.
- Updated the public-fetch import/wrapper for current Eve, registered it against
  existing web.read authority, and derived model types from the executing Gateway.
- Session binding targets the current partial unique index. Exact approval-generation,
  current-session, local policy, budget and deadline checks are retained together.
- Removed the obsolete approval-time deadline extension. An expired Run refuses a
  delayed Telegram approval. Completed exact approval retries observe completion
  without re-entering the provider adapter.
- Reconciled executor inventory against current files; retained explicit classifications.

## Validation

- 1,024 Vitest tests passed; 40 gated tests skipped in the ordinary suite.
- Separately enabled all 39 PostgreSQL-backed owner-channel tests: passed.
- 135 Node tests passed; 38 ordered migrations validated.
- Capability registry: 142 definitions / 120 authored tools; executor inventory:
  569 sources, UNKNOWN=0. Imported skill routing: 93 checks.
- TypeScript passed. Production `next build --webpack` passed. Default Turbopack
  build could not bind its local subprocess port in this execution environment,
  including the attempted escalated run. No production bundler setting changed.
- Relay/MyEve cross-runtime signed handoff, exact approval, lost response and
  revocation test passed with synthetic model/provider fixtures. This is not a live
  provider or live Telegram result.
- Companion Relay: 397 regression tests passed (6 skipped), 2 performance tests,
  production build, typecheck/lint/schema checks and 1 mobile/keyboard UI test passed.

The disposable database ran on 127.0.0.1:56583. Owner runtime databases and servers
were untouched. No credentials copied, no live model calls, no Telegram messages,
no KMS calls, no infrastructure provisioned, and no deployment performed.

## Outstanding live qualification

OWNER_CHANNEL_RELEASE_QUALIFIED and Relay OWNER_EXECUTOR_QUALIFIED remain false.
Automatic Vercel deployment remains disabled on main and the integration branch.
Federation remains disabled by default. Source merge is not launch approval.

Owner must identify a dedicated Telegram @username and secure token-storage
reference (never disclose the token in chat), choose/authorize the hosted target
and exact synthetic owner/Agent mappings, webhook/signing trust, worker and bounded
model credentials. Apply migrations before running the target. Then run the live
Telegram golden path, including current runtime/model authentication, isolation,
approval expiry, cancellation, restart/recovery, budgets and ambiguous delivery.
The historical local-model harness has not been requalified against this runtime.
Do not remove immutable release gates based solely on these component tests.

Independent federation security: NOT_RUN.
Production-platform qualification: NOT_RUN.
Readiness: NO-GO — EXTERNAL QUALIFICATION PENDING.
