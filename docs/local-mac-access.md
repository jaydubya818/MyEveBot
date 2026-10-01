# Computer: the paired Mac

MyEve uses an outbound companion: the Mac polls its own HTTPS deployment and exposes no incoming port or tunnel. The per-user launchd service starts at login and restarts after failure. It does not run as root or keep a sleeping Mac awake.

## Grants and approvals

Computer is a canonical capability group. Configure an explicit comma-separated `SOFIE_LOCAL_CAPABILITIES` allowlist; a missing or malformed list denies all operations.

| Scope | Operations | Authority |
| --- | --- | --- |
| `computer.local.read` | Status, shared roots, directory listing, bounded filename search, text reads | Standing owner grant, current Agent capability, shared folders only |
| `computer.local.write` | Create/replace text file | Exact-action approval plus expected content hash; shared folders only |
| `computer.local.shell` | One bounded shell command | Exact-action approval; runs with the logged-in user's privileges |
| `computer.local.screenshot` | Main-display screenshot | Exact-action approval plus macOS Screen Recording |
| `computer.local.desktop` | Click, type, key and scroll | Exact-action approval plus macOS Accessibility |

Shell is **not confined to shared folders**. The approval must show the actual command. Desktop input can affect whichever app is foreground. Browser automation remains the existing separate governed browser capability; this release does not imply a new local browser or unrestricted vision-loop grant.

Guests, delegated sessions, routines and on-demand roles cannot operate this Computer. Agent capabilities, risk limits, exact parameters, owner, pairing, Run, deadline and approval are checked again at dispatch. Known credential locations, environment files and private application data are excluded from shared-file operations. Symlinks cannot escape the configured roots. The legacy Local MCP and autonomous vision executor remain blocked.

## Pair and install

From `apps/eve`:

```sh
npm run local:setup -- https://your-deployment.example /absolute/shared/folder
npm run local:service -- install
npm run local:start
npm run local:service -- status
```

Setup creates a device identity and saves the token in the macOS login Keychain (`com.myeve.sofie-local`). JSON contains metadata and the Keychain reference, never the token. Securely pipe the existing Keychain value into the matching deployment's encrypted `SOFIE_LOCAL_DEVICE_TOKEN`; configure `SOFIE_LOCAL_DEVICE_ID`, the explicit capabilities, and the `local-computer` feature. Never paste credentials into chat, command arguments, Git or env files. Apply the complete migration chain through `0077_computer_revocation.sql` before deploying this version.

To migrate an existing plaintext pairing, run `local:service install /absolute/old/config.json`. It verifies Keychain readback before replacing the old token-bearing JSON and removing the matching old `server.env`. It preserves the shared roots, device, desktop helper and durable claim journal. Stop an existing manual companion first. Installation refuses to replace a running installed service. Updating uses `stop`, `install` with the installed config path, then `start`.

Installed files live in `~/Library/Application Support/Sofie Local`; the login entry is `~/Library/LaunchAgents/com.myeve.sofie-local.plist`. The native **Sofie Local.app** gives the background worker a distinct privacy identity instead of requiring a blanket Node permission. The launcher and Keychain helper remain stable across worker updates; their first local build is not a signed/notarized public distribution release.

## macOS permissions and readiness

Grant **Sofie Local** only in System Settings → Privacy & Security → Accessibility and Screen & System Audio Recording when desktop access is wanted. Do not enable an ambiguous `node` entry or Full Disk Access. The owner must approve these macOS changes. A helper launched from Codex/Terminal can inherit different permissions from the persistent service, so it is not sufficient evidence for background desktop control. Restart the service after permission changes and check its own health.

`status` distinguishes `connectionReady`, `desktopReady`, and `screenshotReady`. Overall `ready` requires all three; fresh authenticated connectivity alone does not claim full Computer readiness. A locked Keychain, stale heartbeat, stopped process or revoked pairing is not ready. macOS folder privacy restrictions still apply to Documents/Desktop/Downloads. Actual logout/login and operation-specific acceptance are separate checks from installing the login entry.

## Stop, revoke and recover

```sh
npm run local:service -- stop     # disconnect now; retain login entry
npm run local:service -- restart
npm run local:service -- unpair   # authenticated server revoke, then remove local credential/login entry
```

Unpair first records an immutable server revocation for the exact pairing hash. Queued jobs expire; in-flight jobs become unknown because they may already have acted. Only after server confirmation does the CLI stop the worker and delete the Keychain item and login entry. If offline, it refuses to claim revocation: stop the service and retry unpair when connected. Re-pairing requires a new token; restoring the old token cannot restore its revoked authority. Unpair does not undo completed operations or change macOS privacy settings automatically.

The worker takes an OS-backed exclusive lock and writes a durable per-job claim before execution. A process crash releases the lock; it never repeats an uncertain job. SIGTERM stops new work and permits bounded result delivery. `queued` means dispatch only; `unknown` means inspect before retrying. A desktop action receipt proves input dispatch; verify its intended outcome separately.

## Acceptance and limits

Use the original prompt: **“hello sol, can you review my read.me and tell me about this app”**. Sofie should find the README within shared roots and read it without demanding an exact path or repeating a standing read permission request. Repeat after a completed task in the same chat. For a mutation, denial must leave the Mac unchanged; approval must execute that exact operation once.

Text files: 200 KB. Search: 3,000 entries, four levels, 200 matches. Shell: 20 seconds, capped output. Jobs: 60-second expiry with 30 seconds remaining at dispatch. The writer checks the expected hash before replacement; independent editors cannot participate in an atomic cross-application comparison. Avoid concurrent editing during overwrite.

Payloads/results expire after an hour when the device polls. Chat tool results follow chat retention; file contents/screenshots are excluded from Action audit receipts. See [the qualification record](verification/computer-federation-continuation-2026-09-30.md) for tested behavior and open gates.
