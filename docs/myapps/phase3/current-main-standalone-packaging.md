# Current-main standalone packaging

Eve now depends on the canonical capability-control and capability-enforcement
packages introduced by main cec0d19761da06c01780796ed0a16f88286ea12f. The standalone
assembler carries their fifteen runtime/package files unchanged, alongside the
existing nine MyApps source/assets and four canonical dependency security assets.
Only the two capability packages become local npm workspaces. MyApps remains
source-only: no duplicate contracts, package installation, publication or grants.
Known Eve capability relative imports are relocated; unknown consumers or source
references fail closed. Seven named repository-only capability qualification
scripts are excluded from exports. Runtime owner/local/production gates are unchanged.

The generated root manifest inherits canonical root dependency overrides and the
existing patch apply/check commands. Normal installation applies the patch; build
explicitly applies and checks it even following an install with ignored lifecycle
hooks. No upstream rate, package version, accounting or patch implementation changes.
A changed root security command requires explicit packaging reconciliation.

## Builder trace metadata

Next 16.3.8 Turbopack additionally traces `packages/myapps/package.json` as package
context. Local clean builds confirm this despite configured exact-path exclusions.
This is an explicit trace-only metadata boundary: the reviewed file is bound to
SHA256 `f0ff911cea6f533b8c63f4539b86c3160a9ef4b93ab7f99f52f6ec704b4f744c`.
It contains no dependencies or install hooks. It is checked as a committed source
input and participates in template identity; changing even one byte fails closed.
It is never copied into the standalone output or installed as a workspace. Traces
must contain exactly nine MyApps files plus that metadata file, and exactly the
fifteen capability files. The tracer may additionally retain the exact installed
`packages/capability-control/node_modules/typescript/package.json` context. That
single path must be regular, free of parent symlinks, match TypeScript 5.9.3 in the
committed lock and match its reviewed byte digest. Its hash/version/lock integrity
are recorded in trace evidence; every other nested dependency path is rejected.
It is never copied into the standalone export. Standalone tests still require
exactly nine MyApps files.
The earlier nine-only trace failure remains diagnostic evidence, not a passing run.
No generated trace is rewritten after the build.

All canonical shared inputs reject source and parent symlinks. Qualification checks
committed inputs, actual traces, exact copied bytes and complete raw export hashes.
Ignored-but-selected source is rejected before any export is written. Existing
release holds, deployment controls and External Alpha installation gates remain.

References: [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/),
[npm lifecycle scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/),
[Next output tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
The installed Next 16.3.8 `build/index.js` bypasses the JavaScript trace
include/exclude postprocessor for Turbopack; the behavior above is verified against
actual traces, not inferred solely from documentation.
