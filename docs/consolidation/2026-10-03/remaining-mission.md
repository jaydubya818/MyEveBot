FINAL PRIVATE-ALPHA CONSOLIDATION — REMAINING MISSION, MAIN INTEGRATION & DEPLOYMENT AUTHORIZATION

The completed frozen-source consolidation is accepted as the starting point.

Preserve:

* MyEve draft PR #43;
* MyFactory draft PR #2;
* current source-consolidation evidence;
* fresh-clone qualification results;
* Product browser: 50 PASS;
* owner isolation: 24 PASS;
* composed local Factory journey: 26 PASS;
* unchanged canonical mains, milestone tags and primary checkouts until the gates below authorize changes.

Do not redo already-passing source consolidation merely because the earlier mission text was incomplete.

The remaining mission is below.

⸻

1. ESTABLISH AND RECORD CURRENT TRUTH

Fetch current remotes for MyEve, Relay and MyFactory.

Record:

* current canonical main SHAs;
* exact heads of MyEve PR #43 and MyFactory PR #2;
* Relay main;
* source trees;
* migration heads;
* deployment targets;
* current production deployment SHAs;
* qualification/staging deployment SHAs.

Verify the assembled PRs still contain the intended frozen inputs:

Environment Fabric

65d1e97

Product / Pluto

9decd3169ab122bb60b612fc75fe079c10ddeaf6

Private Alpha

MyFactory 7fe3397ad0f2423e60299872c85e7ce1fe9eed19

MyEve fadf08e12340035e3691c6f047b4927b1ab21264

plus their final documentation/handoff commits.

EvidenceProvider

MyFactory 721adc93af318ba341286074780330512b0be9d4

Cloud Execution

MyEve 00a82b78

MyFactory 0fef220

Relay

current canonical remote main.

If newer canonical commits exist, reconcile them semantically rather than resetting them.

⸻

2. PRESERVE OWNERSHIP BOUNDARIES

Preserve:

MyEve

owner experience, Sofie, Work, Current Truth, Routines, Results/Proof consumption, Today/Inbox and owner decisions.

Relay

identity, grants, agent messaging, federation and governed capabilities.

MyFactory

production execution, Environment routing, HarnessProvider, candidate custody, verification and publication boundaries.

Environment Fabric

canonical environment/capability/routing contracts.

Do not introduce competing implementations during consolidation.

⸻

3. PRESERVE HISTORICAL QUALIFICATION

Do not rewrite, squash away or relabel the important qualification history.

Preserve:

* Attempts 1–8;
* Attempt-8 Candidate A;
* historical PR #2 associated with that qualification where distinct from the consolidation PR;
* CI PASS;
* independent-review numeric defect;
* safe-integer contract clarification;
* failed successor/no-edit qualification;
* bounded Review → Repair → Reverify regressions;
* credential-custody incident;
* OIDC remediation;
* deterministic CLOUD qualification evidence.

Historical failed candidates must remain failed historical candidates.

⸻

4. SEMANTIC ADOPTION MANIFEST

Maintain the final adoption manifest:

source

→ canonical destination

→ owner

→ adopt / adapt / already landed / defer / reject.

Resolve conflicts semantically.

Never use ours/theirs solely to make Git conflict resolution succeed.

Record any differences between the original feature handoffs and the final assembled source.

⸻

5. MIGRATION RECONCILIATION

Revalidate all canonical migrations across the assembled source.

Require:

* ordering valid;
* checksums valid;
* no duplicate numbers;
* no equivalent duplicate migrations;
* no abandoned proposal accidentally activated.

Product Rooms/Groups schema remains a proposal unless the assembled implementation actually requires and qualifies it.

EvidenceProvider introduces no SQL migration on the Factory side.

Do not allocate migrations merely to make documentation match implementation.

⸻

6. DEFERRED FEATURES REMAIN DEFERRED

Do not activate as part of this release:

* CLOUD_COMPUTER;
* CMUX runtime adapter;
* TMUX runtime adapter;
* additional HarnessProviders;
* DeepAgent unless separately qualified;
* Muse;
* GrokBots;
* Event → Work;
* automatic merge;
* automatic deployment;
* unqualified persistent Group/Room execution;
* unqualified visual candidate verification.

Preserve their contracts/docs where appropriate.

⸻

7. CLOSE THE EVIDENCEPROVIDER CONSUMER GATE

This is now a release gate.

Integrate the accepted MyFactory EvidenceProvider transport with canonical MyEve Proof.

Required P0 path:

Candidate

→ TestEvidence / DiffEvidence

→ Factory durable custody

→ authenticated evidence transport

→ MyEve durable custody

→ independent byte/digest/binding verification

→ stable factory-evidence:sha256:... reference

→ canonical Proof

→ owner Result/Proof surface.

MyEve must verify:

* owner/business scope;
* repository;
* Work;
* WorkOrder;
* Run;
* candidate;
* FactoryVersion;
* evidence kind;
* digest;
* byte count.

Collection and transport do not establish PASS.

MyEve/independent verification remains responsible for evaluation.

Require:

TestEvidence E2E: PASS
DiffEvidence E2E: PASS
MyEve durable readback: PASS
Proof references: PASS
cross-owner evidence disclosure: 0
cross-Work evidence disclosure: 0
candidate mutation: 0.

CandidatePreviewProvider, ScreenshotEvidence E2E and BrowserJourneyEvidence E2E may remain PARTIAL/NOT_RUN for this release.

Do not block P0 on dynamic visual candidate preview.

⸻

8. CLOSE THE COMPOSED HOSTED JOURNEY GATE

Re-run the deterministic CLOUD Golden Journey using the assembled consolidation source, not merely the original Cloud feature branches.

Require:

production-like composed qualification deployment

→ natural Sofie browser request

→ canonical Work

→ EnvironmentRouter

→ exact CLOUD binding

→ MyFactory

→ existing qualified HarnessProvider

→ deterministic productive execution

→ candidate

→ private custody

→ independent verifier

→ Result/Proof

→ teardown

→ browser disconnect/recovery.

Require local runtime dependencies:

0.

Preserve the precise qualification statement:

zero local runtime dependencies were observed; physical Mac power state was not independently observed.

Do not overstate that evidence.

⸻

9. FULL CANONICAL REGRESSION CORPUS

Canonical source must retain regressions for:

* proposal normalization;
* admission proposal semantics;
* namespaced model identifiers;
* bounded repository context;
* productive capacity;
* implementation feedback;
* completion transition;
* exact-byte output;
* safe-integer boundaries;
* no-edit productive turn;
* candidate custody;
* protected verification;
* accounting;
* exact-tree/base publication guards;
* CI/readback;
* independent review;
* Review → Repair → Reverify;
* Environment routing;
* environment binding persistence;
* no silent environment movement;
* credential custody;
* OIDC trust/revocation;
* EvidenceProvider isolation.

⸻

10. FULL CLEAN-SOURCE QUALIFICATION

From fresh clones/current assembled source, run applicable:

* MyEve unit/integration;
* Relay;
* MyFactory;
* PostgreSQL integration;
* migrations;
* typechecks;
* governance;
* production builds;
* Environment Fabric contracts;
* routing matrix;
* OWNER_COMPUTER regression;
* LOCAL_FACTORY regression;
* CLOUD deterministic E2E;
* EvidenceProvider consumer E2E;
* publication regressions;
* Product/Pluto suites;
* desktop Playwright;
* 390px Playwright;
* keyboard checks;
* automated accessibility checks.

No fixture-only PASS may be reported as live qualification.

⸻

11. P0 PLAYWRIGHT AGAINST ASSEMBLED PRODUCT

Run P0 against the assembled production-like build.

At minimum prove:

A. Natural Sofie request

browser → canonical Work.

B. Work Inbox / Current Truth

Working / Needs You / Completed states derive from canonical state.

C. CLOUD

deterministic software Work completes through the hosted path.

D. No-local-dependency

cloud-eligible Work completes with local runtime dependencies = 0.

E. OWNER_COMPUTER

existing qualified local-computer regression remains intact.

F. Local-only Work

unavailable local environment truthfully surfaces Waiting for your Mac or canonical equivalent rather than silently routing to CLOUD.

G. Browser disconnect/reconnect

same Work reconstructed from durable server truth.

H. Result/Proof

canonical evidence and verification visible.

I. Needs You / owner decision

real canonical owner-decision controls.

J. Same conversation continuation

completed Work does not prevent the next owner request and does not carry stale authority.

K. Routine deterministic lifecycle

create → trigger → exactly-one run → Result → next state, within currently qualified deterministic scope.

⸻

12. RELEASE-BLOCKING SAFETY COUNTERS

Report:

* unauthorized executions;
* duplicate authoritative Works;
* duplicate Factory dispatches;
* duplicate candidates;
* overlapping writers;
* stale mutations;
* UNKNOWN events;
* cross-owner disclosures;
* cross-Work disclosures;
* cross-environment disclosures;
* protected evidence leaks;
* secret disclosures;
* unauthorized publication effects;
* false Ready states;
* false completed states.

Target:

0 for every release-blocking unsafe count.

Do not invent zero for a metric that was not actually observed.

⸻

13. DOCUMENTATION

Reconcile canonical:

* MyEve README;
* Relay README/docs;
* MyFactory README;
* Environment Fabric architecture;
* cloud execution architecture/runbook;
* HarnessProvider docs;
* EvidenceProvider docs;
* agent-native Product architecture;
* Product qualification matrix;
* production promotion/runbook.

Remove or clearly mark stale statements such as:

* historical VCR image blocker;
* blanket WAITING_FOR_CANONICAL_Q37;
* static Factory bypass as the intended architecture;
* claims that deterministic Product tests equal live CLOUD qualification.

⸻

14. PRODUCTION PROMOTION MANIFEST

Consume the Cloud owner’s prepared Production Promotion Manifest and reconcile it against assembled source.

Explicitly classify every Cloud/qualification component:

PROMOTE

PROMOTE WITH PRODUCTION-SPECIFIC CONFIGURATION

STAGING/QUALIFICATION ONLY

DEFER.

At minimum:

Promote

* Environment contracts;
* EnvironmentRouter;
* CloudExecutionProvider;
* HarnessProvider boundary;
* hosted controller;
* candidate custody;
* independent verifier;
* Result/Proof integration.

Production-specific

* service/workload identities;
* production databases/storage;
* environment registry;
* application authentication;
* production trust relationships.

Do not promote from staging

* synthetic owner;
* deterministic model responses as production routing;
* qualification-only passwords;
* qualification GitHub secrets;
* PREVIEW→PREVIEW trust rule;
* staging ingress allowlists;
* fault-injection configuration;
* test Work ceilings;
* qualification-only controller guards.

The production environment must not depend on qualification credentials.

⸻

15. AUTHORIZATION — CANONICAL MAIN MERGE AND PRIVATE-ALPHA PRODUCTION DEPLOYMENT

I authorize Consolidation to complete the deterministic release gates above and, only after they PASS, merge the qualified consolidation PRs into canonical main and deploy the resulting integrated private-alpha production release using the project’s existing approved production deployment paths.

This authorization includes:

* merging MyEve consolidation PR #43 after required checks PASS;
* merging MyFactory consolidation PR #2 after required checks PASS;
* integrating any required Relay compatibility change through its normal reviewed main path;
* applying already-qualified required production migrations;
* deploying the resulting canonical MyEve private-alpha production application;
* deploying/configuring the required canonical MyFactory production services;
* configuring production-specific non-secret environment/resource identifiers;
* creating/configuring the production service-to-service trust relationship required by the qualified architecture, provided it uses the same short-lived workload-identity principle and does not copy staging credentials;
* performing production health/security smoke checks;
* rolling back the new deployment if deterministic deployment validation fails.

This authorization does NOT include

* paid real-model production execution;
* first real-model CLOUD canary;
* publishing a Factory-generated candidate;
* opening a Factory-generated PR unless separately authorized through the owner-decision lifecycle;
* merging a Factory-generated candidate;
* deploying Factory-generated application code;
* automatic repair activation;
* automatic merge;
* automatic deployment of generated Work;
* owner acceptance of generated Work;
* enabling DeepAgent;
* enabling additional HarnessProviders;
* enabling CLOUD_COMPUTER;
* enabling CMUX/TMUX runtime adapters;
* enabling Muse/GrokBots;
* enabling unqualified Rooms/Groups execution.

Production deployment authorization is for the MyEve/Relay/MyFactory platform release itself, not authorization for agents to perform consequential production Work.

Production trust

Do not copy the PREVIEW→PREVIEW staging Trusted Sources rule into production.

Create a separately scoped production relationship using the strongest available exact production source/destination claims and short-lived workload identity.

Independently preserve MyFactory application authentication and Work authority after the infrastructure trust boundary.

If the production identity mechanism materially differs from the qualified architecture or requires a broader credential scope, stop for owner approval rather than improvising.

⸻

16. PRODUCTION DEPLOYMENT QUALIFICATION

After main merge/deployment, verify production:

* deployed SHA matches canonical main;
* health;
* authentication;
* migrations;
* Relay health;
* Work read/write;
* Environment registry;
* production CLOUD route configuration;
* MyFactory authentication;
* candidate custody service readiness;
* verifier readiness;
* EvidenceProvider transport;
* MyEve Proof ingestion;
* Result/Proof rendering;
* owner decision surface;
* browser bundle secret scan;
* HTML/hydration secret scan;
* no staging/qualification credentials present;
* no synthetic owner present unless independently required and approved.

Run deterministic production smoke/E2E where it can be done without a paid model operation or consequential generated-code effect.

If deterministic production validation fails:

fail closed

→ preserve evidence

→ rollback where appropriate

→ do not proceed to real-model authorization.

⸻

17. FIRST REAL-MODEL PRODUCTION CLOUD CANARY — PREPARE, DO NOT EXECUTE

Once production deterministic validation passes, prepare the authorization envelope for the first real-model production CLOUD canary.

Do not execute it under this authorization.

Use a new, harmless, bounded task—not another mutation of historical Attempt-8 evidence.

The envelope must specify:

* Work ID;
* repository;
* exact objective;
* exact model/provider;
* HarnessProvider;
* FactoryVersion;
* Environment/CLOUD binding;
* maximum operations;
* candidate attempts;
* duration;
* spend ceiling;
* completion reserve;
* allowed files/effects;
* independent verifier;
* Result/Proof requirements;
* publication disabled;
* merge disabled;
* deployment of generated candidate disabled.

Stop and request explicit owner authorization for that canary.

⸻

18. FINAL CONSOLIDATION REPORT AND THREAD CLOSURE

Return:

Overall: READY / PARTIAL / NOT_READY

Canonical MyEve main SHA: …

Canonical Relay main SHA: …

Canonical MyFactory main SHA: …

Production MyEve deployed SHA: …

Production MyFactory deployed SHA: …

Environment Fabric: …

CLOUD: …

HarnessProvider: …

Existing harness: …

DeepAgent: DEFERRED unless independently qualified

OWNER_COMPUTER: …

LOCAL_FACTORY: …

Unified Work Thread: …

Work Inbox: …

Persistent Agents: …

Routines: …

Rooms/Groups: …

Relay messaging: …

EvidenceProvider: …

TestEvidence/DiffEvidence → Proof: …

**Candidate

ScreenshotEvidence E2E: PARTIAL / NOT_RUN

BrowserJourneyEvidence E2E: PARTIAL / NOT_RUN

Result/Proof: …

Review → Repair → Reverify: …

Publication controls: …

P0 Playwright: …

Desktop: …

390px: …

Keyboard: …

Accessibility: …

No-local-dependency CLOUD: …

Browser reconnect: …

Production service identity: …

Production deterministic smoke: …

Paid production model calls: 0 required before separate authorization

Production-generated publication effects: 0 required

Safety counters: …

Deferred capabilities: …

Known limitations: …

Remaining live gates: …

First real-model production canary: READY_FOR_AUTHORIZATION / NOT_READY

Threads safe to close: …

Threads that must remain available for compatibility defects: …

For every capability distinguish:

IMPLEMENTED

QUALIFIED

LIVE-QUALIFIED

and do not promote one category into another.

Thread closure

Assuming their handoffs are durably adopted or referenced by canonical main, evaluate these workstreams for closure:

* Environment Fabric;
* Product / Pluto;
* Private Alpha;
* EvidenceProvider;
* Cloud Execution;
* historical Beta integration;
* historical Q37;
* Sol/local-computer repair;
* Goals/proactive-work;
* Universal Inbox;
* older Memory/Capsules workstreams;
* older verification workstreams.

A thread is safe to close only when:

1. its unique source is canonical, intentionally rejected, or durably referenced;
2. its evidence is preserved;
3. its unresolved requirements have an explicit canonical owner or deferred status;
4. no unmerged source exists only in that thread/worktree.

Do not delete historical evidence merely because a thread is closed.

⸻

19. END STATE

This convergence mission is complete when:

A. Source

Frozen qualified feature work has been semantically assembled into canonical MyEve / Relay / MyFactory main.

B. Evidence

The canonical regression corpus and historical qualification evidence remain intact.

C. Deterministic qualification

Fresh-source deterministic suites pass.

D. Evidence flow

TestEvidence / DiffEvidence

→ Factory custody

→ authenticated transport

→ MyEve durable custody

→ canonical Proof

passes end-to-end.

E. Hosted execution

The composed canonical source reproduces:

natural Sofie request

→ Work

→ CLOUD

→ harness

→ candidate

→ custody

→ independent verifier

→ Result/Proof

→ recovery

with zero local runtime dependencies.

F. Product

The assembled owner experience truthfully exposes:

* Sofie;
* persistent agents;
* Work Inbox;
* Working;
* Monitoring;
* Results;
* Proof;
* Needs You;
* qualified Routine behavior;
* Rooms only to their qualified level.

G. Main

Required reviewed consolidation PRs are merged into canonical main.

H. Production

The integrated MyEve / Relay / MyFactory private-alpha platform is deployed through the authorized production path.

Production uses:

* production identities;
* production resources;
* production-specific trust;
* no qualification credentials;
* no synthetic staging authority;
* no accidental staging configuration.

I. Production validation

Deterministic production smoke/security checks pass.

J. Generated Work remains gated

Platform deployment does not grant agents automatic publication, merge or deployment authority.

K. Real-model canary

A bounded first real-model production CLOUD canary is prepared but not executed until Jay separately authorizes its exact envelope.

L. Program convergence

Superseded implementation threads are identified as safe to close.

At that point the engineering phase changes from:

build the private-alpha infrastructure

to:

use the private alpha.

The next owner journey after the separately authorized production canary should be a natural request from the real MyEve frontend:

Jay

→ Sofie

→ appropriate persistent specialist

→ canonical Work

→ qualified Environment

→ qualified HarnessProvider

→ Result/Proof

→ Needs You only when necessary.

No manually constructed Work envelope should be required for ordinary private-alpha use.

No qualification-only UI should be required.

No local controller should be required for CLOUD Work.

No staging credential should be required by production.

Final instruction

Continue autonomously through Sections 1–16 using the authorization above.

Do not stop merely because a merge, canonical-main push, migration application, or platform production deployment is required; those actions are explicitly authorized only after their preceding deterministic release gates pass.

Stop if:

* a required release gate fails and cannot be repaired within the assembled scope;
* a new security boundary requires materially broader authority than specified here;
* production would require copying qualification/staging credentials;
* production identity requires a materially different trust architecture;
* a migration conflict cannot be reconciled safely;
* a concrete compatibility defect requires modification of a frozen source owner;
* or the first paid real-model production canary is ready.

At the real-model canary boundary, return the exact authorization envelope required by Section 17.

Do not execute that paid production canary until I explicitly approve it.

Otherwise proceed through canonical main integration, authorized private-alpha platform production deployment, deterministic production validation, final reporting and thread-close recommendations.