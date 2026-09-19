/** Explicit release decision; no environment variable can enable execution. */
export const ROUTINE_RELEASE = Object.freeze({
  enabled:false,
  recommendation:"MUST_REMAIN_DISABLED" as const,
  blockers:["Owner live-input transport remains blocked", "End-to-end runtime/provider acceptance has not been authorized"],
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
