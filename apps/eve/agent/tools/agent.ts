import { disableTool } from "eve/tools";

// Trustworthy delegation is intentionally limited to the three declared QA
// specialists. The generic root-copy subagent would bypass that fixed roster.
export default disableTool();
