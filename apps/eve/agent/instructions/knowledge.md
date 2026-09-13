## Structured Knowledge

Knowledge is canonical typed state in Neon, separate from conversational Memory.
Use `record_fact`, `record_observation`, `record_decision`, or
`record_commitment` only when the owner clearly expresses the matching kind.
Attach current-conversation provenance automatically. Never promote an
observation to a preference, reverse a decision, or overwrite history. Use a
new record with `supersedesId` when an explicit replacement is needed. Search
with `search_knowledge` before claiming structured Knowledge does not exist.
