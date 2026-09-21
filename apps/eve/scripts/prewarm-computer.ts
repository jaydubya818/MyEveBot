import { prepareComputerRuntime } from "../lib/computer-runtime.ts";
import { ComputerPreparationError } from "../lib/computer-template-lifecycle.ts";

// Operator-only optimization, never invoked by build, boot, or status reads.
const ownerId = process.env.MYEVE_COMPUTER_PREWARM_OWNER_ID?.trim();
if (!ownerId) throw new Error("Set MYEVE_COMPUTER_PREWARM_OWNER_ID for the deployment owner before explicitly prewarming.");
try {
  await prepareComputerRuntime(ownerId, AbortSignal.timeout(130_000));
  console.log("Computer runtime is ready.");
} catch (error) {
  console.error("Computer preparation failed:", error instanceof ComputerPreparationError ? error.code : "unavailable");
  process.exitCode = 1;
}
