/** Finite initial graph. Skills provide instructions, never additional tools. */
export const ROUTINE_TOOLS:Readonly<Record<string,{capability:string;classification:"READ_ONLY"|"INTERNAL"|"ENFORCED"|"BLOCKED"}>>={
  web_fetch:{capability:"web.read",classification:"READ_ONLY"},
  web_search:{capability:"web.search",classification:"READ_ONLY"},
  list_goals:{capability:"tool.list_goals",classification:"READ_ONLY"},
  get_goal:{capability:"tool.get_goal",classification:"READ_ONLY"},
  search_knowledge:{capability:"tool.search_knowledge",classification:"READ_ONLY"},
  search_owner_knowledge:{capability:"tool.search_owner_knowledge",classification:"READ_ONLY"},
  record_observation:{capability:"tool.record_observation",classification:"INTERNAL"},
  list_emails:{capability:"tool.list_emails",classification:"READ_ONLY"},
  search_emails:{capability:"tool.search_emails",classification:"READ_ONLY"},
  read_email:{capability:"tool.read_email",classification:"READ_ONLY"},
  // Initial Routines have no owner-approved persistent workspace binding.
  // Existing interactive file adapters remain available to authorized chat.
  read_file:{capability:"files.read",classification:"BLOCKED"},
  write_file:{capability:"files.write",classification:"BLOCKED"},
  send_email:{capability:"tool.send_email",classification:"ENFORCED"},
  imessage:{capability:"tool.imessage",classification:"BLOCKED"},
};
const research=["web_fetch","search_knowledge","search_owner_knowledge","record_observation"];
export const INITIAL_ROUTINES:Readonly<Record<string,readonly string[]>>={
  "Daily Brief":["list_goals","get_goal","search_knowledge","search_owner_knowledge"],
  "Weekly Goal Review":["list_goals","get_goal","search_knowledge","record_observation"],
  "Stalled Work Review":["list_goals","get_goal","search_knowledge","record_observation"],
  "Competitor Monitor":research,
  "Research Digest":research,
  "Campaign Performance Review":[...research,"read_file"],
  "Draft Follow-Up":["list_emails","search_emails","read_email","search_knowledge"],
  "External Follow-Up Send":["list_emails","search_emails","read_email","search_knowledge","send_email"],
};
export function routineToolAllowed(tool:string,capability:string,allowed:readonly string[]):boolean {
  return ROUTINE_TOOLS[tool]?.capability===capability && ROUTINE_TOOLS[tool]?.classification!=="BLOCKED" && allowed.includes(capability);
}

/** Template requirements are proposals; only an owner-reviewed version grants a ceiling. */
export const ROUTINE_TEMPLATES=Object.fromEntries(Object.entries(INITIAL_ROUTINES).map(([name,tools])=>[name,{
  required:[...new Set(tools.map(tool=>ROUTINE_TOOLS[tool].capability))],
  optional:[{capabilityId:"notification.send",fallback:"in_app_result"}],
  result:"owner_local",
}]));
