# MyEve owner experience — implementation ledger

## Source truth

- Canonical main fetched: `2ef364024bc1cdd3e10ec28f3d340119c6f87d41`.
- Frozen external-alpha source: `8338309582d6806829dec1ae1beef301d6b52425`, from `codex/external-alpha-gate-one-20261007` and the read-only installation preparation envelope. No installation was inspected or changed by this workstream.
- The alpha branch contains 17 commits beyond the common ancestor; main contains one documentation commit. Clean integration base: `11b692aff750921d89beb0aa83fe4b82c11d9e5a` (merge without conflicts). The alpha backend is inherited, not reimplemented.
- Relay main: `a90625776193031ca2303ba2e2162249d1245479`.
- MyFactory main: `030b1a51017f3159436b93817ed2d5bf6ae18288`.
- Skillz initial remote main: `4942dde4b2a442df3ee45879bb22734c658426df`.
- Primary checkout contains unrelated dirty work and was left untouched. Implementation uses an independent clone and branch `codex/myeve-owner-experience`.

The reference repositories were read only. MyEve presents private context and durable Work. Relay remains identity/communication authority; MyFactory remains execution, custody and verification authority. This redesign introduces no competing control plane.

## Shell and route inventory

`app/layout.tsx` now hosts `ApplicationShell` after the authenticated owner boundary and server-computed `DestinationGate`. Today, Work, Needs You and Results previously copied a shell in `IntegratedExperience`; Files/Privacy used `ProductShell`; Chat, Knowledge and legacy Files used Chat's sidebar as global navigation. Capsules has a distinct page implementation, denied by alpha policy; it is preserved without redesign.

Primary owner navigation is Today, Sofie, Work, Needs You, Files, with Settings and Privacy below. The command palette uses the same policy context. Alpha restrictions remain enforced by the proxy and backend guards. Settings adds only a read-only page for existing appearance/sign-out controls; it adds no execution API.

## Historical-data provenance investigation

Inspected canonical Work and Goal reads filter the authenticated owner. Work also requires personal scope. No missing owner predicate was found on those paths.

Historical records belonging to the same owner are not distinguished from ordinary Work by a durable qualification marker. Source establishes these possible origins:

- `scripts/seed-review-e2e.ts`: opt-in engineering Goals under configured owner.
- `scripts/seed-knowledge-preview.ts`: preview Goal under configured owner.
- `test/golden-ui-fixture.mjs`: explicit local golden database fixtures.
- `test/alpha-conversation-fixture.mjs`: engineering qualification Work.

These are provenance candidates, **not proof of the screenshots' source**. The pasted brief contains no record identities or screenshot files; no tester database was queried. Exact historical screenshot attribution remains unverified. No evidence was deleted and no title-based hiding heuristic was introduced. A local cross-owner fixture checks foreign Work, Goals, threads and Files are excluded and direct reads denied.

## Checkpoint A scope

Implemented shared shell and semantic tokens, narrow policy-aware navigation, Sofie thread-only rail, mobile menu, clean Today entry, Settings and Privacy. Removed global New Goal, repeated privacy boilerplate, alpha developer/model/setup controls, and denied publication/learning links. This intentionally touches multiple page wrappers because leaving one unchanged would retain shell switching.

No migration, controller, accounting, FactoryVersion or authority change is introduced by the UX diff against the frozen source. The base merge inherits existing alpha migrations; those are not new UX migrations. Automatic Vercel deployment is disabled for this implementation branch.

Qualification and checkpoint verdicts are recorded separately. Checkpoint A is not UX1–UX9 release qualification. Work presentation, decisions, populated/fault fixtures, durable golden journey and final release impact remain to be completed.

Counters: paid provider operations 0; production deployments 0; tester mutations 0; executable tester grants 0; publication effects 0; external-alpha authority changes 0.
