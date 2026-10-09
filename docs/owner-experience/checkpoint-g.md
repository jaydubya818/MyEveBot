# MYEVE OWNER EXPERIENCE / ALPHA UX

Checkpoint: G — responsive, keyboard and visual qualification.

Status: PARTIAL overall. Canonical base SHA: `8338309582d6806829dec1ae1beef301d6b52425`. Branch: `codex/myeve-owner-experience`. Candidate is the commit containing this report, checked against the remote after push.

The file Preview/Edit tabs now expose a related panel, selected state and one keyboard tab stop, with Arrow, Home and End navigation. File scope is a group of toggle buttons. Save revision uses the owner theme. Session verification times out and presents an explicit recovery action without mounting private content. Saved decision dates have semantic time elements on their own line.

Visual coverage adds populated Today, Work list, paused/working/verifying/verified/unconfirmed/failed Work, open Proof, inline Sofie Work, active decisions/history, Files and file preview at 1440px and 390px. Dark Today, Sofie and Settings are covered at both widths. Clean shell layout and axe checks also cover 1024px and 768px. Tests wait for the actual composer and settled metadata/content.

Exact screenshot comparisons run on macOS Chrome. Hosted Linux captures are retained for review; they do not compare against the macOS images. Only immutable server-created decision dates are masked in comparison images; the unmasked captures retain the actual dates. Fixture rows are not rewritten to defeat the immutable response guard. Other synthetic presentation dates and the browser clock are deterministic.

| Area | Verdict and scope |
| --- | --- |
| Unified shell / alpha navigation / feature-policy UI | PASS in exercised alpha routes |
| Today / Files / Settings | PASS in exercised clean, populated and appearance states |
| Sofie / Work | PARTIAL; presentation covered, composed journey pending |
| Needs You | PASS in retained E scope and added visual states |
| Clean-owner isolation | PASS in retained synthetic cross-owner browser/API cases |
| Historical-data filtering | PARTIAL; original screenshot deployment provenance still required |
| Desktop / 390px | PASS for reviewed light/dark captures; comparison results recorded below |
| Accessibility | No critical/serious axe findings in tested states; keyboard menus, commands, appearance and file tabs exercised |
| Visual regression | Expanded exact local comparisons; separate Linux capture limitation above |
| Route/API authority regression | Retained denial/isolation suite; no authority expansion |
| PostgreSQL | Real decisions/history, Work reads, Files upload/discovery and owner isolation |
| Fresh-clone suites | Final candidate pending |
| Hosted CI | F exact `91b66dc1402629c83e67e6f501eeb55a62002c30` passed run 37958217756; G pending push |
| Independent product review | Reviewed source and populated light/dark desktop/mobile captures; final run recorded below |
| Public disclosure review | Synthetic data only; no credentials or real tester records in captures |

During qualification, a mobile navigation intermittently remained before shell hydration with an `Invalid or unexpected token` browser error. Retained response scripts parsed successfully; 15 diagnostic Settings/Sofie navigations did not reproduce it. No definitive cause is claimed. The subsequent targeted six-scenario run passed. Earlier failures also exposed a route-announcer locator collision and unchecked synthetic artifact cleanup; assertions now distinguish the application alert and require cleanup success. Final full comparison run: 25/25 passed without baseline updates (2.6 minutes). TypeScript passed; all 249 focused contracts passed. The independent reviewer accepted the limited G scope after inspecting the final mobile dark Settings capture. A preceding full run had a stale expired-status test assertion and a transient Files connection failure; both are retained in the qualification log, and the final run was clean.

No migrations, execution authority, lifecycle, FactoryVersion, Relay, accounting or publication changes in G. Paid model operations: 0. Production deployments: 0. Tester mutations: 0. Executable tester grants: 0. Publication effects: 0. External-alpha changes applied: 0.

Remaining blockers: composed deterministic journey, final fresh checkout/hosted CI, original historical-data provenance and release-impact package. Next checkpoint: H automatically.
