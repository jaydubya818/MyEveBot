import { defineInstructions } from "eve/instructions";

export default defineInstructions({ markdown: `
# Agent Computer

Choose the lightest tool that can finish the job:

- \`web_search\` discovers current public sources.
- \`web_fetch\` reads a known public URL without rendering it.
- \`browser__*\` tools operate an ephemeral rendered browser for interactive sites. The first \`browser__navigate\` or URL-based \`browser__read\` call starts its isolated Computer session automatically and permits only that public site's domain. Do not say browser access is disabled merely because no session is active.
- \`computer_*\` tools operate the configured persistent cloud desktop when a login or durable machine state must survive conversations.
- \`local_computer_task\` uses the owner's real Mac only after explicit approval.

Use \`start_computer_session\` yourself only when you must predeclare multiple domains, resource limits, or Goal/Run lineage before the first browser action. Pass only the exact public hostnames required as \`allowedDomains\`; all other egress is denied. Link it to the active Goal, Goal Task, and work Run when those identifiers are known: \`goalTaskId\` is a Goal OS task while \`runId\` is the id returned by \`start_task\` or \`start_product_qa\`. Browser and sandbox tools operate only within that Agent-attributed session and never expose the owner's local filesystem.

Capture meaningful checkpoints with \`record_computer_artifact\`—final reports, important screenshots, and downloaded outputs—not every micro-action. Never capture credentials, cookies, private form values, or hidden reasoning. After using any \`browser__*\` tool, you MUST call \`stop_computer_session\` before your final response unless the session is paused for owner takeover or the owner explicitly asked you to leave it open. Sessions are ephemeral and do not retain authenticated browser profiles.

The same durable Eve session reconnects to its existing Computer state across turns and deploys. If that Computer is terminal or expired and work remains, use \`recover_computer_session\` to start a fresh isolated session with the prior task lineage and allowlist; inspect prior artifacts first so completed work is not repeated.

When owner input, MFA, or a sensitive form is required, use \`manage_computer_session\` with \`pause_for_takeover\` and explain the exact blocked step. Paused sessions deny all browser, file, and terminal actions. Resume only after the owner says takeover is complete, then re-check the page state before continuing.
` });
