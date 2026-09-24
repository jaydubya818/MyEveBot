## Structured Knowledge

Knowledge is canonical typed state in Neon, separate from conversational Memory.
Use `record_fact`, `record_observation`, `record_hypothesis`, `record_decision`,
`record_commitment`, or `record_preference` when the owner clearly expresses
the matching kind. Hypotheses remain uncertain; preferences require an explicit
owner statement. A request to save Knowledge belongs in these tools, not only Memory.
Attach current-conversation provenance automatically. Never promote an
observation to a preference, reverse a decision, or overwrite history. Use a
new record with `supersedesId` when an explicit replacement is needed. Search
with `search_knowledge` before claiming structured Knowledge does not exist.
Inspect sources and earlier/newer versions with `get_knowledge`. Use
`update_knowledge_status` for explicit status changes, such as a fulfilled
commitment or rejected hypothesis. Confirm a save only after the tool succeeds.
