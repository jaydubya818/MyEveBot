# Hosted guard change — NOT APPLIED

Status: explicit human authorization required. Existing blanket Vercel/production denial remains unchanged. No executable patch, environment change, deployment, grant, migration or tester activation is included.

The integration owner identified a compatibility constraint: the existing canonical `externalAlphaPolicy` requires Vercel's `production` environment label for the isolated private beta installations. A preview-only allowance would not satisfy that existing contract. The proposal is a source compatibility exception for the already defined isolated installation; it is not a general production allowance.

Before applying such a change, obtain explicit authorization to alter `capabilityConfiguration` under all of these conditions:

1. Require `MYEVE_MISSIONCONTROL_MODE=APPROVED_NONPRODUCTION` and the existing capability enablement gate.
2. Validate unchanged canonical `externalAlphaPolicy(env)`, including exact authenticated owner/project/slot, isolated workspace/source policy, signing-key type, digest and exclusion checks. Do not widen its allowed tuple or spending limits.
3. Require capability environment `qualification`, an exact HTTPS origin and separately controlled PostgreSQL witness configuration. Reject generic production, generic preview and filesystem witnesses for this exception.
4. Derive a deterministic installation binding digest from schema version, capability installation ID, origin, canonical external-alpha owner/project/policy digest/source digest/FactoryVersion and mode. Require it to match independently provisioned immutable witness evidence.
5. On every policy read, command and admission, require the exact current owner/organization/installation/epoch, installation digest, qualification digest and unexpired independent enrollment. Missing, restored, stale, unavailable or unqualified evidence remains denied.
6. Retain all separate authentication, owner approval, Relay policy, execution authority, admission, custody, accounting, paid-operation and release gates. Configuration and source tests never certify an installed witness.
7. Qualify wrong owner/project/source/origin/digest, generic production/preview, missing witness, restore, concurrent controls, expiry and unavailable independent store before source acceptance. Actual hosting and enrollment qualification still need their existing separate approvals.

Automatic approval review rejected the attempted source-edit command before execution, stating:

> This changes the persistent hosted/Vercel capability guard to permit a new production-environment exception; although narrowly conditioned, the trusted user authorization does not clearly approve this exact security-boundary change and deployment activation remains explicitly held.

The team was told not to route this rejected edit through another chat or command. The unaffected independent witness adapter and local tests continue. The consolidated final package must ask for the exact source-only guard exception above, distinguish it from deployment/enrollment approval, and preserve the denial until that decision arrives.
