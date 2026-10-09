# EvidenceProvider consumer integration

Accepted source `721adc93af318ba341286074780330512b0be9d4` is adapted into canonical MyEve receipt custody, native Result/Proof and owner downloads. The Cloud adapter projects Test/Diff bytes from its existing durable private candidate bundle using the same EvidenceProvider contract. Factory adds a durable owner binding event at preparation and no migration. Historical attempts without that binding cannot expose evidence.

MyEve migration `0080_factory_evidence_custody.sql` is required to retain bounded immutable bytes independently of Factory cleanup. All preceding migration bytes remain unchanged. Proof references are attached only after scope/repository/Work/request/WorkOrder/Run/candidate/FactoryVersion/kind/digest/size validation and comparison to the admitted signed patch/check records. Collection is never a PASS verdict. Protected verification still owns criterion evaluation.

The Proof credential is independent, scoped, expiring and read-only. Renewal cannot change immutable execution authority. Transient transport failure leaves the candidate waiting, with no new execution; integrity failures require reconciliation. Downloads require authenticated exact Proof membership; partner reads additionally require the current explicit shared Result grant. No private data is promoted implicitly.

## Qualification

- Real local Factory HTTP/SQLite/Git → MyEve PostgreSQL bytes → protected Docker verification → canonical Proof: 19 PASS, 6 synthetic executions, no paid provider. Includes success/failure candidates, same-attempt credential renewal, cross-owner/cross-Work denial, byte immutability and readback after Factory evidence cleanup.
- MyEve evidence/scanner tests: 22 PASS. Cloud adapter: 3 PASS. Cloud ingress: 7 PASS.
- Actual Cloud HTTP evidence handlers against isolated TLS PostgreSQL: included in 22 PASS; exact production store lookup shape exercised.
- MyEve full unit: 2059 PASS / 94 gated skips. Types/governance and production build PASS. Factory types/governance PASS.
- Independent read-only review: PASS; 35 independently rerun checks. Four concrete findings resolved by sole implementer.
- Hosted assembled-source Cloud run: PENDING. Screenshot/BrowserJourney candidate evidence: NOT_RUN; optional for this release.
- Production deployment and first real-model canary: NOT_RUN. Platform deployment authorized only after remaining release gates; canary remains separately unauthorized.

Historical Proof is retained verbatim. Existing milestone tags and dirty primary checkouts are unchanged.
