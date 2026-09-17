---
status: ready
priority: p0
issue_id: "010"
tags: [browser, computer, reliability, readiness]
dependencies: ["008"]
---

# Make isolated browser work reliable on first use

## Problem Statement

Browser tools were hidden until a Computer session already existed, so a normal “browse this site” request could be described as disabled instead of provisioning the required isolated runtime.

## Findings

- Browser capability policy and Computer lifecycle were individually correct but formed a circular activation dependency.
- Readiness reported only database configuration and did not distinguish available-on-demand from inactive.
- Browser failures were collapsed into generic action failures.

## Proposed Solutions

Expose allowed browser tools before activation, provision the isolated session on the first browser action, derive the target hostname under a deny-by-default firewall, and preserve explicit failure categories.

## Recommended Action

Ship the lazy provisioning path and verify its source contract, domain policy, failure classification, and System status copy.

## Technical Details

- Dynamic capability policy exposes permitted browser tools without requiring a pre-existing session.
- The action hook provisions and attributes the session before execution.
- Navigation adds only the exact target and common bare/`www` redirect hostnames.
- Readiness calls an inactive browser “available on demand.”

## Acceptance Criteria

- [x] A first browser navigation provisions an isolated Computer session automatically.
- [x] Inactive browser access is not described as disabled.
- [x] Web search, fetch, ephemeral browser, persistent desktop, and local computer are distinguished.
- [x] Provisioning, authentication, network policy, timeout, and unavailable failures retain distinct codes.
- [x] System status includes browser health.
- [x] A browser-research lifecycle contract requires navigation, reading, cited output, and session stop.
- [ ] The exact flow passes against the deployed production revision: request browser research → provision → navigate → read → cite → stop.

## Work Log

### 2026-09-17 - Implemented

**By:** Codex

**Actions:** Removed the circular activation gate, added lazy provisioning and hostname derivation, expanded runtime instructions, added browser readiness, and added contract/unit coverage.

**Learnings:** A capability can be configured and ready while no runtime session is active; product copy and policy must represent those as different states.

## Notes

- Ephemeral browser sessions do not retain authenticated profiles.
- The network policy remains deny-by-default and private address ranges remain blocked.
- Keep this work order open until the production browser canary passes on the deployed revision.
