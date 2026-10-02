# Dedicated staging Factory OIDC transport

The owner approved `sofie-cloud-qualification` preview → `myfactory-cloud-staging` preview using Vercel Trusted Sources. The provider rule is configured for exactly that source project and environment; no static Factory bypass is created. Protection grants no application or Work authority.

The shared Factory adapter and signed Result channel now acquire request-scoped OIDC headers from `@vercel/oidc` 3.8.10. The helper checks hosted preview runtime, exact source project/team claims, expiry and the existing destination origin guard. These outbound checks are not signature verification: Vercel independently verifies the token and trust rule at ingress. Existing Factory application bearer authentication and Work/source/budget/fencing checks remain required. The token is never a connection-profile field, and there is no static or local fallback.

The qualification access endpoint returns only bounded status/name/pass evidence. The build scans browser bundles, prerender/HTML/hydration and public output for the build OIDC token and the other server credentials, including base64 encodings. A configured static Factory bypass fails the scan. Runtime token containment and connected access/revocation require separate hosted evidence; a build scan alone is not their PASS.

Validation at implementation checkpoint: 27 transport/access/OIDC tests and 178 canonical Result/writer/custody/spend regressions PASS; 4 client containment tests PASS; TypeScript no-emit check PASS. Hosted access/revocation and full cloud Work remain pending. Production admission/publication remain disabled; paid model calls remain zero.

Preserve the Factory custody incident checkpoint `0df0c37` and MyEve checkpoint `9522292`. No change is made to the Attempt-8 publisher.

Revocation: on the dedicated Factory project, Deployment Protection → Trusted Sources → the `sofie-cloud-qualification` row → Remove. Do not remove self-access or any unrelated rule. Repeat the same authenticated Sofie diagnostic; its Factory calls must now be blocked by deployment protection. Re-adding requires the exact approved preview→preview scope. Never generate a static Factory bypass as a workaround.

Sources: [Vercel Trusted Sources](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources), [OIDC reference](https://vercel.com/docs/oidc/reference), installed Eve auth/route protection and Next.js Route Handlers guides.
