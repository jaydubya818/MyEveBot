# Durable policy references

`@myeve/capability-enforcement/decisions` adds authenticated, immutable policy
evidence for isolated qualification. Apply `decisions.sql` manually after the
existing qualification migrations. No active installation was migrated.

The backend signs an exact challenge with a trusted installation key. The source
checks owner, organization, installation, agent, backend, Work generation, budget,
action digest, nonce, and a maximum 30-second lifetime. Owner identity and trusted
keys come from a server binding, never request fields. The existing canonical
resolver runs under the owner policy lock. Concurrent retries share one durable
decision; changed payloads, expired challenges, and stale policy fail closed.
Replay rechecks the database clock after waiting for the lock.

The source signs the decision and records it under owner/installation RLS with
immutable history. This is policy evidence, not a Work reservation or execution
ledger. All references explicitly state `admissionEligible: false`, receiving
revalidation required, and ordering qualification unavailable.

Cross-database transport and commit ordering remain unimplemented. A network
read followed by a remote database commit does not serialize a concurrent
disable. No API or backend is permitted to convert these references into an
execution grant. Existing co-located PostgreSQL admission remains the qualified
positive path.

The real-owner binding is still absent. Synthetic administrative records verify
all 36 enabled preference defaults, with qualification and backend authority
remaining independent. Local names and emails confer no privilege.
