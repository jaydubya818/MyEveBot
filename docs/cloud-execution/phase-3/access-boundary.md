# Dedicated staging service access

Jay approved the dedicated MyFactory staging deployment-protection bypass on
2026-10-02. It is stored only in sensitive preview server configuration of
`sofie-cloud-qualification` (`prj_XU7fJW735PtsnKoAYtGfzdnsotIB`). The bypass is
not an application identity and is not injected into Factory deployments.

The server-only `/api/cloud-qualification/access` operator diagnostic uses the
canonical Factory transport against one reviewed staging origin. It accepts no
caller URL, payload, or Work command. It checks provider protection, missing and
invalid application identity, authorized action discovery, and denied source
authority. It returns only fixed status assertions; never response bodies,
headers, configuration, or credentials. Until the deterministic model boundary
is qualified, every other route in this isolated project is denied.

The build scans all browser static files and public variables for server
credentials before upload. It fails closed if credentials or static artifacts
are missing. This does not itself qualify worker/verifier execution.

Hosted boundary status: NOT_RUN. Mac-off/P0 and cloud harness: NOT_RUN.
Production cloud admission and publication remain disabled; paid calls: 0.

Revocation: revoke the exact named `Sofie isolated staging contract qualification`
entry in MyFactory staging Deployment Protection, delete the Sofie sensitive
preview variable `FACTORY_STAGING_PROTECTION_BYPASS`, redeploy Sofie preview, and
verify provider protection blocks the prior path. Keep other operator bypasses
and Factory application grants separate.

The hosted build passed its secret scan over 77 browser static files. The five
access cases remain NOT_RUN because Vercel Authentication blocks the operator
from invoking Sofie's probe. This Sofie project has zero bypass entries. No
additional bypass was created: the approved bypass scope was Factory only.
A separate operator-only Sofie ingress grant or normal authenticated Vercel
access is required. The isolated Eve model resolver also fails closed before
real provider selection, independently of Next middleware.

Validation: 2,008 PASS, 94 environment skips; typecheck, capability registry,
skill routing and 749-source executor governance PASS. These are deterministic
checks and do not qualify cloud Work, the harness, verifier, Mac-off, or P0.
