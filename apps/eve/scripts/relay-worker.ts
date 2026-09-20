// Explicit opt-in worker. Run alongside MyEve with its own deployment secrets.
import { FederationStore } from "../lib/relay/store.ts";
import { pollRelay } from "../lib/relay/inbox.ts";
if (process.env.MYEVE_RELAY_ENABLED !== "true")
  throw new Error("Relay is disabled.");
const owner = process.env.MYEVE_OWNER_ID ?? process.env.SOFIE_OWNER_ID;
if (!owner) throw new Error("Configure the MyEve owner.");
const store = new FederationStore(owner);
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
while (!stopping) {
  try {
    await pollRelay(store);
  } catch {
    console.error("Relay poll failed; durable requests retained for recovery.");
  }
  if (process.argv.includes("--once")) break;
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
