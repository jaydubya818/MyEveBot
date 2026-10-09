/** DOM labels and model-supplied intent do not prove a provider effect.
 * Until a deterministic effect adapter exists, deny ambiguous interaction.
 * This is a precondition of the existing gateway, not an alternate authority.
 */
export function browserEffect(name:string,input:Record<string,unknown>):"read"|"navigation"|"unknown" {
  if(name==="navigate")return "navigation";
  if(name==="find")return input.action==="text"?"read":"unknown";
  if(name==="wait_for" && input.jsCondition)return "unknown";
  if(name==="read" && input.url)return "navigation";
  return ["get","read","snapshot","screenshot","wait_for"].includes(name)?"read":"unknown";
}
