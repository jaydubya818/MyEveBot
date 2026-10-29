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


## Synthetic public-client production origin contract

The fifth isolated run passed both public builds, full output/package guards and
owned Eve/Next/client launch, then failed `PUBLIC_LOGIN_FAILED` with HTTP403
before a model request. Its login response body was not retained; do not claim a
captured response error code. Native cleanup succeeded, while the controller's
separate runtime-close AggregateError remains recorded. The run stays FAIL.

The pinned Next16.4.3 `NextURL` normalizes numeric/IPv6 loopback names to
`localhost`, and `NextRequest.url` exposes that normalized URL. The unchanged
application guard deliberately compares exact production scheme, host and port.
The previous test client used a numeric wire URL and Origin, which mismatched
the routed localhost URL. A synthetic request running the unchanged pure guard
reproduces the same403 assertion; it does not repeat an actual login or import
Next, Eve, a retained artifact, or a database module. R9's successful browser
fixture already uses localhost on the web side.

The qualification client now uses actual `http://localhost:3188` wire URLs and
matching Origin for all web and public-client calls. The direct Eve address and
both actual listener bindings remain127.0.0.1. Existing transport rules already
allow both web aliases; no destination allowance is expanded. Full PID/birth,
listener, port, nonce, seal and database observations remain mandatory: localhost
alone does not establish ownership. No missing-Origin workaround, forged remote
host, environment normalization bypass, or application authentication/CSRF,
password, owner, accounting or policy change is introduced. The normal app Nitro
configuration and emitted graph guards from8b270a2a remain byte-identical.

The auth phase verifies unauthenticated denial, one successful login, exactly one
session cookie, and an HTTP200 authenticated owner-session status before using
the public Client. Owner headers are sent only after the cookie is acquired;
the public observation excludes cookie/password values. Failure does not retry
login or continue to model/session operations.
Fake HTTP tests cover canonical URL/Origin coherence, status failures, cookie and
owner/mode mismatches, early-stop phases and foreign/cross-site denial. These are
source/synthetic observations only. A new source-bound plan and fresh root-owned
full build/runtime attempt are required; none of the five old attempts is reused
or retrospectively qualified. The three unchanged turn/replay/health validators and
all earlier unrelated suites retain their prior evidence.


## Retained R6 agents-read failure and public Neon fixture configuration

R6 ran exact `1a81150927b9eddcceba15e1df131b7ce634e8ac` under consumed
clearance `1c0f94c3` and retained its failed private roots. Both public builds and
package/graph guards reached the runtime stage. Signed login, cookie and exact
owner status passed by selected source order; `/api/agents` returned503, with
`PUBLIC_AGENTS_READ_FAILED` at probe line133 before any model request. The root
result SHA256 is `d7a5338e288622619649f40e82488306c7a17995c55b74f6ec3abeef6ed7838f`.
The bounded Next log has `NeonDbError`, `TypeError` and `ERR_INVALID_URL`; raw
URLs, queries, credentials and private context remain withheld. Native cleanup
verified9OPEN/9CLOSED, ownedPG stopped, four ports clear and clean selected source.
The separate controller-close AggregateError remains retained; native cleanliness
does not erase that failure or award runtime acceptance. All six attempts remain
FAIL, with no automatic retry, real provider call or tester deployment mutation.

Static selected source explains the failure. Canonical agents reads use
`agent/lib/receipts-db.ts` and public Neon's HTTP query client. Neon's default
numeric-loopback hostname rewrite produces an opaque invalid URL. The original
fixture adapter can intercept that string before its own URL parse, but selected
Next's `createDedupeFetch` constructs `Request(resource, options)` before checking
POST and delegating to the adapter. The retained compiled frame matches this
normalizer. There is no evidence here of production database/schema/provider
failure. A cache/signal bypass or accepting503 would not qualify this contract.

The successor uses the documented public `neonConfig.fetchEndpoint` setter to
produce one valid opaque endpoint bound to the same owned app host and port.
Only the two selected copied SQL entry modules receive explicit configuration:
`agent/lib/receipts-db.ts` and `lib/threads-db.ts`. Each initializes its OWN
imported public config immediately before its own lazy `neon` constructor, so
Next/Eve bundled config objects and cross-route initialization order are not
assumed to be shared with the preload. Their canonical Git files, SQL bodies,
owner checks and database URLs stay unchanged. Unselected reminder/push stores
receive no overlay. Exact named store preimage hashes and the existing build
seam guard reject all other sources; the original five overlays remain declared.
The two additional named overlays are public fixture configuration only.

The projected transport uses the same endpoint statement and preserves exact
app connection-string/POST/endpoint validation. It executes only owned fixture
PG and returns the usual Neon-shaped JSON; it has no SQL HTTP listener. The
ordinary HTTP/Undici/Node allowlist remains unchanged, so missing the SQL branch
cannot send that opaque endpoint over the network. No installed SDK/Next patch,
Request replacement, skipped public route, direct probe SQL shortcut, new service,
owner change, guard weakening, Work grant or production recovery is involved.
Normal Nitro configuration and historical package/graph guards stay byte-identical.

The new32 pure seam tests use synthetic public-config objects, a fake pool and a
small authored Request-before-delegation model. They reproduce the old parse
failure before the fake adapter, exercise independent Next/Eve config contexts,
and cover exact owned SQL routing, host/port/database/credential/path/method
mismatches and zero outgoing HTTP. They verify canonical store tails and exact
named overlay guards. An initial test-harness type-erasure omission retained
13PASS/19FAIL; correcting only removal of the TypeScript non-null assertion
produced32PASS/0FAIL. Those counts overlap and are not additive. No installed
Neon/Next/SDK/artifact/helper was imported or evaluated; no actual SQL, server,
network, PG, provider or runtime attempt occurred in these pure tests. Earlier
39/30/45/68 and browser evidence are reused, not rerun or promoted to a current
artifact acceptance. A fresh root-owned reviewed commit/plan/preflight/separate
one-attempt clearance, actual R7 and cleanup are still required. All Linux,
private, paid, Work and production holds remain.


## Retained R7 usage failure and build/runtime installation binding

R7 ran exact `d69379a9b377d44e351f2c93cb16b9500a317ca3`, reached the public
runtime, and retained FAIL. Signed login, exact owner, direct/proxy health and
`/api/agents`200 with the expected active primary passed by selected source
order. The next initial `/api/chat-usage` read returned503 before any model call.
Root result SHA256 is `09c67a3b2f9b7ba24e8ffe80e5efede23225100e825f6432adc2216b06316692`.
Model observation was finalized:true with0HTTP/0probe calls. The short Next log
contains no cause; the route intentionally catches and withholds error details.
Native cleanup verified9OPEN/9CLOSED, ownedPG stopped, four ports clear and clean
source; the separate controller-close AggregateError remains preserved. All
seven failed private roots/logs/consumed clearances stay retained, never reused.

Static selected source identifies the installation binding before database work.
The usage route calls canonical `externalAlphaPolicy()` before `betaIntegration`
or any usage SQL. That guard requires `VERCEL === "1"`; the current base fixture
and runtime omitted it, and owned spawn receives exact env without ambient
inheritance. R9 explicitly set this flag and asserted its canonical policy before
starting servers. The status SQL branch already exists and is installed; no
schema, role, credential or accounting-recovery change follows from this503.

The base/build environment deliberately excludes VERCEL to preserve the selected
public node-server build. Its existing allowlist and
`BUILD_VERCEL_HOST_PRESET_REJECTED` guard remain byte-identical. Only the owned
runtime environment adds fixed `VERCEL:"1"` AFTER the builds. The base object,
canonical fixture, policy, SQL, database URLs, owner bindings and installation
limits stay unchanged. Explicit local workflow world/data directory/Eve base and
all transport denial remain; this local production-shaped flag does not imply
managed Vercel resources, paid authority or real installation qualification.
The existing strict200 initial usage assertion also gains the fixed
`PUBLIC_INITIAL_USAGE_READ_FAILED` label, without body capture or tolerated503.

The new28 pure phase tests passed on their first run. They extract only authored
base/runtime/build expressions and unchanged canonical policy/usage guards,
using synthetic values and built-in crypto. Schema/digest algorithms reuse prior
tests. Cases establish old config rejection before DB, runtime-only binding,
base immutability/build rejection, no ambient inheritance, retained local target,
owner/project/digest/slot/repository/key failures and unchanged public denial.
The positive guard test deliberately stops at a fake DB tripwire: no fabricated
accounting row, actual SQL, usage200, model or runtime PASS is awarded. No SDK,
Next, app module, artifact or helper is imported/evaluated, and no server/network,
PG, build, provider or production action is run. Earlier32/39/30/45/68 and browser
evidence remain reused, not rerun or added to the new-case count.

A bounded static check of usage/status setup, thread ownership/write, selected
agent/receipt context, explicit v4 fixture gateway, local workflow selection and
public two-turn/replay/persistence/accounting contracts identified no additional
concrete connected fixture defect. This cannot substitute for the next actual
runtime. A fresh root-owned reviewed commit/plan/preflight/separate one-attempt
clearance, actual R8 and owned cleanup remain required; all Linux/private/paid/
Work/production holds remain. Canonical policy and all package/graph guards,
normal Nitro configuration and the qualified public Neon fixture stay unchanged.


## Retained R8 stream failure and bounded diagnostic successor

R8 (source `8a795c8f`, fresh UUID `8f32fe6fd3984754b5abf3f34f7860d8`)
passed authentication, agents, initial usage HTTP 200 with zero counters, thread
PUT and public Client import/session creation, in exact public-driver order. The
first `response.result()` failed with ClientError; the Eve console retained a
TypeError / `fetch failed` in route authorization. No underlying cause or known
connection/transport-denial code is established by that retained console.
The explicit local workflow queue already uses POST to the exact owned
`/.well-known/workflow/v1/flow`, which is already permitted. Adding another route
or changing an SDK is not justified by this evidence.

The finalized model observation is one HTTP request / one probe, no failed or
unexpected requests and no active handler. That is not a completed reply, replay,
second turn or final accounting pass. R8 remains FAIL. Its root receipt is
`c73d457f9d7757a58630dafa2672ce9a6bea04f1d5c126163c8fab2fdf16b997`.

The successor adds qualification-only failure observation around the already
projected fetch adapter. It awaits the underlying fetch so asynchronous failures
can be recorded before rethrowing the *same* error. Diagnostics are capped at
32 records, four noncyclic causes and 16,384 UTF-16 code units of message input per cause. They emit
only fixed error classes/known code properties, message hashes, known owned
origin labels and route shapes (session IDs removed), booleans for query/fragment
presence and a fixed method. Unknown owned paths are hashed. URLs, credentials,
headers, bodies, arbitrary error messages/codes and session IDs are never logged.
Diagnostic failure cannot replace the original error. The HTTP allowlist, Neon
connection/endpoint/method checks and ordinary responses remain unchanged.
These diagnostics do not resolve the unidentified stream failure or award a pass.

R8 also retained controller EPERM from `process.kill(-ownedPid, 0)` during an
unguarded cleanup polling predicate. Its registry truthfully has nine OPEN and
six CLOSED records. The native outer owner independently reconciled the remaining
three groups as quiescent, stopped the owned PostgreSQL cluster, and root verified
all recorded groups absent, four ports clear and the source checkout clean.
Native cleanup has no errors; this does not erase the separate controller EPERM.
No historical CLOSED record or failure is rewritten.

The cleanup correction handles each liveness/signal failure per exact
spawn-returned child, preserves the original failure as UNKNOWN and continues
bounded cleanup of the other owned children. An unknown child receives no further
signals, no CLOSED record and no quiescence assertion. Every child's pipes are
destroyed and handle unreferenced in finally. EPERM is never treated as proof of
absence; there is no process-identity relaxation, foreign-group signal, `ps`
fallback or new authority. The original primary runtime failure stays first.

Thirty new pure synthetic cases passed on the author's first run. They evaluate
only authored diagnostic/projection and manager functions against fake fetch,
process groups, clocks, pipes and in-memory registry/files. They create no native
child, real signal, SQL request, server or network request and import no app, SDK,
controller or built artifact. Previous suites are reused without rerunning.
The same-allowlist assertion compares exact function text to the protected parent
preimage; it does not rerun historical transport cases. No actual runtime or
accounting pass is inferred. Existing independent finite review and exact source
binding are required before a root-owned fresh preflight and separate one-attempt
clearance. All eight failed roots, logs and consumed clearances remain preserved.
Production, real-provider, paid/private financial, managed-Vercel, Linux and
Work/Factory holds remain unchanged; neither active tester is modified.


### V17R2 repository-shaped pure-test correction

External finite review found V17-01 (P2): V17R1's new test unconditionally
read a packet-only `BASELINE_QE_SEAMS.mjs`. The flat review copy contained that
non-Git baseline, so its passing 30 cases did not prove the repository wildcard
command could select and run the test. V17/R1 packets and both original 30-case
results remain preserved as limited snapshot evidence, not publication proof.

The correction adds the exact immutable parent seam as a tracked test fixture:
`scripts/myapps-composition/fixtures/current-qe-seams-parent-8a795c8f.mjs`.
The test now reads that path and asserts its SHA-256 before extracting the pure
parent projection for the unchanged same-allowlist comparison. This adds no
application, transport, SDK, dependency, authority or network-policy behavior.
The candidate diagnostic and cleanup implementation bytes and all 30 assertions
remain unchanged. The normal repository wildcard and existing transport checks
remain unchanged.

The selected 30-case qualification runs from a fresh repository-shaped copy
containing only these five future-tracked paths: the new test, current seam,
process manager, tracked parent fixture, and the canonical
`apps/eve/test/owner-chat-only/transport.cjs`. There is no flat `BASELINE_*` file;
the existing canonical transport fallback must resolve as in a normal checkout.
Only extracted authored functions and fake APIs execute; no app/SDK/controller
import, adapter installation, actual child/signal/fetch/SQL/server/PG/network or
build occurs. Existing R1 results are not reclassified. Stream cause remains
UNKNOWN; this is still a diagnostic successor, not a completed chat or accounting
qualification. All eight actual failures and production holds remain unchanged.


## Grounded R9 pending-binding correction and ordinary CI fixture recovery

R9 remains FAIL, with root receipt
`ba1b24ab99a8f140a0294cc743f7fab2c5f859028554f53f487ca5db4302d12a`.
Its finalized model observation is one request / one probe, no failed or active
handler; there is no completed reply/replay/second-turn/final-accounting pass.
The controller retained EPERM and nine OPEN / eight CLOSED records; the native
outer owner independently reconciled the remaining group, stopped PostgreSQL,
and root verified four ports and all recorded groups absent. This does not
rewrite a CLOSED record or erase the controller failure. All nine failed roots,
logs and consumed clearances remain preserved.

The primary error is now grounded without exposing a response body or identifier.
The retained client HTTP500 body's `error` field hashes to the original ClientError
message `303f27336b30bbed54e8f4a96666f95d57a551876b242984b1716c1fc35a10b3`.
Its opaque `errorId` equals the server log's errorId on the exact canonical
`Error: Session ownership binding is not available yet.` message (hash
`96ad8c5107862b5d6d599d4d3698762821cfd3e790612343b4eb3fada984f34c`).
Only equality booleans and message hashes were emitted. The pinned public
ClientError constructor deliberately uses response JSON `error` as its message,
explaining why directly hashing the pending literal did not match the generic
client message. R8 contains the same canonical pending error. This new
correlation grounds the pending owner/session-binding branch; previous records
and their earlier uncertainty remain retained.

The pending error and routeAuth frame precede both owned workflow callback
ECONNREFUSED diagnostics in the retained R9 console order. There are no timestamps,
so primary-versus-shutdown causality of those callback refusals remains unproven.
No route, network policy, SQL endpoint or SDK implementation is changed on that
hypothesis.

The canonical owner guard intentionally rejects a stream whose create
acknowledgement precedes its server-written owner/session binding. It expects
bounded SDK stream transport retries, while the qualification driver had disabled
reconnect and therefore allowed only one initial opening. The correction supplies
only the initial sessions.create response stream with the public SDK's finite
opening policy: eligible HTTP status500, eight opening attempts, 250ms initial
backoff capped at1000ms, idle reconnect zero, and the existing30second signal.
The pinned SDK also retries recognized stream-opening disconnects within that
same finite read-only GET budget. It does not resubmit a create/message/resume,
refresh an auth nonce, or dispatch a model/paid operation. The other three
followup/replay no-reconnect policies remain exact. Canonical pending, owner and
thread authorization checks remain unchanged;401/403 and the other excluded
HTTP statuses are not made retry-eligible. A positive result still requires both
complete messages, fixed session/cursors/replays, exactly two model/accounting
operations, and zero Work/effects. Unknown failures cannot become a partial pass.

Ordinary hosted CI at782 has separate retained outcomes: the tooling step ran
475 tests with473 passing and two module-loading ENOENT failures, so it did not
execute the twelve cases in those failed modules. Both tests incorrectly read
an adjacent current-runtime-fixture.ts that is absent in Git. Their bootstrap
reads now use the existing canonical tracked
apps/eve/test/owner-journey/current-runtime-fixture.ts. Those five model-envelope
and seven cleanup case bodies and fixture guards remain exact. The later missing
Playwright executable followed a skipped installation step and is not a browser
behavior result. The private step24 metadata FAIL remains unread; no original
private campaign is retried or reclassified.

Three ordinary golden fixtures and the ordinary MissionControl consumer build
failed before their journeys at the same strict dependency alias guard. The exact
42-byte public expression `AssertionError: REMOTION_TRACE_INPUT_ALIAS` hashes to
`924d9cae2fa259c8946a4fb11b913b51d9a85044ae347762ab2fa830bc9b1451`;
the bracketed58-byte form hashes to
`b18065d4d72ff46cc34ffab36e7a69969423b0b5eadbc3de8808c37c8aa63b34`.
Earlier prose/hash-prefix mistakes remain retained and corrected. Both ordinary
fixture producers copied source but symlinked root and app dependencies back to
the host checkout, contradicting the new strict physical ownership guard.

The two producers now share a dependency materializer: it checks copied package
and lock bytes, physically copies the identical installed dependency files into
the owned fixture, uses filesystem copy-on-write where supported, and preserves
only relative internal workspace/bin links. It rejects escaping/absolute/dangling
links, redirected target parents, existing targets and overlapping roots. It
verifies the copied roots and final link targets inside the fixture. It performs
no install, SDK import, package rewrite, hardlink, executable launch or mutation
of source dependencies. The golden runner selects the same Eve and Next CLI bytes
from the materialized copy. The enterprise consumer producer uses the same helper;
no broader MissionControl behavior is changed. The public QE seam's exact runner
fingerprint is refreshed for this reviewed producer change; its preimage guard is
retained. Canonical Nitro config/test and every graph/alias check remain unchanged.

The author's first selected repository-shaped run passed45 cases:33 new cases
(19 initial-open/unchanged owner-guard cases and14 tiny-filesystem materialization
cases) plus the12 existing case bodies with corrected bootstraps. It copied only
13 future-tracked inputs into repository layout, with no flat baseline files.
It executes authored options/guard snippets, fake Client/query APIs and tiny owned
filesystem packages. It extracts the unchanged Nitro guard function, reproduces
the old alias rejection and passes that same guard on the physical copy; synthetic
package bodies are resolved but never loaded. No actual app, SDK, configuration
module, controller or built artifact is evaluated; no child/signal/PG/network/build
runs. This is selected source/synthetic evidence, not actual SDK retry, build,
browser, full wildcard, runtime or accounting qualification. Counts overlap prior
selected cases and are not additive.

The static whole-wildcard inventory distinguishes prerequisites rather than
calling the complete ordinary tooling command dependency-free: it imports the
existing pinned yaml parser, reads historical Git objects and pinned Factory
sources, can add Git objects via merge-tree in an owned fixture checkout, and
materialize.test creates an owned temporary Git repository and invokes the
pure authored composition CLI there. Other filesystem mutations are synthetic
temporary fixtures and transport/process tests use fake APIs. Root alone may run
the complete unchanged wildcard once after exact source closure with those
ordinary tooling prerequisites; the author has not run it. No cases or wildcard
selection are skipped, no dependency is added, and no app/SDK/PG/provider runtime
is thereby authorized. A fresh exact review/commit/plan/preflight and separate
one-attempt clearance are still required for actual current-SDK qualification.
All production, tester, private/paid, real-provider, managed-Vercel, Linux and
Work/Factory holds remain until their own required proof is complete.


## R10 strict transcript-value hashing and synthetic manifest caller correction

R10, source eb79db0f, remains FAIL. Its initial stream completed two actual deterministic model requests and two probe calls, with finalized counters and no failed/unexpected/active requests. The public driver exited zero after both exact ordered replay comparisons, saved-thread GET event deep equality, and two-turn usage checks. The controller then failed DURABLE_REPLAY_BODY at current-runtime-accounting.mjs:29: database thread.chat.events stringify digest 4351118f4b90239cb7fefbfedf98d97f1d736a211a8df32524196f627db7f012 differed from FINAL ordered public replay digest 539d542238768dc2e5cc2d391c9484c3de9b2ad9d3d10ec27a864a2d2a52108a. These are database versus FINAL replay labels, not first versus final response. Original failure evidence and the root correction sidecar remain unchanged.

Canonical web_chat_threads.chat is JSONB. PostgreSQL's JSON type documentation states JSONB does not preserve object-key order (https://www.postgresql.org/docs/17/datatype-json.html). A pure counterexample using the exact authored validator and its existing synthetic fixture reverses only object insertion order: all ordered arrays, keys, types, and values compare deeply equal, yet the old JSON.stringify hash rejects them. This establishes a hash-contract defect. The actual R10 database event vector was not retained by the failure path; its exact changed keys/content remain UNKNOWN. No retrospective runtime or accounting PASS follows from the counterexample or the new hash.

The candidate uses one shared internal strict JSON-value encoding for the complete ordered transcript in validatePublicReplay and the database comparison. It sorts only object keys and preserves every array position, object field, scalar type and value. It does not remove metadata, normalize strings, reorder events, or omit fields. Unsupported or lossy input fails closed: non-finite numbers, negative zero, undefined/functions/symbols/bigints, sparse or extended arrays, accessor/non-enumerable/symbol fields, cycles and custom-prototype objects. Getters and toJSON hooks never execute. This internal encoding is not a signed-document canonicalization standard. Existing public replay deep equality, cursor, event-ID checks and every model/owner/session/accounting/disabled-effect check remain unchanged; other raw diagnostic digests retain their meaning.

The ordinary verify failure is an older synthetic enterprise-fixture-manifest test caller missing root package/lock metadata and an installed dependency directory. The test now supplies matching tiny TRACKED package and lock files, a tracked node_modules ignore rule, and owned INERT text data under the source dependency directory created after its synthetic commit. Dependencies remain untracked and the target directory is not precreated. All original successful/failed instrumentation, original/transformed hashes, dirty-source and excluded-companion assertions remain; added checks verify inert bytes copied and source unchanged. No install, package code, SDK, app runtime, provider, database or network execution is part of this test. The actual dependency materializer, Nitro alias/graph guards and both ordinary producer bodies are unchanged by this caller repair.

Author selected regression result: 57 PASS, zero failures/skips, once from eleven exact future tracked files in normal repository layout: 33 strict transcript/replay cases, 23 affected accounting cases, and one affected manifest case containing two synthetic Git/FS preparation children. The controlled HOME/TMP and Git configuration prevent shared repository/configuration mutation. The initial receipt's TAP-only metadata parser did not recognize Node's spec reporter; a normalized receipt parses the SAME retained first-run log. This metadata correction did not repeat tests or change source. Full tooling/app/browser CI and actual current-SDK runtime remain separate root qualification gates.

R10 controller cleanup retains signal-zero EPERM for the Eve group: nine OPEN/eight CLOSED records. Native outer cleanup verified the remaining group quiescent, owned PostgreSQL stopped, four ports free and all recorded groups absent; those observations do not rewrite CLOSED or award controller cleanup PASS. Cause and normal-success controller close remain UNKNOWN. All ten failed roots, private evidence and consumed clearances remain preserved. This candidate changes no process permission, signal, liveness, PID/birth guard or cleanup behavior. A bounded secret-free per-event semantic-digest diagnostic was proposed outside Git but is NOT implemented.

Ordinary golden/E3 startup advanced, then first expected reply timed out after 90 seconds. The retained step logs alone do not establish its cause; no speculative product or SDK correction is included. The current MC compatibility browser result is a separately scoped PASS; broader MC remains deferred. No original private custody, financial, Work, real-provider, Linux, managed-Vercel, tester or production hold is removed. The new inert attempt plan requires an actual reviewed commit/tree, fresh preflight, independent binding review and separate root one-attempt clearance; no actual retry is authorized by source/pure acceptance alone.


### V19R1 bounded ordinary fixture call-site diagnostic

Operational question: which public runtime boundary emits the first-reply error in the ordinary golden/E3 fixture? The bounded ordinary logs and one finite authenticated PUBLISHED SDK literal-hash pass did not establish its cause: four hashes remained UNKNOWN, with two oversized nonruntime files explicitly unread. This is diagnostic instrumentation, not a product or SDK fix and not a runtime PASS.

By default no fixture enables these diagnostics. One reviewed environment setting in the existing owner-ux Start isolated unpaid journey fixture step yields exactly 1 for its fixed golden/e3 matrix values and empty otherwise. runner-prod.ts requires exactly that string 1 before adding fixed eve/next role flags to the two owned child environments; independent, composed and absent/unknown opt-ins remain off. The existing generated test preload conditionally installs a copied fixture-error-diagnostics.cjs companion. Build environments, the parent model/Factory server, canonical production code and other browser profiles do not opt in. The companion is tracked and explicitly copied; the synthetic enterprise manifest source tracks its actual bytes as data so original/source and transformed hash assertions continue to cover it. No SDK/package code is executed by that manifest case.

The console.error wrapper forwards the exact receiver and argument identities once and preserves its return value or identical thrown error. It adds only secret-free structured records: fixed runtime/boundary, per-runtime monotonic sequence, allowlisted error classes/codes, bounded message SHA256 with truncation, source classification/SHA256 and bounded line/column. It never emits exception objects, message text, arguments, bodies, source paths/URLs/functions, headers, environment values, credentials, owner/session/task identifiers or financial records. It reads own DATA descriptors only on non-proxied native errors, skips proxies/accessors/opaque objects, and never reads error.stack or invokes toJSON/custom inspection/coercion. Cause depth is at most two, with at most four error projections across four arguments. Node24's public util.getCallSites(12,{sourceMap:false}) avoids Error.prepareStackTrace and source-map file reads; at most six frames are projected. Official API: https://nodejs.org/docs/latest-v24.x/api/util.html#utilgetcallsitesframecount-options .

Each process attempts at most 32 records, emits at most 32,768 bytes total and at most 2,048 bytes per record, using synchronous writes to its existing stderr descriptor. Messages hash at most 16,384 UTF-16 code units and source names at most 8,192, with explicit truncation flags. Capture/write/install failures do not replace a console outcome or fail the product. No backend, collector, new dependency, new log file, request/model retry, transport allowance, or auth/accounting/graph/liveness change is added. The exact runner source fingerprint in current-qe-seams is updated, keeping the hash assertion and every other seam byte unchanged apart from one comment removing the obsolete claim that the runner itself is unchanged.

Author ONLY new/affected diagnostic29 PASS, zero failures/skips, once in ten-file normal repository layout before the additional default-off profile gate: 28 helper/preload/source-binding cases and the one changed manifest companion case. The helper ran only in a VM with fake console/errors/proxies/synchronous writes; a pinned public Node24 memory-only call-site case proved Error.prepareStackTrace is not invoked. The manifest used only its authorized disposable synthetic Git/FS children with inert dependency text. Then ONLY seven new activation/source tests passed once from four normal-layout source files, proving strict default-off flags, child environment preservation, the exact current runner hash and the exact one-setting workflow delta. The prior 29 were not rerun; their helper/preload/manifest bodies are unchanged, while final profile/source identity is covered by the seven and must be rebound in independent review. The previous 56 strict transcript/replay/accounting cases have unchanged source bodies and are reused; they were not rerun. Earlier V19 57-pass evidence and snapshots remain unchanged; the manifest case's latest body is covered by this 29-case run, not counted twice. Independent finite successor review and root full tooling/affected app checks remain required. Actual ordinary timeout cause, actual R10 database-vector difference and controller Eve EPERM remain UNKNOWN. The separate bounded transcript-digest proposal remains unimplemented. No actual SDK/app/controller/native operator/PG/network/build/model/replay or production action occurred during author validation.


The exact reviewed workflow exception is `.github/workflows/owner-ux.yml`, adding only MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS to the existing startup step with `(matrix.journey == 'golden' || matrix.journey == 'e3') && '1' || ''`. Removing that one setting restores parent eb79db0f workflow SHA256 d7a6536c990129c7947aa44040e60e34b9b3433fe8b78b950551d018f9f0c768 exactly; candidate SHA256 is 1f6b53de61aee2cb43c3593855c4898ca4bed706162ccfdcf401a1c4984a23a9. Matrix, jobs, permissions, refs, timeouts, services, private acceptance step, artifact paths, providers and every other environment value are unchanged. Historical inventories remain intact; no claim that every historical protected blob is unchanged is made. This explicit fixture-only workflow exception must be included in the release coordinator's historical/source join. The profile unit checks evaluate the fixed current lower-case matrix cases and a future-profile/empty case with fake data, not the hosted GitHub engine or arbitrary string-case semantics. No author workflow dispatch or actual diagnostic/runtime capture has occurred.


## Bounded build-command failure metadata

`observedCommand` makes a best-effort, first-write-only
`evidence/build-command-failure.json` beside the producer's existing private logs
when a command fails. Its UTF-8 contents are limited to 2 KiB and a fixed schema:
failure-only status, finite phase identifier, observed owned child PID, nullable
exit code/signal, and `QUIESCENT` or `UNKNOWN` cleanup state. No arguments,
environment, cwd, URLs, owner IDs, logs, error codes/messages/stacks, model or
database payloads enter this projection. Invalid or missing scalar observations
become allowlisted `UNKNOWN`/null values without coercing arbitrary objects.

The file uses exclusive creation and mode0600. Success emits no failure record.
Encoding/write failure cannot replace the existing thrown error or alter cleanup
ordering. A zero exit during an earlier timeout/output failure remains failure.
`QUIESCENT` requires observed exit/close, an existing ESRCH group observation,
no cleanup errors and successful registry closure when a registry was supplied;
permission/identity/stdio uncertainty remains `UNKNOWN`. No new process probe,
signal, retry, dependency, transport/auth/accounting change or resource allowance
is added. The controller can be killed before emitting metadata; a missing file
remains UNKNOWN. This prospective diagnostic does not identify a previous OOM
victim, qualify a runtime, or release any existing hold.

### Ordinary fixture owned-operation diagnostics

The approved Golden/E3 log inspection on da619b4f found only console text
records, not the original native Error. This visibility correction is not a
functional root-cause fix, a retrospective OOM diagnosis, or a runtime pass.

When the ordinary runner's parent opt-in is exactly `1`, a pure overlay checks
the complete SHA256 preimages of `agent/agent.ts` and
`agent/instructions/persistent-agent.ts`, then checks every replacement occurs
exactly once. Only the isolated fixture copy receives derived code. Tracked
production agent, instructions, authentication and accounting bodies remain
unchanged. All derived bodies are validated before any is returned to the
runner. Its exclusive mode0600 `fixture-operation-overlay.json` enumerates
original/derived hashes, fixed phase/provenance bindings and the companion hash.

The derived code observes INSTRUCTIONS, MODEL_SELECTION, MODEL_GENERATE and
MODEL_STREAM with ENTER/RETURN/THROW. Selection remains lazy inside each model
method and is invoked once; delegation receives the original options once.
Catches rethrow the identical original rejection after the existing delegated
accounting reconciliation. A MODEL_STREAM RETURN means construction returned,
not stream consumption, completion or successful authentication/accounting.
Errors outside these owned boundaries remain UNKNOWN. No speculative lifecycle
observer, SDK hook, SDK patch or production instrumentation is added.

Derived code requires the exact physical CJS companion also loaded by the
preload, rather than bundling a second instance or publishing a global API.
Only the exact runtime role `eve` can use operation observations after successful
preload installation. Builds, the parent model server, missing/unknown opt-ins,
Next operations and the independent/composed/native profiles remain off. The
native current-QE seam gets only its mechanically updated runner fingerprint;
it never applies this ordinary overlay. Missing/unusable optional companions
preserve the original callback outcome without diagnostics.

Console and operation observations share one module-level budget: at most32
attempted records, 2048UTF8 bytes per record and32768 aggregate bytes. Reinstall
does not reset it. Failed/partial writes consume the same budget and never
retry or replace the original console/callback outcome. Operation records use
only fixed phase/state/provenance, sequence and the existing finite native
Error classes/codes. Native errors/causes use own data descriptors only, with
the existing argument/cause bounds; proxies, accessors, opaque and non-native
throwables are not traversed or coerced. No error text or text hashes, stack,
callsite/source-map APIs, source paths/URLs, argument/context/environment/model
payloads or private identifiers enter the new records. The existing console
envelope remains version1 with empty frames and no message/source hashes; all
older captured evidence remains unchanged.

Author qualification: 52 targeted pure/VM cases,43 affected fixture/environment
cases and72 independent native transport/Neon/fetch regression cases pass,
167 unique tests across9 files, zero failures/skips/cancellations in final
runs. VM tests evaluate the two derived TypeScript bodies with Node24's builtin
type stripper and authored fake APIs; they import no Eve/Next/provider SDK or
app runtime. The enterprise manifest test uses disposable synthetic Git/data
children only. The initial52-case run's51PASS/1FAIL is preserved: Node's
assert.rejects inspected the adversarial proxy rejection. The test now captures
the rejection directly before checking identity; the diagnostic never invoked
that proxy. No actual build, database, network, browser, SDK, native profile,
CI publication or deployment was run. SAME independent source review and
successor-SHA qualification remain required; all prior failed attempts, frozen
source/image recipes, mandatory holds and active tester installations persist.
