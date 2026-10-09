# Callable Federation integration

## Cause and boundary

The canonical engine uses Eve's filesystem tool compiler. `agent/agent.ts` selects the Gateway model; tools come from `agent/tools/*.ts`, then Eve dispatches dynamic resolvers, serializes their schemas and builds the callable tool set before each model step. Registry discovery alone does not create a callable tool.

`federation.request` was a platform descriptor with no authored tool, no runtime adapter and no model-tool serialization. This was not a Role/Skill expansion failure, executor inventory filter or a disabled local Federation flag. The existing owner Federation API remained callable and qualified independently.

`agent/tools/federation_request.ts` now resolves one model tool, named `federation_request` by Eve's filename convention, for the existing `federation.request` capability. The registry keeps that capability ID and links it to the authored source. Builder includes the resolver; the resolver emits nothing unless the exact Federation flag, configured origin, verified owner session, active Agent capability and matching local Relay identity are available. The generic persistent-Agent policy excludes this single resolver to prevent duplicate dynamic names; the Federation resolver and Action Gateway independently enforce its capability. It does not enable Role, child, scheduled or external-Agent authority.

The tool offers discovery, canonical submission and status retrieval. Submission reuses `submissionSchema` unchanged and calls `sendExternal`; status calls `getExternalResult`. Discovery calls the existing authenticated Relay client. All three cross Action Gateway and its one-use adapter/provider handles. There is no owner-admin tool, grant mutation, direct peer request, alternate transport or protocol change. Consequential submission classes retain exact-action approval requirements. Agent-bound outgoing ownership is checked before status retrieval. Results remain in canonical encrypted Federation storage; Action receipts contain operation/status/request IDs only. A replay returns receipt metadata and requires a fresh authorized status call, never cached peer content.

Source defaults remain disabled, including the literal string `false`. Production flags are unchanged. Shared view references are not public discovery: an owner must supply the resource reference for a SHARED view. The live qualification supplies only the existing target/publication reference, never the expected answer or private marker.

## Verification

The regression runs Eve's installed dynamic lifecycle and actual model-tool assembly, verifying the callable name and serialized canonical schema, then verifying removal when disabled. Tool tests use the real Action Gateway and canonical inbox functions with isolated database/transport fixtures. Existing Federation tests cover publication/private boundaries, grants, revocation, V2 signatures and tamper denial. Live qualification remains a separate gate; unit success does not qualify the model journey.

No database migration, Relay source change, Production deployment, KMS operation or historical full deterministic E2E rerun is part of this change.

Source qualification completed: 123 targeted Vitest cases; 19 Agent/registry/Builder Node tests; Eve and Builder TypeScript; registry 135 definitions / 100 authored tools; skill routing 93 checks; Builder manifest 147 claimed files; executor inventory 547 sources / UNKNOWN=0; both production builds; diff whitespace and changed-file credential-pattern scan. Main and this qualification branch have deployment disabled in the existing Vercel git guard.
