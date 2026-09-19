/** Explicit release decision; no environment variable can enable execution. */
export const ROUTINE_RELEASE = Object.freeze({
  enabled:false,
  recommendation:"MUST_REMAIN_DISABLED" as const,
  blockers:["End-to-end unattended runtime/provider acceptance has not been authorized", "Several communications and connected-app write paths remain explicitly blocked"],
});
export type ExecutorClassification="ENFORCED"|"BLOCKED"|"READ_ONLY"|"INTERNAL"|"NOT_APPLICABLE";
export function evaluateRoutineReachability(input:{
  tools:readonly string[];
  classifications:Readonly<Record<string,ExecutorClassification>>;
  delegation:boolean;
  opaqueConnections:boolean;
}):{qualified:boolean;blocked:string[]} {
  const blocked=input.tools.filter(tool=>!input.classifications[tool] || input.classifications[tool]==="NOT_APPLICABLE");
  if(input.delegation)blocked.push("unqualified_delegation");
  if(input.opaqueConnections)blocked.push("opaque_connections");
  return {qualified:blocked.length===0,blocked};
}
