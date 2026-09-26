# Managed MyEve beta

## Product contract

One private invitation takes a tester through Relay account creation and an Eve that MyEve provisions for them. The tester supplies a name and sets their own Eve access password. They do not need a Vercel account, Vercel token, signing-key fingerprint, or MyFactory installation. BYO Vercel remains an advanced Builder path.

Every managed Eve has a distinct Vercel project, Neon database, application credentials, deployment history, and Relay agent identity. Relay and MyFactory remain shared services; neither gets blanket access to a tester's Eve. The owner must explicitly grant peer and memory access. A managed project is never reused for a different tester.

## Control plane

The Builder hosts a small operator control plane with a separate database and an operator-only API. Records are durable: invitation, email, single-use token hash, environment ID, project and storage IDs, deployment ID, current template release, state, timestamps, and an append-only event log. No access passwords, Vercel tokens, Relay credentials, or database URLs are stored in these records.

The operator can issue and revoke email-bound invitations, inspect health and release status, provision one isolated project, upgrade from the current Builder template without replacing secrets, set an admission budget, pause an Eve, request owner export, and retire an environment after export and explicit confirmation. Provisioning and deletion are idempotent and log every state transition. A failed operation remains visible with its stage and can be retried safely.

The private invitation is the only link sent to a tester. It identifies the tester's account, then presents Eve setup and live readiness checks. The Relay signup token stays inside the invited flow and is not copied into agent chat or public URLs. The operator pins Relay's production signing key before any Eve is paired. A failed key check stops provisioning before project mutation.

## Budget and export

First beta admission is limited by a configured maximum active tester count. Issuing an invitation is the operator decision for one Eve. Before deploying, the control plane creates and verifies a monthly AI Gateway budget on that Eve's Vercel project. The managed profile uses the project's OIDC identity for model calls and receives no AI Gateway API key or provider BYOK key. Vercel describes the budget as a soft cap for the request that crosses it. Team spend management supplies the infrastructure backstop. The control plane shows the configured ceiling and latest observed model spend; it must fail closed if a project budget cannot be confirmed.

Eve already provides an owner-authenticated archive download under Manage → Your data. That archive records partial coverage for binary files. Until file contents are included, the managed beta must keep binary-producing features off or clearly show the export limitation before enabling them. Project deletion requires a recent verified owner export and a separate explicit operator confirmation. Removing a Vercel project does not automatically prove that a separate Neon resource was erased; its lifecycle must be tracked and verified independently.

## Release gates

1. A local disposable control-plane database passes invite replay, wrong-email, concurrent provisioning, isolation, upgrade, and deletion tests.
2. A live managed test Eve is provisioned in a dedicated project and database, then monitored, upgraded without credential rotation, exported, and retired.
3. Relay's beta-invite migration and current deployment are live. The approved key fingerprint is pinned by the operator; the tester never types it.
4. A real tester completes one-link onboarding and a model-written Eve/Sofie exchange with an explicitly approved memory share and a denied unauthorized share.

No invitation is sent until all four gates pass.
