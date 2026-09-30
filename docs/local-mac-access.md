# Local Mac access

The hosted agent uses an outbound Mac companion. The laptop makes HTTPS requests to its own MyEve deployment; it exposes no incoming port and needs no tunnel.

## Access and approval

`local_computer_task` supports connection status, shared roots, directory listing, bounded filename search, text reading, file writes, shell commands, screenshots, clicks, typing, keys, and scrolling.

- Reads stay inside configured folders, resolve symbolic links, and exclude known credential locations and private application data.
- Shell commands have the logged-in user's privileges and are **not** confined to shared folders. Every command requires a separate exact-action approval, even for a read.
- Every file change and desktop operation, including screenshots, requires exact-action approval. The chat decision is bound to the canonical Action's full parameters, owner, Agent, and paired device.
- The legacy MCP connection and autonomous vision loop remain blocked.
- Guests, delegated sessions, routines, and on-demand roles cannot operate the Mac. Persistent Agents require the applicable local capabilities and risk ceiling.
- Device dispatch rechecks the live Run, Agent revision, pairing, approval, and deadline. Interrupted actions are never automatically repeated.

## Pairing

From `apps/eve`:

```sh
npm run local:setup -- https://your-deployment.example /absolute/shared/folder
```

Setup compiles the native helper and saves private `.local-computer/config.json` and `server.env` files. This directory is excluded from Git and Vercel uploads. Never paste the token into chat or commit it.

Set `SOFIE_LOCAL_DEVICE_ID` and `SOFIE_LOCAL_DEVICE_TOKEN` from `server.env` on the matching app deployment. Add `local-computer` to `EVE_ENABLED_FEATURES` without enabling other integration groups. Apply migration `0075_local_computer.sql`, deploy the app, then run `npm run local:start`. Keep the companion running and the Mac awake. Stop it to disconnect; rotate the token on both sides to revoke pairing permanently.

For desktop interaction, enable the generated `sofie-local-desktop` executable in **System Settings → Privacy & Security → Accessibility**. Screenshots also require **Screen Recording**. Unlock the Mac for desktop work. The tool's status operation reports these permissions. File and shell access does not require them, but macOS folder privacy restrictions still apply.

## Verification and recovery

Ask: “Check my Mac connection, find the README in the Myeve shared folder, and summarize it.” The agent should discover and read the file without asking for its exact path or repeated consent.

For a change, the agent must show the concrete operation before execution. Denial must leave the Mac untouched; approval must execute only that operation once.

`queued` confirms dispatch, not completion. Poll `status` with `job_id` set to the returned `jobId`. `unknown` means an operation may already have run: inspect before retrying. GUI results confirm input dispatch; inspect a fresh screenshot to verify the intended UI outcome.

Queue payloads and results are cleared after an hour when the device next polls. Conversation tool results follow normal chat retention. File contents and screenshots are excluded from Action audit receipts.

## Limits

Text files are capped at 200 KB. Filename search examines at most 3,000 entries to four levels and returns at most 200 matches. Shell execution is bounded to 20 seconds with capped output. Jobs expire after 60 seconds and require 30 seconds remaining when claimed. Desktop coordinates use main-display screen points.

The file writer verifies the expected content hash immediately before replacement. Independent applications cannot participate in an atomic cross-application compare-and-swap; avoid simultaneous editing during an approved overwrite.
