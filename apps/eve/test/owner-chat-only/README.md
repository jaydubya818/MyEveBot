# Current-profile chat-only fixture

**SOURCE CANDIDATE — NOT EXECUTED OR QUALIFIED.** This fixture requires an exact
independent source review and separate coordinator clearance before execution.
It does not authorize productive Work, paid calls, tester changes or deployment.

The runner exercises two synthetic isolated installations with application
passwords and durable sessions, real owner/Agent/context/model admission and
accounting, three text-only local deterministic replies per owner, persisted
history, idle offline/online, logout/login and owned-process restart. The current
Work tools remain absent and denied. No Factory, Result producer, custody service,
Work dispatch, new execution profile, budget override or application edit is used.
The original positive Work journeys remain failed/held and are not replaced.

## Source-bound operator contract

The coordinator supplies a private `0600` JSON file through
`MYEVE_CHAT_ONLY_FIXTURE_SPEC`. It must contain only:

```json
{
  "sourceSha": "EXACT_REVIEWED_COMMIT_SHA",
  "packageLockSha256": "EXACT_REVIEWED_LOCK_SHA256",
  "adminUrl": "postgresql://ux_fixture:local-only@localhost:OWNED_PORT/blocker_fixes",
  "clusterSystemIdentifier": "EXACT_OPERATOR_OWNED_POSTGRES_SYSTEM_IDENTIFIER",
  "outputDirectory": "/Users/jaywest/Myeve/output/OWNED_EVIDENCE_DIRECTORY",
  "ports": [
    {"web": 3183, "eve": 3185, "model": 3184},
    {"web": 3193, "eve": 3195, "model": 3194}
  ]
}
```

These example ports confer no ownership. The operator must own the selected
disposable PostgreSQL cluster and reserve/check the six distinct free HTTP ports
without stopping other services. The cluster identity, role, database, local URL,
source SHA, clean worktree, source ancestry and lock are checked before creating
test data.
The output directory must be a fresh, nonexistent child of an existing owned
evidence parent. Exclusive creation rejects reused attempts and symlink targets;
canonical-parent checks reject paths escaping the evidence roots. Existing
failure artifacts are never overwritten. Source SHA, tree, clean status and lock
are checked again before any passing receipt, and screenshots record actual
source/tree with drift marked non-authoritative and failed.
Browser config, assertions, provenance and their layout helper run from the
committed copy. Their exact committed hashes are verified before launch, when
capturing screenshots, and before a passing receipt; a moving operator checkout
cannot silently supply different browser assertions.

An IPv6-only owned cluster may use the existing pg URL
`?host=%3A%3A1` parameter with `localhost`; it may not point at another service.
The runner does not pull images, install dependencies, link Vercel, load `.env`,
request OIDC, discover live projects, or create a new branch.

Only after the separate execution clearance, from `apps/eve`, the operator may
invoke the reviewed `runner-prod.ts` with the existing `node --import tsx` loader.
The runner owns its temporary source copies, HTTP servers and child PIDs. It
creates only random `ea_work_...` databases on the already identified owned
cluster. If existing `Env.create` fails before returning ownership, cleanup is
reported incomplete and the operator must remove its own disposable cluster;
the runner never scans or drops an unowned database to repair that failure.

## Explicit fixture seams

- Copy regular committed blobs using `git ls-tree`/`git cat-file`; no untracked
  source, `.env` files, retained builds or working-copy byte substitution.
- In each isolated copy only, replace the single `ai` gateway import in
  `lib/external-alpha/model.ts` with the committed local fixture gateway. Both
  generation and model catalog/pricing are local. Application auth, context,
  model filtering/response validation and accounting remain unchanged.
- Replace copied `next.config.ts` with an explicit rewrite to that installation's
  owned Eve service. Build Eve and Next separately in production mode. No
  `withEve` deployment, prewarm or production project operation is requested.
- Pin the public `WORKFLOW_LOCAL_BASE_URL` to that installation's exact owned
  Eve `http://127.0.0.1:EVE_PORT` origin for both build and runtime. Self-hosted
  Eve requires workflow callbacks as well as `/eve/` routes. The transport admits
  only `POST /.well-known/workflow/v1/flow` on that origin, without a query or
  fragment. Other origins, ports, callback paths and methods stay denied; no
  external queue, fake run binding or ownership-guard bypass is used.
- In the copied layout only, replace the Google font import/declarations with
  public `next/font/local` calls. Reuse the exact installed Next16.4.3 bundled
  `Geist-Regular.ttf`, SHA256
  `bde046ddd9f20be35b0bd56cc79eb752b967fb6661a3fe76cb067bb09f871d76`,
  for all three existing CSS variables. Record the layout before/after and asset
  hashes. The committed production layout/fonts and external transport denial
  stay unchanged. This qualifies functional fixture behavior only, not production
  Google font loading, original font metrics or visual equivalence. A different
  asset fails closed; no network fallback or dependency patch is allowed.
- Preload this fixture's committed `transport.cjs` with a private exact-topology
  descriptor. Its app Neon HTTP adapter accepts only the exact app connection
  and literal SDK-derived endpoint, checking these before ordinary URL parsing.
  The SDK's normal Neon host rewrite need not form a valid URL for numeric
  loopback hosts; the exact bound adapter request goes only to native owned pg,
  never HTTP. Every other fetch retains URL/method/route restrictions.
  Central accounting and BetaIntegration use their actual
  native pg pools, with the exact owned central/app URLs supplied to the child.
- The transport checks owned socket ports and private IPC paths and wraps
  Node HTTP, fetch and Undici destinations/methods/routes. It is an application
  transport tripwire, **not an OS sandbox or proof about arbitrary native code**.
  It does not inherit the owner-UX fixture's broad-loopback/blob/3174 seam.
- Reuse existing canonical migration and central SQL. All three scaffold calls
  are `Env.create(false, overrides, false)`. Local narrowing and central member
  bindings precede separate local-policy and central-cohort activation. No
  legacy `Env.activate`, unused local central ledger, trigger suppression,
  privilege change, clock rewrite or quota refund is used.
- Installed dependencies are reused through explicit node_modules symlinks.
  The source lock is bound, but the runner does not independently qualify or
  mutate that installed dependency graph.

Actual source/seam hashes, topology and SQL hashes are written to
`source-seams.json`. Passwords, keys, tokens and URLs remain in private temporary
configuration and are deleted at cleanup. Diagnostic child output is bounded and
redacted. Browser tracing/automatic screenshots are disabled. Playwright still
writes automatic error-context snapshots that can contain a filled password;
all automatic artifacts therefore stay in private owned scratch directories.
Never promote raw failure contexts to shareable evidence. Only bounded redacted
child diagnostics and deliberate post-login screenshots go to the evidence
directory, with source-bound chat-only provenance for those screenshots.
A source review is not an executed pass result.

## Assertions and honest scope

Each owner submits three messages once: a unique planning marker, a follow-up,
and a request for unavailable booking/card/Work actions. The deterministic adapter
is installation-bound by its owned endpoint and configuration, never by prompt
identity. It checks mandatory instructions, no foreign marker, the actual tool
list and bounded context; it returns text only and zero known synthetic cost.

The browser checks real login/hashed credential/version binding; user submission
separately from reply completion; same thread/session persistence; the actual
quota UI/API; no Work effects; `/work/new` denial; refresh, idle reconnect, fresh
tab, logout/login and process restart without new model operations. Exactly three
local SOFIE operations and central CHAT dispatches per owner must be settled.
Reservations remain $0.30 per owner despite zero synthetic measured cost. Daily
counts use the observed server UTC day; crossing midnight does not rewrite history.

Both sessions perform a successful own read before foreign thread-ID checks at
their own origins. Foreign thread 404 is labeled separate-database topology
coverage. A known owned session with a wrong thread must receive explicit 403;
an absent session's generic 500 is never an isolation pass. Query owner overrides
must not expose the other installation; the browser-owner header mismatch is a
separate 401 check. Known-foreign same-store owner and foreign-cookie campaigns
are not claimed or added. Existing executable guard tests remain separate evidence.

A failed submitted turn fails this fixture: no retry, new admission, UNKNOWN
reset, replay/exhaustion or financial stress campaign. Reads/restart preserve
identities, credential versions, activation times and ledger records. Cleanup
removes only owned test resources. The receipt distinguishes incomplete cleanup.

Deterministic text does not qualify live-model judgment, billing, truthfulness or
preference-following. This fixture clears no positive Work, Relay composition,
producer/Proof/private custody, installed OIDC, three-user, paid execution or
production activation gate. Existing CI workflow/matrix/gates are unchanged.

## Pure metadata contract stage

`ci-entry.mts` is a stateless supplied-record validator. Its name does not make
it an entry point: it has no CLI branch, observer, operator-spec writer, runner,
filesystem/environment access, subprocess, network, SQL, browser or app/SDK I/O.
It imports only pure Node utilities and hashing. Matching records return
`MATCHED_SUPPLIED_METADATA` with `executionAuthorized:false`,
`runtimeQualified:false` and `artifactPublicationAuthorized:false`.
Caller-created JSON, matching self-observed HEAD, local URLs and environment
flags do not establish provenance or authorize anything. Missing/unmatched
facts remain fixed `UNKNOWN_HOLD` classifications; missing counters are not zero.

The four validators compare separately supplied event/checkout/run/service,
image/mapping/tool/cluster metadata; physical file identity before/after;
bounded finalization timestamps/counters; and the exact three proposed public
metadata records. They never observe those facts themselves. Fake clocks and
operations in the unit tests demonstrate rules only, not CI ownership or cleanup.
Source matching requires `checkoutClean:true` in the same fresh observation;
missing, dirty, unknown or nonboolean cleanliness cannot match commit/tree/lock
metadata alone.

Finalization requires admission stopped and setup settled with no late
registration; app/browser writers and model handlers settled; immutable final
database/Work/accounting snapshots captured **before** pools close and databases
drop; cluster/session checks and bounded nonforce cleanup; then a join with
post-cleanup source observations. A late setup, nonsettled operation, missing
registry after spawn, unknown identity or original failure remains HOLD. Proven
no-spawn is distinct from a missing ownership record. A race or CI service
teardown is not application cleanup. The existing runner/setup are unchanged
and do not yet implement this proposed order or ownership protocol.
Supplied database evidence must contain the exact unique returned, registered
and dropped name sets (at most three names), zero unclaimed partial creates and
unknown resources, and explicit `NONFORCE` cleanup. Missing evidence, substituted
or unregistered cleanup targets and `FORCE`/`UNKNOWN` cleanup remain HOLD.
Process-group peaks must agree with each other and the total spawned count:
zero spawn requires zero activity; positive spawn requires activity and cannot
also claim proven no-spawn. The three-per-slot and five-total caps still apply.

Public candidates are limited to `chat-only-v1-result.json`,
`source-identity.json` and `assertion-results.json`: at most65,536UTF8 bytes per
file and131,072 total, exact regular owned no-link identity, readonly mode,
stable inode/time/bytes and fixed canonical schemas. All writers must have
settled before finalization. Unknown fields, error text, contexts, credentials,
URLs/runtime identifiers, raw logs/trace/screenshots/HTML, prompt/environment
hashes and runtime-dependent code hashes are excluded. An approved deterministic
code preimage/review must be supplied separately; a key named code hash is not
provenance. These checks grant no upload authority, even for matching candidates.
Existing screenshot/provenance/raw-observation files stay private and are not
covered by this proposed allowlist. Optional diagnostics remain **OFF**.

Before any observation, the coordinator must review a separate exact observer
source and finite plan with pinned tools/argv, trusted source and one declared
CI-owned service selector, selected fields/read-only metadata queries, private
evidence paths, time/byte limits and failure obligations. Actual service
ID/image/DNAT/systemID, copied executable/browser selection, loader behavior,
descendant closure and nonforce cleanup are unobserved. No local auto-clearance,
service discovery, privilege/configuration repair or new service is permitted.
Observation authority, implementation authority and runtime qualification are
separate later gates. The original Work obligations stay failed/held; this stage
creates no workflow, chat PASS, productive grant or production/tester change.
