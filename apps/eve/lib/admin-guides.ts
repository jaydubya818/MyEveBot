/** Owner-facing guidance. These articles describe controls; they never execute actions. */
export interface AdminGuide {
  id: string;
  title: string;
  summary: string;
  sections: { title: string; body: string; steps?: string[] }[];
  links: { label: string; href: string }[];
}

export const ADMIN_GUIDES: AdminGuide[] = [
  {
    id: "start", title: "Your first useful conversation", summary: "Check setup, try a small task, and know what success looks like.",
    sections: [
      { title: "Start with one clear outcome", body: "MyEve is your workspace. Sofie is your personal Agent. Start with a small, read-only task before connecting accounts or scheduling work.", steps: ["Open System and run the service checks. A service can be configured without being reachable.", "Start a new chat and ask: ‘Reply with: My first chat works. Do not use tools or save anything.’", "Wait for a complete response. A loading indicator or tool input alone is not a successful result.", "Try a real task: ‘Compare these two options. Give me your recommendation, supporting evidence, and what is uncertain. Do not take actions.’"] },
      { title: "Give Sofie a useful brief", body: "Include your outcome, relevant context, constraints, and what you want back. Say whether you want a draft, a saved record, or an action. For example: ‘Draft a three-step launch plan using only the facts below. Flag missing information. Do not save or send anything.’" },
      { title: "Know when to approve", body: "Read the exact action, recipient, and content before approving. Click the approval control once and wait. Repeating the prompt is a new request, not a reliable way to resume a pending action. If the state looks stale, refresh and inspect Activity and Approvals before trying again." },
      { title: "When the first chat fails", body: "‘AI Gateway received no credentials’ means model authentication is missing. A reachable model catalog does not prove inference works. Ask the deployment administrator to restore authentication in the process that runs the model; never paste credentials into chat." },
    ], links: [{ label: "Check System", href: "/manage/system" }, { label: "Open chat", href: "/chat" }, { label: "Setup checklist", href: "/manage/getting-started" }],
  },
  {
    id: "settings", title: "Find the right setting", summary: "A plain-language map of the admin workspace.",
    sections: [
      { title: "Set up your workspace", body: "Getting started suggests a first task. System checks dependencies and operational health. Appearance changes the theme; names come from deployment configuration. Connections links apps and accounts. Agents manages persistent identities and reusable roles." },
      { title: "Understand and manage information", body: "Memory lists remembered context. Your data brings together Memory and Knowledge review, provenance, and backup tools. Skills contains reusable procedures. Decision Intelligence shows experimental Jev evidence; it does not grant permissions or automatically change Agent behavior." },
      { title: "Choose how work reaches you", body: "Briefs & reviews controls scheduled digests, timezone and quiet hours. Reminders lists time-based follow-ups. Triggers lists event-driven work. Routines reviews recurring work and its required capabilities. Slack, iMessage and Phone appear according to what the deployment includes." },
      { title: "Review work and authority", body: "Approvals is for exact pending decisions. Control Center shows actions and live controls. Activity shows task history and evidence. Relay controls peer relationships and external sharing. Finance lists recorded receipts; it is not a banking or payment console." },
    ], links: [{ label: "All settings", href: "/manage" }],
  },
  {
    id: "health", title: "Setup and service health", summary: "Understand configured, reachable, disabled, and failed states.",
    sections: [
      { title: "Read status in context", body: "Configured means setup is present. A health check verifies only the operation described beside it. For example, model catalog access does not verify a paid model invocation. Not configured means setup is missing; disabled means the deployment intentionally prevents execution." },
      { title: "Run checks before changing setup", body: "Use System → Run checks to refresh dependency status. Review the failing service and the operation it checked. Do not reconnect every account or reset data because one dependency failed.", steps: ["Check the affected service and its explanation.", "Retry a harmless operation once after the dependency is repaired.", "Inspect Activity for the original attempt before repeating an action that could send, save, or spend."] },
      { title: "For the deployment administrator", body: "Model authentication belongs in the process performing inference. Local installations may run a separate Sofie engine. Use the approved process-scoped VERCEL_OIDC_TOKEN or supported scoped AI_GATEWAY_API_KEY mechanism. Never put credential values in chat, screenshots, source control, or diagnostic reports." },
      { title: "Operational warnings", body: "Failed turns and stuck Runs need investigation; they are not instructions to restart everything. Old history may describe a past state. Inspect the current Action and its parent Run before attempting recovery." },
    ], links: [{ label: "Run System checks", href: "/manage/system" }, { label: "Inspect Activity", href: "/manage/activity" }],
  },
  {
    id: "connections", title: "Connect apps and channels", summary: "Connect only what a task needs and verify the account you selected.",
    sections: [
      { title: "Connect an app", body: "Connections lists available app integrations and linked accounts. Connecting an account and granting an Agent authority are separate decisions.", steps: ["Choose the app needed for your task.", "Review the provider’s account and permission screen before accepting.", "Return to Connections and refresh the account list.", "Try a read-only request first and confirm it uses the intended account."] },
      { title: "If Connections is unavailable", body: "An unavailable connection service is not an empty account list. Retry loading. If it still fails, ask the administrator to check the connection provider and its configured credential. Repeatedly connecting accounts will not repair a provider outage." },
      { title: "Messaging channels", body: "Slack requires deployment setup before mentions, direct messages and reaction rules work. iMessage requires a reachable router and owner pairing. Phone availability depends on the deployment. Connecting a channel does not remove approval requirements for sensitive actions." },
      { title: "Disconnect carefully", body: "Disconnecting can interrupt tasks and routines that use that account. Review dependent work first. Never share account passwords or verification codes in a normal Agent conversation." },
    ], links: [{ label: "Open Connections", href: "/manage/connections" }, { label: "Slack setup", href: "/manage/slack" }, { label: "iMessage setup", href: "/manage/imessage" }],
  },
  {
    id: "agents", title: "Agents, roles, and skills", summary: "Choose an identity, define its job, and keep access bounded.",
    sections: [
      { title: "Choose a role or create an Agent", body: "A role is reusable expertise for bounded work. An Agent is a persistent identity with instructions and settings. Use a role for a one-off task; create an Agent when you need a recurring specialist." },
      { title: "Configure deliberately", body: "Give the Agent a clear purpose, instructions, model preference, risk ceiling and runtime limits. Review capabilities individually. A role name does not grant access. Unavailable or higher-risk capabilities may be disabled in the form." },
      { title: "Verify before expanding access", body: "Open the Agent and try one harmless task. Inspect Activity and the returned evidence. Raise limits or permissions only to support a concrete job. Pausing or archiving an Agent affects ongoing use, so review its work first." },
      { title: "Skills are procedures", body: "Search Skills by name or scope, read the procedure and its provenance, and inspect routing evaluation status. Package validation is not proof that every behavioral evaluation passed. Assignments apply as described in the interface; do not assume an existing conversation immediately inherits changes." },
    ], links: [{ label: "Manage Agents", href: "/manage/agents" }, { label: "Browse Skills", href: "/manage/skills" }],
  },
  {
    id: "knowledge", title: "Memory, Knowledge, and your data", summary: "Inspect what is saved, where it came from, and who can use it.",
    sections: [
      { title: "Chat is not proof of a saved record", body: "If you ask Sofie to remember something, confirm the save result and look for the record in Memory or Your data. A conversational acknowledgment alone is not a storage receipt." },
      { title: "Review saved information", body: "Use Your data → What MyEve Knows to search and filter by type and scope. Select a record to inspect its source, history and available controls. Review queues help identify contradictions, uncertain or stale information. Missing provenance should remain unknown." },
      { title: "Use the right type", body: "Facts describe established information; observations describe witnessed evidence; hypotheses describe possible explanations; decisions record choices; commitments record promised actions; preferences record standing choices. Insight is a separate category whose experimental classification boundary is still being refined. A goal or procedure should not be forced into a category just to save it." },
      { title: "Keep authority explicit", body: "Scope identifies the owner, Agent, Goal, project or task a record belongs to. Private information is not automatically shared through Relay. Review the exact content before correcting, forgetting, exporting or publishing it." },
    ], links: [{ label: "Review your data", href: "/manage/data" }, { label: "Browse Memory", href: "/manage/memory" }],
  },
  {
    id: "automation", title: "Reminders, routines, and briefs", summary: "Schedule useful work without accidental notifications.",
    sections: [
      { title: "Choose the right schedule", body: "A reminder is a time-based follow-up. A trigger starts work from an event. A Routine adds reviewed capabilities and readiness checks to recurring work. Briefs & reviews configures proactive digests." },
      { title: "Start with a draft", body: "Ask: ‘Draft a weekly review routine for Friday afternoon. Show the timezone, inputs, output, required access, delivery channel and stop condition. Do not enable it yet.’ Review those details before authorizing execution." },
      { title: "Check delivery", body: "Set your timezone, review delivery time and quiet hours, then save. In-app delivery is available; external channels appear only when configured. Verify the next scheduled time and delivery history. An enabled preference does not prove a delivery occurred." },
      { title: "Understand blocked readiness", body: "A Routine can need configuration or approval even when its schedule exists. Deployment-disabled execution means no Routine will run. Changed instructions or schedules may need renewed review. Fix the named dependency rather than approving unrelated actions." },
    ], links: [{ label: "Briefs & reviews", href: "/manage/review-delivery" }, { label: "Review Routines", href: "/manage/routines" }, { label: "Reminders", href: "/manage/reminders" }, { label: "Triggers", href: "/manage/triggers" }],
  },
  {
    id: "approvals", title: "Approvals and work history", summary: "Know what you are approving and what actually happened.",
    sections: [
      { title: "Approve one exact action", body: "Review the target, capability and payload. Approval applies to the exact pending action; a changed recipient or changed content needs its own decision. Expired requests or parent Runs must not be revived by clicking an old approval." },
      { title: "Follow the result", body: "After deciding, wait for continuation and inspect the result. Pending approval, missing authority, provider failure and completed execution are different states. A completed model turn does not by itself prove an external action completed." },
      { title: "Use the right view", body: "Approvals shows pending decisions and history. Control Center shows action status, attempts and available controls. Activity provides task details and stored evidence. If historical task text disagrees with current approval state, inspect the current Action and Run before proceeding." },
      { title: "Avoid duplicate actions", body: "Do not repeatedly click Yes, Retry or Send while a request is unresolved. A timeout can leave an uncertain outcome. Check evidence first. When an approval expires, create a fresh interaction after resolving dependencies instead of reusing the old request." },
    ], links: [{ label: "Open Approvals", href: "/manage/approvals" }, { label: "Control Center", href: "/manage/control" }, { label: "Activity", href: "/manage/activity" }],
  },
  {
    id: "relay", title: "Share with peers through Relay", summary: "Understand peer permissions, approval, expiry, and private data.",
    sections: [
      { title: "Discovery does not grant access", body: "Discovering another Agent does not authorize messaging or Knowledge retrieval. MyEve permission and the receiving Relay grant must both cover the exact peer, resource and capability. Check each layer in Peer permissions." },
      { title: "Send a bounded message", body: "Ask Sofie to propose the exact recipient and message. Review the pending action and approve it once. Follow the result through Activity. A direct correlated response belongs to that request; a new outbound request or changed payload requires its own authority." },
      { title: "When authority expires", body: "An expired grant is a dependency failure, not another owner approval request. Review the relevant relationship and grant expiry with the receiving owner. Renew only the intended scope, then start a fresh interaction if the previous Action or Run expired." },
      { title: "Publish deliberately", body: "Knowledge starts private. Select only the records you intend to publish, choose visibility and audience, and inspect the exact preview before confirming. Never put private data in a message expecting the recipient to filter it. Revocation prevents future retrieval but cannot erase copies already delivered." },
      { title: "Advanced controls", body: "Credential rotation, independent grants, artifact peer trust and work policies change security boundaries. Use them only with a clear recipient, scope and purpose. Signed receipts provide stronger evidence than an unverified local activity entry." },
    ], links: [{ label: "Review Relay permissions", href: "/manage/relay" }, { label: "Review pending actions", href: "/manage/approvals" }],
  },
  {
    id: "jev", title: "Test Jev Decision Intelligence", summary: "Request a real evaluation and distinguish it from historical evidence.",
    sections: [
      { title: "What Jev does here", body: "Jev is an optional decision provider, not a person or peer Agent. Decision Intelligence is experimental and advisory. The admin page includes historical synthetic experiments; viewing or filtering them does not make a live Jev call." },
      { title: "Run a small live test", body: "Start a fresh conversation and paste: ‘Use evaluate_with_jev to classify this exact statement: I prefer short answers with bullet points. Show the actual label, probability and provider/model. Do not save Memory or Knowledge. If the call fails, report the error without substituting your own classification. Only claim Jev was used if usedJev is true in the tool result.’", steps: ["If the exact tool request asks for approval, click Yes once.", "Wait for the tool output and Sofie’s response.", "Confirm usedJev: true and model typesafe-ai/jev in the actual result."] },
      { title: "Interpret the result carefully", body: "A probability is not a guarantee of correctness. The live classification contract uses six classes; Insight is excluded. Historical benchmark accuracy describes that experiment, not your data. Jev cannot grant authority or approve actions." },
      { title: "If it does not run", body: "If Sofie’s first model turn fails, restore its model authentication first. If Jev reports unavailable, check its deployment enablement and authentication separately. ‘Configured’ and old benchmark results are not proof of a successful live evaluation. Never ask the model to invent a Jev result." },
    ], links: [{ label: "View Decision Intelligence", href: "/manage/decision-intelligence" }, { label: "Start in chat", href: "/chat" }],
  },
  {
    id: "backup", title: "Back up and recover safely", summary: "Understand export coverage and validate before relying on an archive.",
    sections: [
      { title: "Inspect coverage first", body: "Open Your data → Backup & recovery. Review the inventory, exclusions and portability notes. Some data is metadata-only, referenced elsewhere, or requires account reconnection. An export is not automatically a complete restore of every external service." },
      { title: "Export and verify", body: "When available, use the export control and keep the archive in a secure location. Use the archive validation control to check its structure. Validation does not prove that all external dependencies are recoverable; read the reported limits and operation history." },
      { title: "If inventory cannot load", body: "Retry once. If the error persists, check System and ask the administrator to inspect the data service. Do not reset the database, delete owner data, or assume an empty inventory. You can return to What MyEve Knows independently." },
      { title: "Retention and removal", body: "Review the stated policy for each data class. Forgetting a Memory, revoking a publication and deleting a local record have different effects. Removal from MyEve does not guarantee removal of information already delivered to another service." },
    ], links: [{ label: "Open Your data", href: "/manage/data" }, { label: "Check System", href: "/manage/system" }],
  },
  {
    id: "troubleshooting", title: "Troubleshooting and recovery", summary: "Find the next safe step when something does not complete.",
    sections: [
      { title: "No response or missing tool output", body: "Wait for the current turn to settle. Look for an approval request or error. Refresh the conversation once if its display is stale, then inspect Activity. Avoid resending an action until you know whether it executed." },
      { title: "Authentication or connection error", body: "Check which dependency failed: Sofie’s model, Jev, an app connection, or Relay. Fixing one credential does not repair every service. Share only the safe error text and time with the administrator, never the credential itself." },
      { title: "Approval versus permission", body: "Pending approval means a decision is needed for an exact action. Missing or expired permission means authority is unavailable. Approving again does not create a missing grant. An expired Run needs a fresh interaction rather than continuation of old authority." },
      { title: "What to include in a bug report", body: "Record the page, time, intended action, observed result and safe request identifier if shown. Include a screenshot only after removing private information. Say whether you clicked Retry or repeated the request. Do not include tokens, passwords, private message content or account exports." },
    ], links: [{ label: "Check System", href: "/manage/system" }, { label: "Inspect Activity", href: "/manage/activity" }, { label: "Review Approvals", href: "/manage/approvals" }],
  },
];
