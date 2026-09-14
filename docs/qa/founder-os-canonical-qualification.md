# Founder OS canonical qualification

Date: 2026-09-13

## Provenance

- Frozen Role Catalog: `c330dd38b21347fa30acc022fb8c2268c8380647`
- Qualified Marketing Engineering Role Pack: `4b3a588e2b1c9711d72818e23de44eaf018bd524`
- Canonical branch: `codex/founder-os-canonical`
- Implementation diff base: `4b3a588e2b1c9711d72818e23de44eaf018bd524`
- Earlier Founder OS candidate compared: `64164b7`

`4b3a588` is a direct child of `c330dd38`. The canonical Founder OS commit is created directly on top of `4b3a588`; neither Founder implementation was blindly merged or cherry-picked.

## Reconciliation

Retained from `64164b7`: the generic built-in catalog, Role Pack membership and capability validation, and read-only `list_solution_packs` discovery tool. Superseded: its checkpoint-only model, smaller Founder definition, separate definition path, and minimal UI. The richer nine-domain implementation is canonical. Repository checks confirm one Solution Pack model, one built-in registry, one validator, one Eve discovery model, one Founder OS definition, unique Role IDs, and unique Solution Pack IDs.

## Automated qualification

| Gate | Result |
| --- | --- |
| Repository tests | Pass: 85 / 85 |
| Founder OS tests | Pass: 9 / 9 |
| Eve TypeScript | Pass |
| Builder TypeScript | Pass |
| Capability Registry | Pass: 72 definitions, 49 authored tools |
| Builder manifest | Pass: 71 prunable files claimed; template release 28 |
| Eve production build | Pass: 33 routes generated |
| Builder production build | Pass: 11 routes generated |
| Production dependency audit | Pass: 0 vulnerabilities (`npm audit --omit=dev --registry=https://registry.yarnpkg.com`) |
| `git diff --check` | Pass |

The default npm audit endpoint reset its connection on three attempts. The same npm audit was completed successfully through Yarn's npm-compatible registry.

## Browser qualification

| Viewport | Result |
| --- | --- |
| Desktop 1440 × 900 | Pass |
| Mobile 390 × 844 | Pass; document width 390px, no horizontal overflow |

Verified in a real Chromium session:

- Role Catalog renders;
- canonical Marketing Engineering pack and its eight roles render;
- Founder OS progressive-disclosure card renders all nine domains;
- `Use Founder OS` creates a new local chat with an unsent, constraint-first draft;
- `Create Founder Agent` opens the existing Agent form with the Founder / Chief of Staff defaults;
- responsive layout remains usable at both viewports;
- browser console contains no application errors.

## Scope audit

The diff against `4b3a588` contains no agent-run-attribution schema, headers, client context, database columns, API mutation, or task-run attribution changes. It also excludes Scoped Memory, Agent Computer, Knowledge integration, Agent Groups, handoffs, autonomous routing, and Builder pack enablement. The sole Builder change claims the read-only discovery tool in the existing manifest so generated deployments remain complete.

Relay and capability policy remain authoritative. Founder OS adds recommendations, expertise, workflows, and templates only.
