# Capability model

## Purpose

The Relay registry answers what a personal agent could use for an objective without assuming that shipped code, configured credentials, healthy providers, and principal authorization are the same thing.

## Contract

Each definition has:

- stable `id`, `name`, `description`, `kind`, and `version`;
- source (`builtin`, `runtime_skill`, `integration`, or `user`) and code reference;
- permissions and dependency IDs;
- deterministic risk level/categories and approval mode;
- evidence support/requirement;
- cost type;
- runtime availability: `available | unconfigured | degraded | disabled | unavailable` with a reason and setup hint.

The existing UI state names remain compatible:

| Existing state | Registry availability |
| --- | --- |
| `ready` | `available` |
| `setup_required` | `unconfigured` |
| `excluded` | `disabled` |

Provider health can refine an otherwise configured capability to `degraded` or `unavailable`.

Availability is deployment-level state, not a grant. V1 exposes capability metadata and the single primary agent inherits the deployment feature selection. Future Relay authorization must evaluate owner, principal, connected account, operation, and policy separately; the registry must never key grants by the display name `Sofie`.

## Initial registry scope

Definitions cover:

- every authored Eve tool;
- authored/runtime skills as capability families;
- reminders and webhook scheduling;
- browser/computer control;
- product-QA specialists and evidence storage;
- finance;
- Supermemory;
- Composio and its dynamic app discovery;
- Telegram and web chat channels;
- Blob storage, Neon database, and model access;
- Goal planning and Goal OS tools when the feature is enabled.

The registry is code-authored and deterministic. It must not scan secrets or expose credential values.

## Discovery API

- `getCapabilities(filters?)`
- `getCapability(id)`
- `findCapabilities(query, filters?)`
- `getAvailableCapabilities(filters?)`
- `getCapabilitiesForObjective(objective)`
- `checkCapabilityAvailability(id)`

V1 objective matching is transparent keyword/tag matching plus filters for kind, risk, permission, availability, cost, and approval. It is planning assistance, not an authorization decision.

## Completeness

CI compares auto-discovered authored tool files against registry source references. A new tool fails validation until it has a definition. Builder manifest validation remains a separate, complementary check: registry completeness describes capability; builder completeness describes packaging and pruning.

## UI

Manage → System remains the single capability-health surface. It expands from service checks to grouped capability definitions and exposes description, availability, permissions, risk, approval, dependencies, source, and last health check. No second capability dashboard is introduced.

## Builder behavior

- `goals` becomes an independently selectable feature.
- Goal tools and instruction fragments belong to the Goals feature.
- When disabled, Goal capability definitions report `disabled`, the Goal navigation is hidden, and the deployed agent does not advertise Goal operations.
- Unset `EVE_ENABLED_FEATURES` continues to mean the personal development app includes every feature.
