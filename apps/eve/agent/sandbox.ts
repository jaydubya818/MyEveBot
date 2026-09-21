import { defineSandbox } from "eve/sandbox";
import { computerSandboxBackend } from "../lib/computer-sandbox-backend.ts";

// No bootstrap or seed files: compilation never provisions a runtime.
export default defineSandbox({ backend: computerSandboxBackend });
