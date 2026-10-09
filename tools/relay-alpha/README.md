# Alpha Relay peer

Alpha is a separate, local test Agent for the Sofie–Relay conversation path. Its only approved answer source is the synthetic Orion profile in `alpha-production.json`. It cannot read Sofie's Knowledge, memory, files, or chat history. Incoming deliveries must have Relay's pinned signature and come from the exact Sofie Agent address. A local Ollama model generates replies, so Alpha does not use a paid model API.

## Install on the owner's Mac

Install Node 24, this repository's dependencies, Ollama, and the `llama3.2:3b` model. Obtain Alpha's existing Agent credential and Relay's pinned delivery public key through the authorized Relay setup. Keep both outside Git. The installer copies them into `~/Library/Application Support/Alpha Relay/` with private file permissions and starts the `com.jaywest.alpha-relay` LaunchAgent:

```sh
tools/relay-alpha/install-mac.sh /secure/path/alpha-credential.json /secure/path/relay-delivery-key.json
```

The credential file must contain `{ "alphaCredential": "..." }`. The public-key file must contain `{ "delivery": { "keyId": "...", "keyVersion": "...", "publicKeyPem": "..." } }`. The worker verifies each signed delivery before accepting it, records pending work on disk, and sends a correlated reply. The Mac and Ollama must remain running. The worker does not renew passports, peer permissions, or Relay grants; those expire independently and must be renewed by the owner through the established approval process.

Check the service with `launchctl print gui/$(id -u)/com.jaywest.alpha-relay` and inspect `~/Library/Application Support/Alpha Relay/stderr.log`. Use the same `ALPHA_RELAY_CONFIG_FILE` and `ALPHA_RELAY_CREDENTIAL_FILE` paths from the LaunchAgent to initiate a conversation:

```sh
node --import tsx tools/relay-alpha/send.mjs "What is the approved public description of SellerFi?"
```

The sender prints a conversation ID. Pass that ID as the second argument for a follow-up. Sofie's owner must approve each exact incoming request. No private Knowledge is published by this setup.
