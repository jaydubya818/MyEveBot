# Sofie to Foreman handoff

The owner can ask Sofie in web chat to create and delegate a Linear issue using relevant conversation context. `delegate_foreman_issue` uses a fixed configured workspace, team, app delegate, and repository. It returns an issue link and only reports startup when Linear has a real agent session. Foreman produces draft PRs; merge and deployment are separate owner actions.

## Owner handoff and recovery

- Sofie supplies the Linear issue URL for the verified saved issue: readback must confirm the created issue matches the request before the link is returned. Foreman session startup is reported separately; when no agent session has been observed yet, the receipt status is `delegated_pending`, meaning the delegation is saved but startup is not yet confirmed.
- Linear may normalize Markdown presentation in storage and display, such as list markers and whitespace. This does not change the issue's meaning and needs no correction.
- Treat `delegated_pending` or any uncertain handoff as unconfirmed, not failed: inspect the existing issue and its session from Control Center and reconcile from there. Do not create a replacement issue; the gateway's receipt supports reconciliation.
- Use the **Linear issues** shortcut in Sofie's sidebar to open the configured MYE Linear workspace and find the issue.

## Setup

Attach the existing Foreman Linear connector to the Sofie Vercel project without adding a webhook destination. Foreman remains the webhook receiver. Configure `FOREMAN_LINEAR_CONNECTOR`, `FOREMAN_LINEAR_WORKSPACE_ID`, `FOREMAN_LINEAR_TEAM_ID`, `FOREMAN_LINEAR_DELEGATE_ID`, and `FOREMAN_REPO`. The connector app identity and workspace are checked against these values before execution.

Set `NEXT_PUBLIC_LINEAR_WORKSPACE_URL` to the team's HTTPS Linear URL to show the **Linear issues** sidebar shortcut. This public URL is bundled at build time. Do not put secrets in it.

## Boundaries

- Only primary-agent owner chat can start this handoff; guests, child agents, routines, and secondary agents cannot.
- The canonical Action Gateway checks the live run and configured capability. One-use adapter and provider authority must both pass before mutation.
- The sole mutation creates the issue with its delegate. A deterministic owner/session/content UUID prevents duplicate creates on replay; an existing mismatched issue is never overwritten.
- The adapter verifies the issue content, team, delegate, and session through readback. Pending session creation is reported separately from started work.
- A failed or uncertain call must not be retried as a replacement issue. The gateway retains its receipt for reconciliation.
- The general Composio connection remains blocked; this tool does not grant broad access to connected apps.

## Validation

The pre-fix production chat failed after connector discovery because Claude rejected a discovered tool's top-level union schema. No Linear issue was created by that failed request.

Focused tests cover exact target binding, denied authority, duplicate prevention, uncertain creates, verification mismatch, and pending startup. App regression suite: 1,040 passed, 40 skipped. TypeScript, capability registry, imported-skill routing, and executor governance passed. Live chat verification is recorded after deployment.
