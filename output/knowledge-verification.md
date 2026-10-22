# Sofie Knowledge verification

Verified against the running Sofie checkout at `/Users/jaywest/Documents/ChatGPT/New project/myeve-protocol-convergence`, served on localhost:3001.

## Results

- A real authenticated Sofie model session called the six record tools and saved Fact, Observation, Hypothesis, Decision, Commitment, and Preference records. Every record included conversation provenance.
- All six categories displayed their saved records in the browser with the correct detail panel. Verified hypothesis test criteria, observation count, decision rationale/alternatives, preference value/scope/origin, and fulfilled commitment status.
- Live API verification passed for category, search, and status filters; commitment fulfillment; decision replacement with bidirectional version references; source retrieval; and unauthenticated request rejection.
- Database integration tests exercised all six real tool handlers, search, inspection, valid/invalid status changes, guest-write rejection, owner isolation, provenance, and relationships using temporary isolated owners.
- Empty search state verified in the browser. Category changes cleared the previous selection.
- Production build and TypeScript compilation passed in the running checkout. Its capability registry and executor governance checks passed.
- Eight owner-knowledge tests and three knowledge-type tests passed.
- All seven live synthetic records (six originals and one replacement) and their unused test provenance were removed. Existing owner records were not changed.

## Fixes

- Added missing record_hypothesis and record_preference tools, plus get_knowledge and update_knowledge_status for inspection and lifecycle changes through chat.
- Registered the tools and updated structured Knowledge instructions and governance fingerprints. Writes retain authenticated owner/Agent capability checks; preferences require explicit owner statements.
- Included commitment subjects and preference keys/values in search.
- Fixed stale tab/detail responses, deep-link category initialization, refresh behavior, and detail error recovery.
- Displayed full commitment/preference statements and changed conversation provenance links to the /chat route.

The changes span tools, their registry/instructions, shared Knowledge search, the UI, and verification tests because the requested feature crosses those layers. No schema migration was required.

## Limits

Browser control stalled before direct-link and history-button navigation could be verified interactively. Version history itself passed the live API and database tests. No claim is made that those two browser interactions were tested.

The main workspace's broad capability-registry check encountered a separately present `agent/tools/remember.test.ts` file and treated it as an unregistered tool. The active running checkout's registry check passed. That unrelated test file was not changed.

Knowledge remains separate from conversational Memory: existing memories are not automatically reclassified or imported into these six categories. Empty categories are valid until structured records are explicitly saved.
