# Live production installation validation

Status: **PARTIAL** overall. Owner sign-in is complete. The production application and Work boundary checks below are live observations, not simulated responses.

## Protection correction

The initially saved exact Sofie Production → Factory Production trust rule was correct, but Factory Standard Protection left the production alias outside deployment protection. Earlier anonymous401 observations came from Factory application authentication and did not qualify Vercel source isolation. A fresh Development identity exposed that distinction. Those earlier observations retain their narrower meaning.

Automatic approval review rejected the persistent change to All Deployments as outside the earlier exact trust-rule authorization. The owner then explicitly approved changing only Factory project `prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK` to All Deployments. The change was saved; API readback confirms `deploymentType: all` and the unchanged sole cross-project production→production allow rule. No static bypass or broader trusted source was added.

## Live observations after protection correction

| Probe | Observation |
| --- | --- |
| Untrusted source |302 to Vercel authentication; redirects not followed; Factory response not exposed |
| Invalid workload token |302 to Vercel authentication; redirects not followed |
| Exact Sofie project, Development identity |403 with `TRUSTED_SOURCES_ENVIRONMENT_MISMATCH` |
| Exact Sofie project, Preview identity |Hosted Preview identity:403 with `TRUSTED_SOURCES_ENVIRONMENT_MISMATCH`. CLI env run with Preview variables produces a local Development identity and was not used as Preview evidence. |
| Production Sofie, missing Factory application identity |Factory401 UNAUTHORIZED; live owner panel PASS |
| Production Sofie, invalid Factory application identity |Factory401 UNAUTHORIZED; live owner panel PASS |
| Production Sofie, valid application identity, unauthorized Work |Factory403 PRODUCTION_WORK_NOT_AUTHORIZED; live owner panel PASS |
| Production Sofie, valid bounded installation observation |Database, artifact storage and Sandbox service AVAILABLE; live owner panel PASS |

The first authorized production panel request failed closed. Inspection found the required explicit `VERCEL_ORG_ID` production setting missing in Factory. Vercel does not document it as an automatically supplied runtime variable. The exact existing team identifier was configured only for Factory production, read back, and canonical Factory `7e60ad2044b2805f5c7caad7dca4811fca777e33` was redeployed as `dpl_DbPHmA5U6GADjWYGsT5U5wQJCKnb`. No identity guard was weakened. Live retry passed all application/Work denials and bounded dependency checks. No diagnostic endpoint relaxation or credential logging was needed.

The owner-facing panel was independently reviewed, passed35 security cases and2,092 application cases/94 retained skips, typecheck/governance, CI and Preview. PR46 merged as MyEve canonical `0b6bb88a1dc41a0cdbfcd01db6b5d4f701dfb3c2`; production deployment `dpl_CKD6VDed4cd5FQUmrzqDtLp816a3` provides the panel in Manage → System. The POST remains owner-authenticated and same-origin; fixed destinations and request-scoped workload tokens remain server-side. Success explicitly leaves Work and publication disabled.

Historical Attempt8 Result/Proof rendering was observed read-only in production. The retained candidate, accounting and terminal writer remain visible; CI PASS does not override the later independent-review FAIL or Result PARTIAL. No historical Work was resumed or altered.

## Remaining gates

Production EvidenceProvider transport and new durable Proof ingestion, full deterministic production qualification, explicit production execution contract, protected verification policy and the bounded canary envelope remain unfinished. Existing Result rendering is not new production EvidenceProvider ingestion. Resource availability is not execution authority. Paid model calls and generated publication effects initiated by this validation:0. Other unobserved global counters are not asserted zero.

The explicit Preview-only qualification config runs a memory-only denial probe before a normal Preview build. Normal builds do not invoke it. It refuses local/Production/wrong identity scope and requires the exact provider403 code; seven tests and independent read-only review passed. The hosted probe at source `6206a9ddb587cb9c61b8ef2d6b22d11b56a9de3a`, deployment `dpl_2rn3DeE17iVBnek37Roit8aewzjk`, returned the exact required403 denial. The probe records no token or provider response body and sends no Factory application credential.

Receipts: [live evidence](evidence/production-live/). The earlier [rollout record](production-rollout.md) remains historical evidence.
