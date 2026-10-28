# Static artifact retention

`src/static-artifact.ts` retains exact bytes from the existing dashboard
`myeve.dashboard.build-inventory/v1` inventory. It is an internal integrity
component, not an App runtime, installation, producer Result or acceptance Proof.
It does not register a profile, expose a route, start a process or read a file.

The caller supplies independently trusted source commit/tree/lock pins and a
bounded retained-object reader. Before reading bytes, the component validates
one detached snapshot of the entire inventory, source pins, entry point, unique portable paths and byte
bounds. Each returned byte array must match the declared length and SHA-256.
Only after every file matches does retention return a candidate. The candidate
owns defensive byte copies and immutable metadata; reads also return copies.
Accessor-backed caller objects cannot change a path between validation and loading.
The inventory digest binds the exact inventory order and producer metadata.
The artifact digest binds source pins and the file inventory sorted by path.
Neither digest establishes owner authorization or independent verification.

Limits are 256 files, 8 MiB per file and 16 MiB total. Paths must begin with
`dist/`, contain only plain portable segments and have no traversal, percent
encoding, query strings, hidden segments or file/directory/case collisions.
There is no path normalization, URL decoding, disk fallback or network fetch.
An eventual disk-backed reader must independently prevent symlink and directory
replacement races; this component's reader interface does not claim that property.
Reader failures return a fixed opaque error. Inventory acceptance flags must
remain unsigned/unverified; an input cannot promote itself to accepted.

Actual hosting still requires the existing canonical owner/Agent/Work/Result
custody and independent-verifier bindings, an approved static runtime profile,
explicit owner installation approval, monotonic installation/delivery revisions,
served-artifact observation and qualified rollback. Current canonical Result
artifacts allow only Git commit/tree, patch and check logs. This component does
not extend that protocol or silently turn a build inventory into a signed
artifact-delivery claim. Executing generated browser code also requires an
explicit isolation and authorized data-access design before host integration.
The existing CRM and Alpha Tasks runtime/production guards remain unchanged.
