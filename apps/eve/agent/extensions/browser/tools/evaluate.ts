import { disableTool } from "eve/tools";

// Arbitrary JavaScript can mutate remote state and is not a read capability.
export default disableTool();
