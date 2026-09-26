import { createHash } from "node:crypto";
import { getToken } from "@vercel/connect";
import { z } from "zod";
import { consumeActionAuthority, consumeProviderAuthority, type ActionAdapter } from "../../lib/action-gateway.ts";
import { normalizedForemanDescription } from "./foreman-description.ts";

export const FOREMAN_CAPABILITY = "tool.delegate_foreman_issue";
export const foremanInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(20).max(12000),
});
export interface ForemanConfig { connector: string; workspaceId: string; teamId: string; delegateId: string; repository: string }
export function foremanConfig(): ForemanConfig {
  const names = ["FOREMAN_LINEAR_CONNECTOR", "FOREMAN_LINEAR_WORKSPACE_ID", "FOREMAN_LINEAR_TEAM_ID", "FOREMAN_LINEAR_DELEGATE_ID", "FOREMAN_REPO"] as const;
  const values = names.map(name => process.env[name]?.trim());
  if (values.some(value => !value)) throw new Error("Foreman integration is not configured.");
  const [connector, workspaceId, teamId, delegateId, repository] = values as [string,string,string,string,string];
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Invalid Foreman repository configuration.");
  return { connector, workspaceId, teamId, delegateId, repository };
}
export function foremanIssueId(ownerId: string, sessionId: string, input: z.infer<typeof foremanInput>): string {
  const h = createHash("sha256").update(JSON.stringify([ownerId, sessionId, input.title, input.description])).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function foremanDescription(input: z.infer<typeof foremanInput>, config: ForemanConfig): string {
  return `${input.description}\n\n## Delivery boundary\nRepository: ${config.repository}. Run the Foreman pipeline and return an independently reviewed draft PR linked to this Linear issue. Do not merge, mark ready, or deploy. Submitted from the owner's Sofie chat.`;
}
const issueSchema = z.object({ id:z.string(), identifier:z.string(), url:z.string().url(), title:z.string(), description:z.string().nullable(), team:z.object({id:z.string()}), delegate:z.object({id:z.string()}).nullable(), agentSessions:z.object({nodes:z.array(z.object({id:z.string(),status:z.string()}))}) });
type Issue = z.infer<typeof issueSchema>;
type IssueMatchChecks = { exists:boolean; id:boolean; title:boolean; description:boolean; team:boolean; delegate:boolean };
function issueMatchChecks(issue:Issue|undefined,parameters:Record<string,unknown>,config:ForemanConfig):IssueMatchChecks {
  return {
    exists:!!issue,
    id:!!issue && issue.id===parameters.issueId,
    title:!!issue && issue.title===parameters.title,
    description:!!issue && normalizedForemanDescription(issue.description)===normalizedForemanDescription(String(parameters.description)),
    team:!!issue && issue.team.id===config.teamId,
    delegate:!!issue && issue.delegate?.id===config.delegateId,
  };
}
function issueMatches(checks:IssueMatchChecks):boolean { return Object.values(checks).every(Boolean); }
function foremanSessionStatus(status:string|null):"started"|"delegated_pending"|"delegated_failed" {
  const normalized=status?.trim().toLowerCase();
  if(normalized==="failed" || normalized==="error" || normalized==="cancelled" || normalized==="canceled") return "delegated_failed";
  if(normalized==="active" || normalized==="running" || normalized==="started" || normalized==="complete" || normalized==="completed" || normalized==="finished" || normalized==="succeeded") return "started";
  return "delegated_pending";
}
export type LinearQuery = (query:string, variables:Record<string,unknown>) => Promise<unknown>;
export function linearQuery(config:ForemanConfig):LinearQuery {
  return async (query,variables) => {
    const token = await getToken(config.connector,{subject:{type:"app"},scopes:["read","write"]});
    const response = await fetch("https://api.linear.app/graphql",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(20000)});
    const payload = await response.json() as {data?:unknown;errors?:unknown[]};
    if (!response.ok || payload.errors?.length || !payload.data) throw new Error("Linear request failed; verify the existing issue before retrying.");
    return payload.data;
  };
}
const fields = "id identifier url title description team { id } delegate { id } agentSessions { nodes { id status } }";
export function foremanAdapter(config:ForemanConfig, request:LinearQuery=linearQuery(config)):ActionAdapter<Issue> {
  const read = async (id:string) => {
    const data = await request(`query($id:ID!){ issues(filter:{id:{eq:$id}}) { nodes { ${fields} } } }`,{id});
    return z.object({issues:z.object({nodes:z.array(issueSchema)})}).parse(data).issues.nodes[0];
  };
  let expected:Record<string,unknown>;
  return {
    async resolveTarget(parameters) {
      expected=parameters;
      const data=z.object({viewer:z.object({id:z.string(),organization:z.object({id:z.string()})}),team:z.object({id:z.string()})}).parse(await request("query($team:String!){ viewer { id organization { id } } team(id:$team) { id } }",{team:config.teamId}));
      if(data.viewer.organization.id!==config.workspaceId || data.viewer.id!==config.delegateId || data.team.id!==config.teamId) throw new Error("Foreman account does not match the configured target.");
      return {provider:"linear",account:data.viewer.organization.id,resource:`${data.team.id}/${config.delegateId}/${config.repository}`};
    },
    async execute(parameters,authority) {
      await consumeActionAuthority(authority,parameters,FOREMAN_CAPABILITY);
      await consumeProviderAuthority(authority,parameters,FOREMAN_CAPABILITY);
      const existing=await read(String(parameters.issueId));
      if(existing) {
        if(!issueMatches(issueMatchChecks(existing,parameters,config))) throw new Error("Existing issue differs from this request; no changes made.");
        return existing;
      }
      // One mutation creates and delegates; deterministic issue ID prevents duplicate creates.
      const data=z.object({issueCreate:z.object({success:z.boolean(),issue:issueSchema.nullable()})}).parse(await request(`mutation($input:IssueCreateInput!){ issueCreate(input:$input){success issue {${fields}}} }`,{input:{id:parameters.issueId,title:parameters.title,description:parameters.description,teamId:config.teamId,delegateId:config.delegateId}}));
      if(!data.issueCreate.success || !data.issueCreate.issue) throw new Error("Linear did not confirm creation; do not blindly retry.");
      return data.issueCreate.issue;
    },
    receipt(issue) { return {issueId:issue.id,issueIdentifier:issue.identifier,issueUrl:issue.url}; },
    async verify(issue,target) {
      let saved=await read(issue.id);
      let checks=issueMatchChecks(saved,expected,config);
      // Linear can expose the session before all issue fields are consistent on
      // readback. Re-read the exact request binding for a bounded interval.
      for(let attempt=0;attempt<4 && (!issueMatches(checks) || !saved?.agentSessions.nodes.length);attempt++) {
        await new Promise(resolve=>setTimeout(resolve,1000));
        saved=await read(issue.id);
        checks=issueMatchChecks(saved,expected,config);
      }
      const sessions=saved?.agentSessions.nodes??[];
      const session=sessions.find(item=>foremanSessionStatus(item.status)==="started")
        ?? sessions.find(item=>foremanSessionStatus(item.status)==="delegated_failed")
        ?? sessions[0];
      const workspaceMatches=target.account===config.workspaceId;
      const verified=issueMatches(checks) && workspaceMatches;
      const sessionStatus=session?.status??null;
      return {verified,
        receipt:{issueId:issue.id,issueIdentifier:issue.identifier,issueUrl:issue.url,sessionId:session?.id??null,sessionStatus,status:foremanSessionStatus(sessionStatus),verified,checks:{...checks,workspace:workspaceMatches}}};
    },
  };
}
