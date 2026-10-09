# Marketing Engineering Role Pack qualification

Date: 2026-09-13

Base commit: `c330dd38b21347fa30acc022fb8c2268c8380647`

Branch: `codex/marketing-engineering-role-pack`

## Qualified scope

- Added the built-in Marketing Engineering Role Pack with the local lifecycle Direction → Research → Create → Build → Verify → Launch → Measure → Optimize.
- Reused the canonical Researcher, Writer, Analyst, and Scheduler RoleDefinitions by reference.
- Added four marketing-specific, on-demand RoleDefinitions: Marketing strategist, Marketing engineer, Lifecycle marketing engineer, and Marketing QA & compliance reviewer.
- Kept Role recommendations advisory. No capability grants, policy bypasses, credentials, memory, conversations, or private state were added.
- Kept the existing three declared product-QA specialists fixed and unchanged. Marketing QA & compliance review is an on-demand Role, not a new declared specialist or QA runtime.
- Reused the existing catalog UI, `list_roles` tool, delegation instructions, optional create-from-Role flow, and canonical Run/Evidence/Outcome infrastructure without schema or executor changes.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | Pass: 76 tests |
| `node_modules/.bin/tsc -p apps/eve/tsconfig.json` | Pass |
| `node --experimental-strip-types apps/eve/scripts/check-capability-registry.ts` | Pass: 71 definitions, 48 authored tools |
| `../../node_modules/.bin/next build --webpack` from `apps/eve` | Pass: production build, TypeScript, and 33 static/dynamic routes |
| `git diff --check` | Pass |

The default Turbopack build could not complete in the qualification sandbox because its PostCSS worker attempted to bind a local port and received `EPERM`. The same production application compiled and prerendered successfully with Next.js's supported webpack build path. The combined `npm run typecheck --workspace=eve-agent` command encountered the same sandbox class of failure when `tsx` attempted to create its IPC socket; its two constituent checks passed independently.

## Deliberately not included

- Autonomous routing or executor selection
- Agent Groups or handoffs
- Scoped Memory, Agent Computer, or Knowledge integration
- New marketing-provider connections, credentials, or external actions
- Database migrations, deployment, or a separate Role Run model

## Remaining runtime limitations

The pack describes reusable expertise and safe defaults. It does not prove availability or authorization for a recommended capability in a specific deployment. Live campaign publication, sends, audience changes, tracking changes, automations, and spend still depend on the persistent Agent or Run capability policy, configured connections, approval requirements, and owner authorization.
