# Unadopted productive pricing fixture proposal

Status: **PREPARED, NOT ADOPTED**. Requires canonical pricing and External Alpha
owner review of this exact test graph. The earlier admission-only fixture review
does not authorize this productive-transport fixture. No current production rate,
source successor, FactoryVersion, protected custody or release approval is implied.

## Smallest existing seam

The canonical `externalAlphaRuntimeComponents` already exposes `control`.
`CloudWorkControl` accepts `executionSpendPlan` as an injected instance dependency,
but External Alpha composition supplies the historical production plan. This
proposal binds a separate immutable test-only plan on that returned instance
**before any intake**, rejecting any instance whose plan is not the exact original
canonical object. Every simulated restart repeats the same binding.

The unchanged `ProductiveSandboxFixture` receives a copied module dependency
object containing the matching test price. Native Factory module exports remain
unchanged. Its upstream transport remains strictly
`https://deterministic.factory.invalid`, implements the exact trusted fixture
response, and has no live provider fallback. No canonical runtime, transport,
price card, accounting authority, SQL or production constructor is modified.

The real worker pins the canonical model literal, so changing only the test model
would create a false worker/gateway contract. This proposal retains that literal
and all numerical historical bounds while using revision
`fixture-offline-productive-v1` and a maximum five-minute fixture window.
Those copied historical numbers are test inputs, **not evidence of current
provider rates**. Real PostgreSQL time, authority expiry, reservation enforcement,
UNKNOWN semantics and all original fault assertions remain unchanged.

The fixture source identity is explicitly synthetic: it hashes the canonical
source identity together with the full fixture-pricing digest under
`TEST_ONLY_OFFLINE_PRODUCTIVE`. The resulting FactoryVersion is distinct from
the original installation. Passing this test graph qualifies its deterministic
mechanics, not the original production configuration or an executable release.
The existing application's synthetic policy/key fixtures bind this new identity.

The helper lives under `apps/eve/test/fixtures`, excluded from standalone source
packaging. It requires `NODE_ENV=test` and the existing explicit productive-fixture
opt-in. Its immutable price/plan preserve original inputs; tests reject expired,
oversized, inconsistent and already-mutated bindings.

## Qualification and external gates

The original eight productive-journey assertions are unchanged. Five formerly
expiry-blocked cases pass using the actual Factory control/spend/harness/custody
code, deterministic local producer and disposable PostgreSQL; three protected
custody tests retain their existing gate. The missing-custody negative case uses
an already cached isolated Docker verifier transport, no image pull or paid call.
Focused helper regressions cover fixture identity, numerical preservation,
expiry/opt-in/production denial, canonical price-plan consistency and immutable
exact-instance binding.

Before adoption, canonical owners must decide whether this existing instance
dependency seam is acceptable as an explicitly synthetic integration fixture.
If it is not, the minimal canonical interface would be a trusted composition-only
`executionPricing` bundle containing price, spend plan and identity digest, with
coherent configuration/FactoryVersion derivation. It must not be selected from
an HTTP request, installed app, owner input or an environment-only production
bypass. The production entrypoint must retain its pinned canonical pricing and
deny any fixture bundle; every provider/ledger/worker identity must agree. Such
an interface changes canonical runtime scope and is not implemented here.

After owner acceptance, independent security review, exact source identity and
hosted full PostgreSQL qualification remain required. The three protected tests
still require authorized independently controlled digest-pinned verifier input.
Nothing in this proposal obtains or fabricates that custody material.
