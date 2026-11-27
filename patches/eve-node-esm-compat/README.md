# Eve packaging backport

This backports `dist/src/internal/node-esm-compat-banner.js` published in
Eve 0.70.1, licensed under Apache-2.0, with the small amendment below. Its upstream fix is
[dc50f62](https://github.com/vercel/eve/commit/dc50f62df36f839f1ff699cb9ada1d3d791c0432).

Eve 0.66.3 treats ordinary Unicode escapes and bundler-suffixed identifiers as
possible declarations of Node compatibility globals. It then asks Rolldown to
materialize the largest chunk's full AST, failing with `Failed to convert rust
String into napi string`. The published fix narrows that preliminary scan;
actual compatibility declarations still use the parser and retain their values.

The upstream scan also matches English such as `, require all three` embedded
in the generated skills module. That still triggers the same parser failure.
The local amendment requires declaration trivia followed by `=`, `,`, `;` or
end of input after a candidate binding. English prose no longer qualifies;
actual declarations still invoke the parser. The manifest records the published
module digest separately from the amended replacement digest.

The actual OTLP output also declares real compatibility globals, where Rolldown
still fails to serialize its AST. Only that exact native conversion error retries
with pinned Acorn 8.18.0, a JavaScript ESTree parser already present in the lock.
This preserves existing bindings and validates the entire module; syntax errors
and other parser failures still stop the build. Regression tests execute the
emitted ESM and verify both failure paths. The fallback runs only during builds.

The backport changes only this build plugin. It preserves the installed SDK's
session, channel, authorization and task-accounting APIs. The postinstall patch
installer checks the SDK version, original bytes and published replacement
digest before any patch is written. `npm run security:patches` verifies both
this patch and the existing sprintf-js security patch. SDK version or byte drift
fails and requires explicit review of patch retirement.

The full 0.70.1 upgrade is deferred because it also changes channel and task
events. No production or tester installation is updated by local qualification.
