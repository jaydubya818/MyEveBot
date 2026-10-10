# Locked tokenizer runtime packaging

The current-main production owner-journey build generated a 69,298,489-byte
server chunk. Eve's unchanged ESM compatibility plugin failed while converting
its parsed AST to a JavaScript string. Both locked and historical Rolldown
versions reproduce the failure on that chunk; neither parser is patched here.
The diagnostic serialized-byte count and V8 code-unit limit are different units,
so those numbers alone do not establish an exact string-limit overflow.

Eve 0.66.3's installed `docs/agent-config.md` and `AgentBuildDefinition` explicitly
support `build.externalDependencies`: named packages remain external and are
traced into the runtime output. The exact source overlay adds only the existing
locked `js-tiktoken` package to that list. The lock, tokenizer version/integrity,
provider pricing, accounting, owner controls and execution authority are unchanged.
Canonical and composed preimages, the one-hunk output, and the existing INTERNAL
inventory record are checked before any write; all previous governance checks run.

After the original production browser fixture builds, `verify-tokenizer-trace.mjs`
checks the actual parent-resolved Node dependency closure against the source lock,
package metadata and runtime file bytes. All tokenizer encoding files must match.
Only the exact unused `base64-js@1.5.1` browserify UMD artifact may be omitted:
Node resolves its unchanged `index.js`, with no browser or exports redirection.
That exception and its exact source hash appear in the receipt. Extra runtime
files, substitutions, missing files, changed versions and output symlinks deny.
All six encodings receive nine deterministic Unicode/text cases; token vectors
and decoded results must match the locked source implementation. No model is called.

The hosted gate runs before the existing six composer tests and unchanged E2
journey. Packaging success conveys no production enrollment, paid authority,
installation eligibility, merge permission or deployment permission.
