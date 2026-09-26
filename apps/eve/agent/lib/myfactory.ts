import { getToken } from "@vercel/connect";
import { z } from "zod";
import { consumeActionAuthority, consumeProviderAuthority, type ActionAdapter } from "../../lib/action-gateway.ts";
import { parseInput, submitHostedRequest, getHostedRequest, type HostedConfig, type HostedResult } from "../../lib/myfactory-protocol.mjs";

export const factoryInput = z.object({ idempotencyKey: z.string().min(1).max(160), title: z.string().min(1).max(200),
  description: z.string().min(1).max(12000), kind: z.enum(["feature", "defect", "investigation"]),
  acceptanceCriteria: z.array(z.string().min(1).max(500)).min(1).max(30), allowedPaths: z.array(z.string().min(1).max(500)).min(1).max(30) }).strict();
export function factoryConfig(): HostedConfig & { connector: string; workspaceId: string } {
  const value = (name: string) => { const v = process.env[name]?.trim(); if (!v) throw new Error("MyFactory host routing is not configured"); return v; };
  return { clientId: "myeve", repository: value("MYFACTORY_REPOSITORY"), teamId: value("MYFACTORY_LINEAR_TEAM_ID"),
    connector: value("MYFACTORY_LINEAR_CONNECTOR"), workspaceId: value("MYFACTORY_LINEAR_WORKSPACE_ID"),
    token: value("MYFACTORY_CLIENT_TOKEN"), receiptPublicKey: value("MYFACTORY_RECEIPT_PUBLIC_KEY") };
}
export function factoryAdapter(operation: "create" | "read"): ActionAdapter<HostedResult> {
  const config = factoryConfig();
  const capability = operation === "create" ? "tool.create_factory_work_order" : "tool.get_factory_work_order";
  const graphql = async (query: string, variables: Record<string, unknown>) => {
    const token = await getToken(config.connector, { subject: { type: "app" }, scopes: ["read", "write"] });
    const response = await fetch("https://api.linear.app/graphql", { method: "POST", redirect: "error",
      signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
    const body = await response.json();
    if (!response.ok || body.errors?.length || !body.data) throw new Error("MyFactory routing provider could not confirm the request");
    return body.data;
  };
  return {
    async resolveTarget() {
      const data = await graphql("query($team:String!){viewer{organization{id}} team(id:$team){id}}", { team: config.teamId });
      if (data.viewer.organization.id !== config.workspaceId || data.team.id !== config.teamId) throw new Error("MyFactory destination mismatch");
      return { provider: "myfactory", account: config.workspaceId, resource: `${config.teamId}/${config.repository}` };
    },
    async execute(parameters, authority) {
      await consumeActionAuthority(authority, parameters, capability);
      await consumeProviderAuthority(authority, parameters, capability);
      return operation === "create" ? submitHostedRequest(config, parseInput(parameters), graphql) : getHostedRequest(config, String(parameters.requestId), graphql);
    },
    receipt(result) { return { ...result }; },
    async verify(result) {
      const saved = await getHostedRequest(config, result.requestId, graphql);
      return { verified: saved.requestId === result.requestId, receipt: { ...saved,
        status: saved.receipt ? "received_by_factory" : "awaiting_local_factory" } };
    },
  };
}
