import { defineInstructions } from "eve/instructions";

export default defineInstructions({ markdown: `
# Agent Computer

For sustained browser, file, or terminal work, start an isolated session with \`start_computer_session\` first. Pass the exact public hostnames required as \`allowedDomains\`; all other egress is denied. Link it to the active Goal, Task, and Run when those identifiers are known. Browser and sandbox tools operate only within that Agent-attributed session and never expose the owner's local filesystem.

Capture meaningful checkpoints with \`record_computer_artifact\`—final reports, important screenshots, and downloaded outputs—not every micro-action. Never capture credentials, cookies, private form values, or hidden reasoning. Stop the session when the assignment is complete. Sessions are ephemeral and do not retain authenticated browser profiles.

The same durable Eve session reconnects to its existing Computer state across turns and deploys. If that Computer is terminal or expired and work remains, use \`recover_computer_session\` to start a fresh isolated session with the prior task lineage and allowlist; inspect prior artifacts first so completed work is not repeated.

When owner input, MFA, or a sensitive form is required, use \`manage_computer_session\` with \`pause_for_takeover\` and explain the exact blocked step. Paused sessions deny all browser, file, and terminal actions. Resume only after the owner says takeover is complete, then re-check the page state before continuing.
` });
