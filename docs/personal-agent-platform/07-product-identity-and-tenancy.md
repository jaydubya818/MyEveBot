# Product identity and tenancy

## Non-negotiable decision

MyEve is multi-owner and multi-agent by design, while each deployment serves one owner by default. The single-owner deployment boundary is a launch simplification and security default, not a global singleton assumption.

The naming hierarchy is normative:

- **MyEve** — the downloadable and deployable personal-agent platform.
- **Sofie** — the reference/default personal-agent instance, not a hard-coded platform identity.
- **Relay** — the shared governed capability layer for one or more authorized personal agents.

```text
MyEve
├── Personal Agent Platform
│   ├── Sofie (reference/default agent)
│   ├── User-created primary agent
│   ├── Specialists
│   └── Additional agents
├── Goal OS
│   ├── Goals
│   ├── Tasks
│   ├── Outcomes
│   └── Governed Learning
└── Relay
    ├── Owner identity
    ├── Agent identities
    ├── Connected accounts
    ├── Capabilities and permissions
    ├── Memory and files
    ├── Communications and computer
    └── Audit
```

## Deployment and tenancy invariant

- One MyEve deployment has one default owner authentication boundary in V1.
- The platform may have many independently owned deployments.
- Owner-facing durable records are partitioned by stable `owner_id`; names are display data and never authorization keys.
- Sofie is the local reference configuration. Builder-created deployments may use any agent and owner names.
- No table, route, capability ID, policy, or authorization rule may depend on the literal names `Jay` or `Sofie`.
- Legacy `SOFIE_*` environment variables and the `sofie_session` cookie are compatibility aliases only. New deployments use `MYEVE_*` names and the `myeve_session` cookie.

## Identity model

Keep four concepts separate:

1. **Owner identity** — the human authority and data partition.
2. **Agent identity** — a persistent named actor owned by an owner.
3. **Specialist identity** — a bounded agent identity with narrower instructions, context, budget, and capabilities.
4. **External account identity** — a provider account connected through Relay.

A future principal reference should use stable opaque identifiers:

```ts
type PrincipalType = "owner" | "agent" | "specialist" | "system";

interface PrincipalRef {
  ownerId: string;
  principalType: PrincipalType;
  principalId: string;
}
```

Display names do not belong in foreign keys. The current Goal OS `assigned_to` value is an opaque future principal key, not a unique human or agent name. When persisted agent identities ship, migrate it to a validated principal reference rather than creating separate Sofie-specific columns.

## Relay boundary

Relay remains an internal module boundary for now. Do not create a Relay SaaS product, separate deployment, service, database, or duplicated authentication system.

Relay answers:

- What capability exists and is healthy?
- Which owner-connected account backs it?
- Which principal has an explicit grant?
- What operation, risk, approval, cost, and evidence rules apply?
- What happened, under whose authority, and with what result?

The personal agent decides what should be done. Relay determines whether and how an authorized principal may do it.

Availability is not authorization. A capability can be installed and healthy while still unavailable to a particular agent. Current V1 deployment-level feature inclusion is the default primary-agent grant; later Relay grants must narrow access by `owner_id`, `principal_type`, `principal_id`, capability, account, operation, and policy.

Example future topology:

```text
Relay (one owner)
├── Ava   — primary  — broad approved access
├── Atlas — research — web, files, scoped memory
└── Nova  — engineer — GitHub, files, isolated sandbox
```

All agents share the same canonical execution vocabulary where authorized:

`Goal → Plan → Task → Assignment → Run → Action → Evidence → Outcome`

Do not create a second execution system for specialists or additional agents.

## Schema invariants

- Every owner-visible durable row is owner-scoped directly or through an owner-scoped parent.
- Cross-owner reads and writes fail closed even when an opaque record ID is known.
- Agent attribution is optional in V1 but must be additive later; ownership must never be inferred from agent identity.
- Goals belong to an owner and may eventually involve several agents. Do not put a unique primary-agent constraint on Goals.
- Tasks and runs may be assigned to agent principals; events and audit records should capture initiator and executor separately when that layer ships.
- Connected providers must support more than one account per provider in the eventual Relay model.
- Capability definitions are global metadata. Availability, grants, account bindings, policies, and approvals are owner/principal scoped.

## Builder contract

MyEve Builder is strategically part of the product. A new owner must be able to:

1. Name the primary agent.
2. Set owner identity, personality, and instructions.
3. Select capabilities and channels.
4. Configure Relay-backed connections and approval policies as those surfaces ship.
5. Connect database, memory, and storage.
6. Deploy to infrastructure they control.
7. Update without losing identity, environment, storage, URL, or feature state.

The current builder already implements agent/owner naming, personality/instructions, capability selection, channels, storage, and Vercel deployment. Relay account grants, policy configuration, and adding additional agents are staged work; their absence must not be hidden behind placeholder UI.

## Agent-native checks

- **Parity:** every owner UI outcome remains achievable by an authorized agent tool.
- **Granularity:** Goal, capability, and execution tools stay composable; permissions are enforced below prompts.
- **Shared state:** user and agents read and mutate the same owner-scoped repositories.
- **Immediate visibility:** agent mutations emit events and appear in Goals/Activity without a separate agent-only store.
- **Explicit completion:** runs and consequential actions use durable completion/verification state.
- **Context:** prompts receive configured identity and discover capabilities dynamically.
- **Governed improvement:** learning produces reviewable proposals; it does not silently rewrite active agent behavior.

## Explicitly not in Goal OS V1

- Multi-owner access inside one deployment.
- A separate Relay service or deployment.
- Full agent CRUD, agent groups, or a marketplace.
- General multi-agent orchestration.
- Principal/account grant tables before a real second-agent flow is designed.

These are deferred implementations, not deferred architectural constraints.
