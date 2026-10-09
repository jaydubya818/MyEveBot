# MYEVE OWNER EXPERIENCE / ALPHA UX

Checkpoint: F — Files, configuration and policy-aware discovery.

Status: PARTIAL overall; implemented F scope passed. Canonical base SHA: `8338309582d6806829dec1ae1beef301d6b52425`. Branch: `codex/myeve-owner-experience`. Candidate is the commit containing this report, verified against the remote after push.

Files combines uploaded conversation files and generated documents with recent ordering, search, source filters, download and source-conversation links. Upload reuses the existing private Blob authorization/registration flow, extracted into a shared helper for its two consumers. File detail removes the redundant library and keeps preview, editing, revisions and comments. Alpha no longer fetches or offers artifact sharing; server denial is unchanged. `/files` redirects to the canonical Files destination.

Global search now uses canonical Work, files and conversations in alpha. Disabled knowledge, goals/results and specialist sources are not fetched or shown there. The command palette can carry a query into Work/Files search. Work title matching is an additive, parameterized query under the existing owner/personal predicate. Full-product search retains its Knowledge truncation notice. Settings and Privacy retain the qualified appearance/session boundaries; no disabled connection/setup surfaces were added.

| Area | Verdict and scope |
| --- | --- |
| Unified shell / alpha navigation | PASS across tested Files/detail/search and prior routes |
| Feature-policy UI | PASS in affected Files/search scope; broader final gate pending |
| Today | PASS in retained clean/populated fixtures |
| Sofie / Work | PARTIAL; composed durable journey pending |
| Needs You | PASS in retained E scope |
| Files | PASS for tested uploads, generated-document fixture attribution, discovery, preview, download, recovery and denial |
| Settings | PASS in existing appearance/navigation qualification |
| Clean-owner isolation | PASS for tested owner paths, including artifact fail-closed boundary |
| Historical-data filtering | PARTIAL; original deployment provenance remains unresolved |
| Desktop / 390px | PASS for clean/populated Files and simplified preview |
| Accessibility | PASS; no critical/serious axe findings in affected tested states |
| Visual regression | PASS; updated only clean Files desktop/mobile baselines, then compared in full run; rich captures reviewed independently |
| Route/API authority regression | PASS in affected focused checks; no authority expansion |
| PostgreSQL qualification | Real browser document upload/registration/content, conversation file registration, cross-owner denial, canonical Work title search |
| Fresh-clone suites | Final candidate pending |
| Hosted CI | E exact `99d817bcefba0b8eb734dbde118a81b7a27563cf` passed run 37956796669; F pending push |
| Independent product review | PASS for F scope after removing redundant preview UI and restoring full-product truncation note |
| Public disclosure review | PASS; synthetic data only |

Validation: TypeScript passed; 133 focused artifact/file/owner/policy tests passed; final browser suite 22/22 passed with exact clean-route screenshot comparison. An earlier search run encountered a development-server connection reset; unchanged search retry and final full run passed.

Important existing boundary: artifact storage is deployment-scoped, and the partner guard denies artifact routes with 403. This change preserves that denial and does not claim shared-deployment multiowner artifact support. Conversation uploads remain owner-scoped. Generated attribution in the rich fixture is explicitly seeded; no model generation is claimed by this file test.

No migrations, execution policy/lifecycle mutation, FactoryVersion, Relay, accounting or publication changes. Paid model operations: 0. Production deployments: 0. Tester mutations: 0. Executable tester grants: 0. Publication effects: 0. External-alpha changes applied: 0.

Remaining blockers: comprehensive populated visual baselines/keyboard behavior, composed deterministic journey, final fresh checkout/hosted CI, original historical-data provenance and release-impact package. Next checkpoint: G, then H automatically.
