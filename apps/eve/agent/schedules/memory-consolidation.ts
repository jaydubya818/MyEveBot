import { defineSchedule } from "eve/schedules";

import { ownerName } from "../lib/owner";

// Nightly review preserves source history. It cannot qualify learned behavior.
export default defineSchedule({
  cron: "15 8 * * *",
  markdown: `
Nightly memory consolidation. Review your long-term memory about ${ownerName()} and
tidy it. Work only through list_memories, remember, and forget; do not
message anyone.

1. Load memory visible to the primary Agent with list_memories. Never inspect another Agent's private scope.
2. Preserve repeated evidence and its source identity. Do not merge merely similar statements or discard their provenance.
3. Preserve contradictions. A newer observation is not automatically more authoritative. Never forget a conflicting fact simply because its timestamp is older. Ask for owner correction during the next relevant conversation when necessary.
4. Do not promote recurring observations into permanent preferences or procedures. Repetition is evidence, not evaluation or owner confirmation.
5. Do not rewrite or delete historical facts, corrections, or source evidence during consolidation. Current Truth and history are distinct.

This review grants no permissions and makes no policy changes. Feedback and
inferences remain candidates until separately evaluated and reviewed. Do not
save credentials or instructions to bypass safeguards. When no safe, necessary
change exists, finish without edits or a message.
`.trim(),
});
