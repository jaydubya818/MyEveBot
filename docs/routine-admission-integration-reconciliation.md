# Routine admission integration reconciliation

This candidate starts at current canonical main and preserves both qualified histories. It does not modify, merge into, deploy, or activate main.

## Exact fetched graph

- Main: `1d20be474e7841871001cf592b8f523a178770e1` (unchanged from the requested reference).
- Feature: `396631afa4739e5ca8ac0c5c81781f82f3160403` (unchanged from qualified source).
- Merge base: `d6832575ab51542ff7ce8a728b6e3d3774e0ec55`.
- Main-only commits by identity: 16.
- Feature-only commits by identity: 20, including its existing merge commit.
- Integration branch: `codex/routine-admission-integration`.
- Strategy: inspected three-way reconciliation, committed only after local qualification, with main as first parent and the qualified feature as second parent. No squash, rebase, or rewrite of either history.

```text
* 396631a feat: add capability-aware routine admission
* d4c374c Document cumulative Routine and Federation qualification
* ee904d3 Reconcile Routine final gate with preserved Relay federation
*   60d341f Merge pull request #3 from jaydubya818/feat/relay-federation-adapter
|\
| * e6a5440 Record independent PR review and final qualification evidence
| * a7182ed Fix independent federation review findings
| * e96fc2e docs: record canonical PR base publication blocker
| * 897659b docs: record rebased federation merge qualification
| * 4c73943 test: requalify federation on canonical executor and recovery authority
| * cfb098e fix: enforce current MyEve authority at federated model boundary
| * 7872004 fix: reconcile federation migration after canonical authority recovery
| * a7786d2 test: qualify MyEve federation over isolated live trust domains
| * 006100a feat: add owner-controlled MyEve Relay federation adapter
| * 2f6905c fix: isolate owner Knowledge display constants from server repositories
|/
* 4d3f1eb Record executor coverage and routine release qualification
* d75b498 Qualify external write boundaries and read-only action recovery
* 81979b6 Enforce canonical authority in qualified action executors
* 74fee5b feat: require owner review before legacy routine execution
* ae56f0c feat: add action gateway and isolated reliability qualification
* cb8f75b feat: add durable occurrence and delivery foundations
| * 1d20be4 fix(deps): pin current Raindrop otelv2 release
| * 962d58a fix(data): split migration SQL for Neon execution
| * ea31a24 feat(data): export routine and action history safely
| * 785f5f5 test(actions): qualify executor coverage matrix
| * d03979f feat(routines): bound missed work and preflight authority
| * ea7397c fix(actions): block unqualified provider writes
| * 10f52f7 feat(actions): recover uncertain execution safely
| * 499fbd1 Enforce canonical authority in qualified action executors
| * c11555b feat: require owner review before legacy routine execution
| * d305493 feat: add action gateway and isolated reliability qualification
| * 7ee1bc4 feat: add durable occurrence and delivery foundations
| * 96ab60a fix(control): project actionable approvals safely
| * 433f34b feat(data): extend safe owner archive coverage
| * 7c093a7 fix(data): reconcile file ownership during migration
| * a18b613 fix(builder): complete release manifest coverage
| * 479eeaa fix: keep owner knowledge server code out of client
|/
o d683257 feat: add live computer human takeover
```

## Main-only commits

```text
479eeaa9eb07d3de0010670d3d3194a7fa30e6b1 fix: keep owner knowledge server code out of client
a18b61336e2063775c4df773b402a1c76eb4f177 fix(builder): complete release manifest coverage
7c093a75686a4635719bcd1152736206963539eb fix(data): reconcile file ownership during migration
433f34bc964ec767e84068e5d59e127828e2d311 feat(data): extend safe owner archive coverage
96ab60ad79db42b5ecd072e3f94f628e984198a1 fix(control): project actionable approvals safely
7ee1bc481ac48284ae469287d3305364f1668d77 feat: add durable occurrence and delivery foundations
d305493c66f880c97256663de38d487c20a36160 feat: add action gateway and isolated reliability qualification
c11555b7e367a0ba8f92096eaf650d68febf70a6 feat: require owner review before legacy routine execution
499fbd186e29b3e1b799ae409dce1ed1013b06fc Enforce canonical authority in qualified action executors
10f52f7d0a14d52ea6b1efef987d63bd31741012 feat(actions): recover uncertain execution safely
ea7397cad1b8e5dbf5397b55eb662dc0b5f7623c fix(actions): block unqualified provider writes
d03979f7147fca870642ad00266e2f08dbeacc85 feat(routines): bound missed work and preflight authority
785f5f5b2f0542adfb2e6a559f9879eb47ae65b5 test(actions): qualify executor coverage matrix
ea31a24a3b972a7daf5ba247f72e17d24b0e26ef feat(data): export routine and action history safely
962d58acfdbb09fb52b1fb466f9803041acfd516 fix(data): split migration SQL for Neon execution
1d20be474e7841871001cf592b8f523a178770e1 fix(deps): pin current Raindrop otelv2 release
```

## Feature-only commits

```text
cb8f75b1837d5c1c25fc848f7559d2741272c044 feat: add durable occurrence and delivery foundations
ae56f0cdb68b664fcc80cd03eaf2288120f03416 feat: add action gateway and isolated reliability qualification
74fee5b1fdc8ec7c705a9087d9bdf58992b8f27c feat: require owner review before legacy routine execution
81979b6d367776366e930278fdad897d63956fc5 Enforce canonical authority in qualified action executors
d75b498b9c6ac47955e1eeabfa40962bf56d711d Qualify external write boundaries and read-only action recovery
4d3f1eb685422fc77296cef245e84c5b09da6e91 Record executor coverage and routine release qualification
2f6905ce7d3a438cf6885ff7aa69035ca63b0cba fix: isolate owner Knowledge display constants from server repositories
006100a56170e9c98a52f510294b4aacafb279e5 feat: add owner-controlled MyEve Relay federation adapter
a7786d2612a849706fa9c75fdc42e10c7454b70a test: qualify MyEve federation over isolated live trust domains
7872004f3edecdb50c7c62a42eb2de7d0df3007b fix: reconcile federation migration after canonical authority recovery
cfb098e389eca52cf2840d483a6aadb5582a9267 fix: enforce current MyEve authority at federated model boundary
4c739436ce407f24a4159edfea603e393e08857e test: requalify federation on canonical executor and recovery authority
897659b4cb0a002b2bda81b53e73c2d909bb03c7 docs: record rebased federation merge qualification
e96fc2edee827fd6a6d50a1eca02ae30293ab9a3 docs: record canonical PR base publication blocker
a7182edf9111203b69e604374894740724db2931 Fix independent federation review findings
e6a5440328f9ed34c883f0491de4e1190b151292 Record independent PR review and final qualification evidence
60d341f9909936f03e4d72e1a7f845721ef82c46 Merge pull request #3 from jaydubya818/feat/relay-federation-adapter
ee904d3cedd3d9ec0a8b172fcb1d096155607a3a Reconcile Routine final gate with preserved Relay federation
d4c374c79cb9a909b50befc91b4bc5bd8c14fd1f Document cumulative Routine and Federation qualification
396631afa4739e5ca8ac0c5c81781f82f3160403 feat: add capability-aware routine admission
```

## Equivalent and superseded behavior

Four pairs are patch-equivalent (`git log --cherry-mark`):

| Main | Feature | Behavior |
|---|---|---|
| 7ee1bc4 | cb8f75b | Durable occurrence and delivery foundation |
| d305493 | ae56f0c | Action Gateway and isolated reliability |
| c11555b | 74fee5b | Owner review before legacy Routine execution |
| 499fbd1 | 81979b6 | Canonical authority in qualified executors |

Main split external-write, recovery, bounded Routine work and coverage qualification across 10f52f7, ea7397c, d03979f and 785f5f5; the feature carries overlapping qualified behavior through d75b498/4d3f1eb and later reconciliation. These implementations were compared rather than reapplied as duplicate subsystems.

The feature's minimal Knowledge constant split (2f6905c) is superseded by main's complete client-safe type/module split (479eeaa). Main's broader split is retained verbatim. Main's file ownership repair (7c093a7), actionable Approval/Computer error projection (96ab60a), Owner Data coverage and non-restorable authority semantics (433f34b, ea31a24), SQL statement splitter (962d58a), and pinned Raindrop version (1d20be4) remain intact.

## Resolution decisions

The merge had 37 conflicted paths, largely add/add conflicts from separately qualified foundational histories. No blanket strategy was used to replace main.

- Retained main's Owner Knowledge implementation, shared types and client import boundary.
- Retained main's Owner Data implementation and restore restrictions; added only `admission`/`preflight` fields to its existing Routine occurrence export. A regression assertion confirms the receipt remains historical, with no restorable authority.
- Retained main's Computer control implementation, API safe errors, Control Center projection, file-owner migration/runtime handling, Builder manifest checks, migration SQL splitter, dependency manifest and lockfile.
- Retained feature's finite immutable Routine graph, shared admission service, pending-send continuation, owner recovery decisions, exact approval/replay fences, browser semantic-effect boundary, and Relay privacy/local-authority checks.
- Retained Builder operations-monitor/Knowledge feature membership while adding readiness-tool membership and excluding test/qualification files from generated deployments.
- Rebuilt the executor inventory from the cumulative sources, including main's two additional internal modules. Current counts are in the qualification report.
- Normalized trailing whitespace in four inherited Federation evidence logs; their recorded results are unchanged.
- A duplicate type import introduced by an automatic merge was caught by TypeScript and removed, restoring main's Computer control file byte-for-byte.

## Canonical migrations

Every existing main migration 0001–0026 is byte-identical to current main. Feature migrations 0027–0029 are byte-identical to 396631a. Their numbers were free on main; no renumbering is needed.

The important exception is a *semantic difference in the branches' committed 0026*: feature added `approval_generation` and the unique live Action binding index to a version main had already committed without them. Main's 0026 must remain immutable. New **0030_action_binding_reconciliation.sql** carries those two additions after 0029. The application schema marker points to 0030.

```text
0001_runtime_core.sql
0002_trustworthy_delegation.sql
0003_goal_operating_system.sql
0004_skill_control_plane.sql
0005_skill_evals_and_outcomes.sql
0006_outcomes_and_review_loop.sql
0007_proactive_review_delivery.sql
0008_persistent_agents.sql
0009_scoped_memory_context.sql
0010_agent_computer_runtime.sql
0011_knowledge_provenance_core.sql
0012_role_run_attribution.sql
0013_colleague_first_execution.sql
0014_persistent_browser_profiles.sql
0015_phone_safety_controls.sql
0016_owner_data_operations.sql
0017_owner_file_inventory.sql
0018_owner_knowledge_control.sql
0019_agent_control_center.sql
0020_canonical_approval_requests.sql
0021_computer_control_leases.sql
0022_live_computer_provider.sql
0023_execution_reliability.sql
0024_routine_owner_review.sql
0025_action_executor_enforcement.sql
0026_action_recovery_qualification.sql
0027_relay_federation.sql
0028_routine_pending_send.sql
0029_routine_admission.sql
0030_action_binding_reconciliation.sql
```

0027 preserves Federation storage and grants. 0028 preserves pending sends independently of Federation. 0029 preserves nullable admission receipts, `blocked_precheck`, null Run only for blocked prechecks, and the deferred owner/Run foreign key. 0030 preserves recovery approval generations and uniqueness of live bindings. None approves a Routine or grants execution authority.

Only isolated PostgreSQL was migrated. Rollout must separately authorize applying 0027–0030 in order and deploying matching code while execution stays disabled. Existing duplicate live bindings intentionally make 0030 fail rather than silently discard possibly transmitted Actions. A database that previously applied the feature variant of 0026 needs explicit schema reconciliation before this main-based migration chain; it must not be treated as a canonical-main upgrade.

No destructive rollback is included. Reverting to old code requires reconciling blocked occurrences/null Run rows and preserving receipts before restoring old constraints. No schema rollback or shared mutation was performed.
