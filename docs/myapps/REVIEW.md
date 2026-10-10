# Independent foundation review remediation

The owner authorized one read-only independent security/architecture reviewer.
It reviewed MyEve `ec5a9a538fc95e7b28e51be28f587254e68e7e17` and MyFactory
`d779b997ed4296c8a54dec8b9a5df01fe29f5123`, including implementation, contracts,
tests and saved qualification. Initial verdict: FAIL, with no critical/high
findings, five medium findings and one low finding. The main implementation
thread made the corrections below. The reviewer made no source changes.

References below identify the original reviewed revisions, not moving line numbers.

| ID / severity | Original reference and evidence | Remediation and regression |
| --- | --- | --- |
| R1 / Medium | MyFactory `packages/app-builder/src/myapps/result.mjs:160`: signed FAILED/CANCELLED outer Result with embedded PASS report accepted as App verification. Reviewer reproduced FAILED acceptance. | Require canonical Result status COMPLETED before extracting App verification. Canonical validator requires successful required checks. Tests re-sign FAILED and CANCELLED envelopes and require denial. |
| R2 / Medium | MyFactory `packages/app-builder/src/myapps/controller.mjs:143,343,360`: durable generation control checked before asynchronous authorization; completion persisted without transactional control check. | Recheck after authorization and inside candidate/verification write transactions. A second controller disables generation while admission, custody or final verifier authorization is pending; none can yield a new candidate/PASS. |
| R3 / Medium | MyEve `packages/myapps/prototype/app.js:82`: owner switch preserved grounded notice and allowed old asynchronous responses to render. Browser reproduced Acme notice under Owner B. | Clear all owner state and dialogs, serialize login submission, and fence responses by owner generation. Same-browser tests hold query, render and preview responses across owner switch and require no prior-owner data/dialog/error. |
| R4 / Medium | MyEve `packages/myapps/src/store.ts:179`: registration rejected a revoked exact base, making installed-version repair impossible. | Permit immutable revoked lineage while denying old runtime access. Regression requires separate verification, preview and human approval of successor; wrong base, agent approval and old runtime remain denied; data and Proof preserved. |
| R5 / Medium | MyEve `packages/myapps/src/contracts.ts:348`, `src/store.ts:174,494`: immutable failed candidate plus immediate-predecessor base rule stranded initial creation and later updates. | Separate sequential candidate attempts from exact installed base. FAIL/UNKNOWN initial and update tests preserve failed history while a new candidate installs against the current base. Real Factory UNKNOWN recovery builds and verifies the later candidate. Browser confirms retry v2 is offered as first installation. |
| R6 / Low | MyEve `packages/myapps/prototype/app.js:122`: every version unequal to installed version offered a preview, including historical v1 after installing v2. | Inventory filters exact applicable base, newer version, verification and preview validity. Golden journey confirms no stale update offered after v2 installation. |

The corrected scope remains a deterministic reference. No production adapters,
deployment, paid provider execution, App publication or external-alpha changes
were introduced. Generated declarations remain inert. Identity migration is the
only permitted migration. MySkills contracts and dependencies remain unchanged.

Final acceptance requires fresh qualification, exact hosted CI and re-review of
the final two commit SHAs by the same independent reviewer. This document records
implemented remediation; it does not itself assert final foundation PASS.
