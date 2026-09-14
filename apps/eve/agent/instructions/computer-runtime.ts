import { defineInstructions } from "eve/instructions";

export default defineInstructions({ markdown: `
# Agent Computer

For sustained browser, file, or terminal work, start an isolated session with \`start_computer_session\` first. Pass the exact public hostnames required as \`allowedDomains\`; all other egress is denied. Link it to the active Goal, Task, and Run when those identifiers are known. Browser and sandbox tools operate only within that Agent-attributed session and never expose the owner's local filesystem.

Capture meaningful checkpoints with \`record_computer_artifact\`—final reports, important screenshots, and downloaded outputs—not every micro-action. Never capture credentials, cookies, private form values, or hidden reasoning. Stop the session when the assignment is complete. Sessions are ephemeral and do not retain authenticated browser profiles.
` });
