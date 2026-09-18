# Owner data restore contract

This document defines how a future restore must interpret Owner Data Center archives. It is a contract for Work Order 019, not a restore implementation.

## Canonical state

A restore must recreate records in their canonical repository. It must not flatten Memory and Knowledge into one generic store or infer a new canonical type from display text.

For every supported record, restore must preserve:

- canonical repository and type;
- owner reassignment to the authenticated target owner;
- Memory scope type and the mapped target scope identifier;
- status, confidence, and lifecycle timestamps;
- provenance and source references that are present in the archive;
- supersession links and Knowledge relationships after identifier mapping;
- related Agent, Goal, Project, and Task references when their dependencies can be mapped.

Unknown provenance stays unknown. A restore must not manufacture a source or silently broaden access when a scope dependency is missing.

## V1 empty-deployment interpretation

V1 restore targets an empty deployment. The archive is interpreted as a snapshot of canonical state at export time, subject to schema validation and target-owner reassignment.

The dry-run plan must resolve dependencies before applying records. Missing or incompatible dependencies must be reported before confirmation. Restored schedules, webhooks, connector credentials, and other side-effecting integrations remain disabled until the owner explicitly reconnects or enables them.

Knowledge supersession and relationships are restored only after their referenced records exist. Provider-backed Memory is recreated through the configured provider and linked to new provider identifiers; an archived provider identifier is evidence, not a portable identity.

## Forgotten and deleted information

An archive contains only the state that was exportable when it was created. A current export excludes canonically deleted Memory and physically deleted Knowledge.

Future merge restore must not allow an older archive to resurrect information that was forgotten after that archive was created. Merge planning therefore requires durable deletion/tombstone reconciliation before any record is reactivated. Until that contract is implemented and qualified, merge restore remains disabled.

Audit entries and superseded Knowledge may be retained as inert history. They must remain visibly distinct from active information and must not become eligible for Agent context solely because they were restored.

## Verification requirements

After apply, restore verification must prove:

- canonical record counts and identifiers match the confirmed plan;
- types, scopes, status, confidence, provenance, supersession, and relationships survived mapping;
- no inaccessible scope was broadened;
- no forgotten/deleted active information was recreated;
- provider-backed Memory was recreated and is retrievable only through its authorized scope;
- disabled integrations and schedules did not execute during restore.
