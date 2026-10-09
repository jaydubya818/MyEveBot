# Protected hosted federation ingress candidate

Optional server-only `MYEVE_RELAY_INGRESS_SECRETS` maps exact HTTPS origins to operator-supplied Vercel automation bypass secrets. No secret values belong in source, public environment variables, evidence or logs. Absent configuration preserves the existing transport.

The client adds `x-vercel-protection-bypass` only to its configured Relay origin, including owner login. Artifact retrieval adds it only after existing local trusted-peer/source/audience checks. Both retain redirect refusal, request deadlines and existing application authentication. Configured ingress access cannot authorize an untrusted artifact origin. Invalid configuration fails closed with a generic error.

The header passes Vercel deployment protection; it does not replace owner authentication, Agent bearer authentication, signed delivery verification or recipient artifact proofs. A bypass secret is a project protection credential; exact-origin mapping limits its transmission but does not reduce its Vercel scope. Operators must approve its blast radius and restrict access. No project protection policy or hosted setting was changed by this candidate.

Use separate isolated branch configuration for each MyEve installation. Never inherit the personal owner's database, connector tokens, sessions or encryption material. Set the opt-in only on the synthetic installation; default federation remains disabled.

Qualification: 14 focused ingress cases; full 496-test Vitest suite; 130 Node tests; both workspace typechecks/builds; executor governance 503 sources, zero unknown; fresh/upgrade migration and authority integration checks. These are local regression results, not a hosted gate. Hosted ingress smoke remains blocked until isolated databases, custody and deployment authorization are ready.
