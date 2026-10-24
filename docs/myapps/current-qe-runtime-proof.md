# Current Eve packaging proof — source proposal, not an execution receipt

The selected QE target builds the current `runner-prod.ts` owner-journey source.
It is not the historical f896 tokenizer artifact and is not the retained R9
chat-only runner. Its three intended-positive Work journeys remain on HOLD.

Keep the historical verifier, manifest, six encodings, Unicode cases and canonical
consumers byte-identical. Select a separate current profile explicitly from the
reviewed source. Never fall back to that profile after a historical check fails.
Do not install an unused tokenizer or imply equivalence to its encoding behavior.

## Claim and trusted producer

The proposed current claim is authenticated selected build inputs, the complete
output of a contemporaneously observed public `eve build`, exact emitted external
package bytes and parent resolution, and public Client/session/message/stream/
reconnect/identity behavior of that exact output in the declared platform.
Health/bootstrap is a smaller intermediate observation and cannot close this
functional claim. It does not prove unused application tool paths,
token-count equivalence, a real model call, paid Work or production readiness.

A standalone receipt supplied by another process cannot award this claim. The
reviewed producer must perform the sequence below itself and fail closed at any
missing or inconsistent observation. Post-hoc hashes of retained R9 files cannot
replace this sequence. A receipt digest protects against accidental record drift;
it does not make an untrusted producer trustworthy.

1. Freeze the current source commit/tree, exact tracked input inventory, lock and
   application/agent configuration, approved fixture substitutions and producer
   source. Reject dirty/untracked source and existing outputs in a new owned copy.
   Keep evidence outside that copy. The existing gateway, Next routing and local
   transport seams must have explicit before/after file hashes; no broad ignore
   pattern or copied `.env` files. Existing source directories remain read-only;
   the new owned producer may mutate only its own copy, generated outputs and
   explicitly owned dependency tree.
2. On the supported platform, perform a fresh locked install with the trusted
   public npm CLI, scripts disabled, no inherited npm/user configuration, a fresh
   owned cache and no credentials. Reject registry lock entries without exact
   SHA512 integrity and exact HTTPS public registry origins, unexpected git/file
   dependencies and unknown workspace links. Source workspaces remain bound to
   the tracked input inventory. Run only the source-controlled reviewed
   dependency patcher and its check; bind its manifest and replacement bytes.
   Seal the resulting complete installed input tree, including executable/native
   files and workspace/binary aliases. This is a producer observation, not a claim
   that an arbitrary old `node_modules` directory came from `npm ci`.
3. Authenticate the Eve 0.66.3 published body independently against its exact
   locked SHA512 archive, including every regular published file, native/WASM/data
   bytes and executable bits. The SDK's nested `node_modules` is an explicit
   separate dependency boundary covered by the fresh install/input seal. Reuse
   the already verified public archive, no refetch/reinstallation for preparation.
4. Bind Node/npm executable bodies, resolved public Eve CLI, OS, architecture,
   exact argument arrays, cwd and an exact scrubbed environment policy. Only
   declared synthetic local credentials are allowed. Secret values are not
   written to public evidence. The producer owns its build process and bounded
   lifetime. Use the public `eve build` with node-server preset; do not patch or
   invoke a private SDK module. The producer records a successful child exit and
   checks the frozen authored inputs, SDK body, patch state and installed input
   seal again after the build. Build outputs must be absent at entry, so a failed
   build cannot leave a stale successful output available for acceptance.
5. Seal every emitted output entry before any launch: generated authored entry,
   bundled `_libs/eve.mjs`, all virtual schedules, runtime glue, external packages,
   extensionless native executables, WASM/data, directories and modes. Permit only
   exact relative aliases with canonical targets inside the owned output; reject
   dangling/cyclic/escaping aliases and nonregular objects. The three observed
   Nitro estraverse aliases are valid only under those general checks. No fixed
   extension filter or exclusions for nondeterministic generated schedules.
6. Bind every emitted external package body to its exact installed locked source.
   Package metadata alone is insufficient. Compare every emitted regular file
   byte-for-byte with authenticated installed input, with package.json handled as
   JSON-identical serialization only. Resolve dependency aliases from the actual
   parent, never from a globally selected first matching version. If multiple
   source paths match the emitted subset, first bind origins through actual
   verified importing parents. Without a single selected origin, an equivalence
   class requires identical complete intrinsic source files, native/data assets,
   modes and locked integrity, plus equivalent effective dependency/optional/peer
   resolution recursively from each parent. Equal SRI and emitted subsets alone
   are insufficient. The component's declared dependency lookup does not prove
   dynamic imports or exports/main conditions: those need the actual registered
   public-runtime load witness. Never select the first metadata/version match.
   Named metadata below a package without an intervening `node_modules` boundary
   remains a body member of that locked container. Derive its candidate origins
   only from the verified physical emitted container and exact canonical installed
   member paths. Keep its own dependency/optional/peer importing context and
   propagate containment with actual importing-parent origins. Record container
   integrity and member provenance separately; the member has no invented child
   lock entry or integrity. Ambiguous member origins require complete locked
   container and member body/context equivalence, unless actual verified parent
   resolution selects an origin. Orphan metadata, unlocked nested `node_modules`,
   changed/native/executable/relocated files and context mismatches still fail.
   The outer package's full emitted file comparison and all-file coverage remain
   in force; nested metadata is not a directory exclusion or closure shortcut.
   During complete intrinsic-body comparison, inspect type and reject aliases
   before treating an actual canonical `node_modules` directory as a separate
   package boundary. A regular file with that name stays in the full body;
   a symlink or nonregular object cannot be hidden by the reserved spelling.
   Record declared dependencies omitted by the trusted tracer
   honestly; do not claim full-distribution equality or infer unobserved semantic
   reachability. Require the reviewed external bootstrap/package roots and their
   actual parent-resolved required closure. The static-import fix correctly
   bundles `pg`; do not require a physical external `pg` package when the trusted
   current build bundles it. Required bundled modules, including Eve and `pg`,
   need authenticated contemporaneous derivation and targeted public functional
   readbacks that actually exercise their paths. A health endpoint alone does
   not exercise a database/session path. Text searches, archive comparisons and
   file seals cannot substitute for that readback. An absent required external
   package or unresolved required edge is a failure. Bundled and external claims
   must remain distinct in the final receipt.
7. Launch the exact sealed public server entry with the same owned Node binary,
   scrubbed local environment and declared loader. Bind pid/args/cwd/environment
   policy, wait on a finite local readiness deadline, verify public health JSON
   and expected actual selected server identity, and fail on premature exit.
   Node resolution must not escape to a foreign parent/node_modules directory or
   undeclared loader; any source/prewarm dependency allowed by the public SDK
   deployment layout must be separately explicit and sealed. Recheck the full
   output/input seals after bootstrap and the targeted database/session public
   readbacks. A fresh synthetic owner/authenticated session list/readback must
   actually reach the selected bundled application/database code; record the
   request/response identities and the corresponding owned database observations.
   Stop and await only the owned child; retain
   first failures and cleanup errors. No model call is needed for a health-only
   intermediate observation; that observation remains NOT_QUALIFIED for the full
   current runtime claim below. The existing current E2 browser target runs
   separately and retains its actual result, including chat-only Work holds.
8. Against that same sealed selected runtime, use the documented public
   `eve/client` API with a fresh synthetic owner/session and the declared
   deterministic local model seam. Send exactly two benign messages once each,
   verify the actual completed replies and follow-up context, consume real
   streamed events, attach a fresh client to the same durable session/cursor,
   and verify bounded durable replay. Bind owner/thread/agent/session identities
   to authoritative owned PostgreSQL rows and exact local model-call/accounting
   observations. No raw cookie or password in public receipts. Inspect the real
   process resolution/loaded-byte witness and recheck seals before and after.
   Missing functional evidence or any identity/cursor/byte drift fails the full
   claim. Do not invoke a real provider, private SDK estimator, paid Work, or rerun
   the entire R9 desktop/mobile journey. R9 is separate evidence and cannot be
   inherited as this current artifact's at-run functional witness. No existing
   positive Work journey or its profile/gates is changed to make this pass.

## Platform and acceptance limits

Darwin arm64 proves Darwin arm64 only. Hosted Linux x64 requires this chain on
Linux x64; the cached Linux arm64 image is not a substitute. Root's retained SDK
archive/body comparison closes present SDK input authenticity only. Retained R9
runtime behavior is separate evidence because it did not seal the output at
execution time. Partial static REA graphs do not close missing derivation or
runtime links. No old FAIL/HOLD record is changed by a new scoped receipt.

Pure tests must reject unknown version/profile fields, modified lock/SDK/archive,
unexpected install inputs/patches, missing pg/required edges, wrong parent package
versions, byte/native/mode drift, metadata-only substitution, all unsafe aliases,
modified/added/deleted generated output, stale/preexisting output, a build error,
wrong platform, escaped loader resolution, wrong/foreign child readiness and
cleanup failure. Exact source/operator review precedes new app/build/bootstrap
execution. These requirements are engineering work already authorized by the
user; no new owner SDK-lineage decision is required.

## Complete source candidate, not a runtime receipt

The producer now has separate prepare/build stages: a fresh committed copy and
script-disabled locked install, exact dependency patches and SDK authentication
come first. Only that new install's documented public `tsx/esm/api` `tsImport`
loads the qualification TypeScript fixture. The fixture checks the owned physical
PG identity before creating three random databases through canonical migrations:
central accounting, one probe owner and one unused owner. No preexisting Env
force-drop helper is used. Pool shutdown, quiescence and nonforce DROP are bounded;
unknown creation acknowledgements retain failure/HOLD.

`current-qe-seams.mjs` pins the current owner-journey runner and gateway bodies,
uses its exact gateway import/routing substitutions, and declares the stricter
existing local transport and pinned Next local font as additional before/after
seams. It does not modify the positive Work runner or its grants/profile/counters.
`CURRENT_QE_SEAMS_STATIC_BEFORE_AFTER.json` lists these exact projections, produced
by static reads/copies only. The seam helper has not run against an actual target.

`current-qe-runtime.mjs` orchestrates the prepared build, separately named two-call
model namespace, exact sealed Eve/Next processes, public Client probe and read-only
authoritative row join. The public probe binds the primary agent, exact turn IDs,
ordered replay bodies/cursors and saved thread, and reads the real usage endpoint.
The join requires two actual HTTP/model requests, two exact completed turn runs,
two settled local operations and bound/settled central rows. It checks ten daily
turns, owner $1/day/$5/trial and shared $2/day/$10/trial limits, $0.20 nonrefundable
reservations, $0 separately labeled deterministic measured cost, zero Work effects
and zero changes to the unused owner. Actual observation has NOT happened.

`current-runtime-bootstrap.mjs` registers the accepted normal Node hooks before
loading the adapter or app. Its Eve resolution policy denies output-to-source
fallbacks, including an already loaded adapter pg. Fixture adapter dependencies
have their own explicit parent chain. Required bundled entry/Eve bodies need
actual returned-source observations; CJS/native null-source observations stay
FILE_AND_RESOLUTION_ONLY. The loaded-closure checker binds all observed external
files to the body-verified emitted records. Unexecuted tools/dynamic paths remain
NOT_ATTESTED. The runtime owner has finite group/log/readiness/operation cleanup
and an idempotent close promise; unknown escaped/native state remains failure.

`current-native-operator.py` creates one exclusive SCRAM/UTF8/C PG cluster, checks
physical system identifier/data directory/listening address/original PID, runs the
controller once under a ten-minute deadline, checks exact database restoration,
stops only its owned cluster, verifies all four ports clear and rechecks source.
Its declaration permits Darwin arm64 and Linux x64 with separate exact toolchains;
only a concrete Darwin inert plan is currently prepared. No Linux plan or executed
Linux proof exists. `CURRENT_NATIVE_PLAN_INERT.json` pins concrete executable
bodies, PG 56792, model 3184, web 3188, Eve 3185 and exclusive uncreated roots. Its
source commit/tree placeholders deliberately prevent execution until accepted
source is committed and the final root preflight/clearance binds that exact tree.

`run-packaging-profile.mjs` is the explicit selector/gate. Historical inputs go to
the unchanged historical verifier once. The current profile requires exact plan
and source/operator clearance hashes and executes the owned operator itself;
preexisting arbitrary receipts cannot award acceptance. Errors never select a
fallback profile. No existing workflow or canonical historical consumer is changed
by this source preparation. A current claim is scoped to its actual executed
platform, and cannot replace a required hosted Linux x64 result with Darwin/R9.

Author checks cover 87 affected unique Node synthetic cases and seven Python
simulated native-command cases. They include the actual extracted process/hook
method bodies with fake groups, clocks, pipes and files. Two initial VM cases
failed because the test mock omitted path.sep; the mock was corrected and those
six bootstrap cases passed. All earlier results remain retained. Previously
accepted unchanged component tests/reviews are reused, not rerun. There has been
no actual child install/build, SDK/client/app import, registered app hook, PG,
network/provider, actual-artifact-helper or native operator execution. Syntax
checks do not establish runtime success. Exact complete source/operator review,
commit binding, fresh root clearance, ordinary execution and hosted qualification
are still required before final current packaging acceptance.

## First isolated attempt and bounded generated-input correction

The first independently cleared Darwin attempt at4983615f failed after the public
Eve build, before Next, at `INPUT_TREE_CHANGED`. It remains a failure, with root
confirming owned PostgreSQL stopped, five groups closed, four ports clear and
source unchanged. The retained assertion showed236 added SDK-generated cache and
metadata entries (232 files, four directories,198854419 bytes). Complete before
vectors were not separately retained, so a truncated diff does not independently
prove every original input unchanged. The model server existed before the build,
but its failed-attempt counters were NOT_RETAINED; do not infer zero calls.

The successor keeps `build-input-inventory.mjs` and its default full strict
verifier byte-identical. A separate current-profile transition validator requires
fresh absent Eve/Nitro derived namespaces, then compares EVERY original entry
unchanged after the owned public Eve build. Only exact private directory
scaffolding, forty-hex-named `.mjs` files under
`apps/eve/node_modules/.cache/eve/authored-modules`, and the single Nitro
`last-build.json` are admitted as additions. Reject native files, aliases,
undeclared siblings, altered original bytes/modes, deletions and preseeded
namespaces. Metadata must have only a bounded canonical relative `outputDir`
spelling for in-app `.eve/builds/<generation>/output`. The pinned SDK publishes
that staging directory and then removes the entire generation, without rewriting
Nitro's metadata. Require that generation absent, canonical owned `.eve/builds`
parents and a canonical `.output` directory. Label the retained metadata an
inactive staging reference, never runtime output authority. A live or partial
generation, aliases or missing publication fail. This directory observation does
not prove the rename event or qualify output bytes; independent full output
seals, actual loaded-byte witnesses and public functional/accounting proof remain
mandatory. Bind the transition to the successful owned node/Eve command/log.

All generated JavaScript/data bytes, modes and paths stay in the FULL updated
input inventory and the derivation record. Subsequent Next/runtime/closure checks
require that whole inventory unchanged. Default strict verification never gains
a cache exclusion. Observed generated module loads carry a separate build-derived
label and transition hash; neither published-package origin nor returned-source
verification is invented. Eve source fallback remains denied.

Persist complete private initial/post-Eve/post-Next records (128MiB maximum,
mode0600, exclusive creation), plus bounded structured difference samples. A
failed build may obtain a read-only diagnostic snapshot; strict capture failure
is explicit unavailability. Diagnostic failures preserve the first command error.
Failed-attempt model counters come from live observed variables after close and
handler drain. Uncreated servers report unavailable counters; incomplete cleanup
reports a nonfinal snapshot. Counter-recording failure cannot replace the first
attempt error. Terminal private-failure serialization or write errors are appended
after the captured attempt/cleanup errors in the thrown AggregateError; neither
an existing evidence path nor an I/O failure may replace the original failure.
Error digests contain no raw model text or environment values.

The fresh r2 attempt stopped at the old metadata target-existence assertion after
the successful Eve build, before Next or public chat. Retain its failed result
and private roots. Full retained initial/post-Eve vectors show142581 original
entry records unchanged and236 additions with no removals/changes; observed final
HTTP/model counters are zero in r2. These observations do not fill r1's missing
vectors/counters or qualify a runtime. The corrected synthetic fixture follows
the public SDK's publish-then-remove order and reproduces the previous ENOENT.

This is source/synthetic correction only. Preserve all r1 evidence and exclusive
roots. No r1 install, artifact/helper qualification, build or PG retry is allowed;
any r2 requires exact successor review/commit, a new UUID, fresh plan/preflight
and separate root clearance. All previous financial/private/Work/tester/installed
and production holds remain unchanged.

## V5 full-review corrections — historical source preparation

Both complete V5 reviews remain REQUEST_CHANGES. External review identified seven
P2s; the independent own review corroborated late PG errors, late model state and
fast-exit output caps. The V5 immutable source and original 87 Node/7 Python
results, initial failed VM diagnostics and review reports remain unchanged.

The successor addresses the seven findings together. A start-attempt latch allows
physical control/PID-validated cleanup after partial pg_ctl startup; an unbound
partial start is UNKNOWN, never declared stopped. Every detached install/build/
runtime group has a private bounded persistent registry with its spawn PID/PGID
and OS birth identity. The outer operator reconciles open groups even when the
controller is killed. It signals only matching live leaders; reused PIDs or
leaderless unknown groups retain HOLD without a foreign signal. Normal controller
shutdown has thirty seconds before escalation; the overall controller deadline is
ten minutes inside the enclosing owner's fifteen-minute operation deadline.
Registry reconciliation
has at most three concurrently open groups and bounded TERM/KILL waits. Registry
files reject aliases, wrong permissions, oversized/partial records and replacement.
These are normal process observations, not a hostile-native sandbox.

The subsequent finite V6 review found one registry-type gap. The working
correction requires a regular pathname before open, then opens with no-follow
and nonblocking flags and requires an exact regular descriptor before reading.
Device, inode, mode, owner, size and timestamps must match; the bounded read must
be complete and both handle and pathname must remain unchanged. Invalid state
retains HOLD before process observation or signaling. Twenty focused synthetic
reconciliation cases pass, including fake nonregular objects and replacement
races; no actual FIFO or native process was exercised. Frozen V6 and its
REQUEST_CHANGES review remain unchanged pending exact successor acceptance.

External V6 review closed six V5 findings at source level and retained V5-02 at
the outermost profile owner. The working successor now explicitly grants the
native operator **420 seconds of cleanup grace**, independently of the operation
deadline, on interruption, timeout, log failure and live-group close paths.
Default build commands keep their existing three-second grace. Cancellation is
latched once; repeated outer signals cannot interrupt an ongoing native cleanup.
The native handler also records a first interruption during cleanup without
aborting that cleanup. Native ps and git observations have explicit deadlines.

The finite cleanup budget covers controller drain/wait35s, up to three registry
groups57s, cluster controls/stop165s, four port observations20s and final source
commands20s (297s total before margin). The outer supervisor must itself survive
the fifteen-minute operation deadline plus seven-minute cleanup and final bounded
pipe/group settlement; future execution preflight must honor that full budget.
If the native operator is forcibly lost, only its own process group is observed
empty. Wider detached/controller/cluster cleanup remains UNKNOWN/HOLD for the
surviving root owner to reconcile from exact owned evidence, with no automatic
retry, foreign signal or successful profile receipt. Eight pure full-profile
simulations cover outer interruption/deadline/repeated stop, interruption during
cleanup, premature close, forced loss and early native exit. Separate actual-body
Python simulations cover the native handler and registry descriptor checks.

Readiness now requires the actual loopback listener PID/group/birth and mapped
pinned Node executable before and after the probe, plus the selected SDK health
identity `workflow//eve//workflowEntry`. This identity comes from the authenticated
0.66.3 public health route's workflow reference (eve/workflowEntry); no private
SDK method is imported/invoked. Next may change process.title; its stable process
birth/group and mapped executable remain bound independently of that title.

The probe Eve port is now 3185, matching the current QE rewrite. A narrowly
projected transport seam permits the documented Eve service routes through the
owned web origin, including stream cursor query parameters, while keeping all
foreign/disabled endpoint denials. The public Client itself now uses the Next web
origin. A passive public Node HTTP observer, installed before the app through
createServer/syncBuiltinESMExports, records only nonce-tagged health/chat route
metadata. The proof requires the actual proxy health request and exactly two chat
POSTs at BOTH owned Next/Eve listeners. It never records cookies or request bodies.

Model handlers and both owned app processes must quiesce before the final live
model and authoritative PostgreSQL accounting join. Model state is checked again
after fixture shutdown. Pool/admin shutdown errors use the live error collection
after all awaits. The native command owner checks final file size after fast exit
and uses a bounded read; an oversized log cannot become a successful receipt.

Focused correction checks: 64 unique affected Node synthetic cases and 22 Python
simulated native-command/reconciliation cases pass (including overlapping affected
old lifecycle/precondition cases where source changed). Previously accepted
unchanged component and V5 checks are reused. No real child/native observer,
install/build, SDK/client/app import, registered app hook, PG, model network or
provider has run. The concrete inert Darwin plan now pins ps/lsof as well as
Node/npm/Python/PG, and still has pending source commit/tree placeholders. A Linux
x64 concrete plan and at-run qualification remain separate required work; source
portability and Darwin evidence cannot substitute for that result. Exact corrected
source/operator review, commit binding and fresh root one-attempt clearance remain
required before execution.


## Preserve Remotion's declared context with public build configuration

The pinned Eve 0.66.3 build loads the ordinary app-root `nitro.config.mjs`.
Nitro's pinned c12/defu merge preserves public `traceOpts.hooks` alongside Eve's
`traceOpts.nft.paths`. Nitro forwards the hooks to nf3 0.3.24. The canonical app
configuration adds one absolute entry through public `traceStart`: semver resolved
from Studio's installed package context. NFT itself follows that entry's real
transitive imports, including lru-cache and yallist. No SDK patch, private builder
call, manual package transplantation, or finished-artifact repair occurs.

The fourth fresh proof attempt found Studio 4.0.499 declaring semver 7.5.3 but
resolving emitted root semver 7.8.5. An absolute entry alone has no Studio parent.
The public `tracedFiles` hook therefore adds one explicitly declared Studio
package-metadata relationship in nf3's processed packaging graph before output.
This is not an observed import; original NFT reasons remain untouched. Under the
pinned multi-version writer's ordering, the single added Studio parent preserves
existing root semver 7.8.5 and gives Studio its own 7.5.3 alias. The real tracer
retains the semver 7.5.3 → lru-cache 6.0.0 → yallist 4.0.0 chain normally.

The narrow correction checks exact pinned metadata, canonical installed paths,
entry resolution, expected processed contexts, and hook order. Unexpected versions,
new transitive declarations, aliases, missing chain results or other new parents
fail closed and require another review. No SDK routing, plugins, environment,
credentials, policy, accounting or existing trace options are replaced. This
explicit compatibility boundary must be revisited with dependency updates.

Synthetic tests establish hook behavior and the pinned writer's ordering inputs;
they do not execute Nitro/nf3 or qualify an artifact. A fresh public build must
independently pass the unchanged full emitted-file/parent-context verifier,
complete seals and public functional proof. All four prior attempts stay FAIL.
The historical tokenizer guard and positive Work holds remain unchanged. Public
surfaces are [Nitro trace options](https://nitro.build/config#traceopts) and
[nf3 hooks](https://github.com/unjs/nf3#hooks); installed pinned source/types define
the actual compatibility boundary and merge semantics.
