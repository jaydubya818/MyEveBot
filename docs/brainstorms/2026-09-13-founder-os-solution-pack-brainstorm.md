---
date: 2026-09-13
topic: founder-os-solution-pack
---

# Founder OS Solution Pack

## What we're building

A read-only, built-in Founder OS composition that shows founders which existing Roles and platform primitives support a simple daily/weekly operating cadence. The pack is discoverable in Manage → Agents and through a read-only agent tool.

## Why this approach

A static validated catalog is the smallest useful V1. Persisted installation or one-click activation would introduce lifecycle, authority, failure recovery, and partial-setup questions that are premature for this slice. Keeping role references and capability recommendations declarative preserves the frozen Role Catalog model.

## Key decisions

- A Solution Pack references existing Role Pack entries; it does not duplicate or specialize Role definitions.
- Recommendations have no side effects and grant no capabilities.
- Founder OS uses existing goals, review delivery, and scheduling primitives; the latter two remain optional and approval-bound.
- Persistent Agents are still created individually through the existing editable flow.
- The first version has no autonomous execution or distribution lifecycle.

## Open questions

- A future explicit phase may define owner-scoped installation state and guided setup after partial-failure and rollback semantics are designed.

## Next steps

Implement and qualify the bounded catalog, discovery tool, and management UI.
