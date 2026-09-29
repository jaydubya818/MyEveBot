# Shared schema proposals — unallocated

No migration or authority change is implemented here.

## Shared business and rooms

Canonical owner must specify a business membership record binding business id, authenticated owner id, role, state and revision. Resource references must carry an explicit audience, resource kind/id and immutable revision where appropriate. Revocation must invalidate access and pending writes server-side. Private owner memory remains separate and is never selected merely because a business membership exists.

Room membership, Goal/Result audiences and artifact sharing should reference that one shared scope rather than introduce separate authorization stores. Room events need source identity, correlation, deduplication and exact actor authority; received text is untrusted context.

Approval ownership and any Work-scoped grants require canonical owner + Work + capability + resource + effect + expiry + version/generation bindings. A second owner’s membership must not silently permit approving another owner’s private action.

## Artifact-to-Work linkage

Current artifacts expose origin conversation/session and immutable revisions. A canonical relation should bind artifact id/revision to Work id/generation and optional Result id. The UI currently shows only available provenance; it does not infer this relation from conversation identity.

## No client substitutes

Do not put membership, authority, shared scope, owner identity or verification status in local storage as an alternative. The product source remains usable over existing private-instance contracts while these proposals are resolved by their owners.
