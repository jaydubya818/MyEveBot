# Solution Packs

## Product model

A Solution Pack is a curated operating layer for a concrete outcome. It composes references to existing Role Packs and platform capabilities; it is not a new executor, authority model, or stateful identity.

```text
Solution Pack
  ├─ selected Roles from reusable Role Packs
  ├─ recommended platform capabilities
  ├─ human-readable checkpoints
  └─ explicit guardrails

Owner-approved task
  ↓
Primary Agent
  ↓
Role or separately created persistent Agent
  ↓
existing Run → Evidence → Outcome
```

Viewing a Solution Pack has no side effects. It creates no persistent Agent, task, schedule, run, or capability grant. Recommended capabilities remain configuration guidance; actual access is determined by the existing capability registry, availability checks, risk ceiling, and approval policy.

## Founder OS V1

Founder OS helps a founder keep a small set of company priorities explicit and reviewable. It composes the existing Product manager, Researcher, Analyst, Writer, and Scheduler roles with the Goal operating system and optional approved review-delivery and scheduling capabilities.

The operating rhythm is deliberately small:

- Daily focus surfaces the highest-priority unblocked work for a founder decision.
- Weekly review examines evidence, outcomes, stalled work, and upcoming risks.
- Approved follow-through prepares reminders only for commitments the owner has approved.

Founder OS does not activate these routines. It explains the recommended composition so the owner and primary Agent can use existing primitives deliberately.

## Boundaries

- Roles remain stateless reusable expertise. They gain no mailbox, memory, credentials, conversation, or execution authority.
- Persistent Agents remain separate owner-scoped identities and are created through the existing editable flow, one at a time.
- The pack does not choose or route executors, coordinate Agent Groups, or hand work between identities.
- The pack adds no scoped memory, Agent Computer, Knowledge integration, marketplace distribution, or deployment behavior.
- Strategy, product, spending, publishing, scheduling, and external actions remain owner decisions subject to existing approval controls.

## Implementation shape

The generic `SolutionPack` model stores stable references rather than copies of Role definitions or capability configuration. Catalog construction rejects unknown Role Packs, Roles outside the referenced pack, duplicate selections, duplicate Solution Pack IDs, and unknown capabilities. The built-in Founder OS content lives separately from the generic primitive so the abstraction stays product-agnostic.
