import type { AgentView } from "../../lib/agents.ts";

export const ENGINEERING_WORK_ID_HEADER = "x-myeve-engineering-work-id";
export const ENGINEERING_WORK_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

interface Principal {
  authenticator?: string;
  principalId?: string;
  principalType?: string;
  attributes?: Record<string, unknown>;
}

interface WorkContextBinding {
  ownerId: string;
  threadId: string | null;
  agent: Pick<AgentView, "ownerId" | "isPrimary">;
  roleId: string | null;
  channelKind: string | undefined;
  mode: string | undefined;
  auth: { current?: Principal | null; initiator?: Principal | null };
}

/** A selected Work is per turn, not inherited from the session initiator. */
export function selectedEngineeringWorkId(input: WorkContextBinding): string | null {
  const { current, initiator } = input.auth;
  const selection = current?.attributes?.myeveEngineeringWorkId;
  if (selection === undefined) return null;
  if (typeof selection !== "string" || !ENGINEERING_WORK_ID_PATTERN.test(selection))
    throw new Error("Selected Engineering Work id is invalid.");
  if (process.env.MYEVE_ENGINEERING_MODE !== "dogfood" || input.channelKind !== "http" ||
      input.mode !== "conversation" || input.roleId ||
      !input.agent.isPrimary || input.agent.ownerId !== input.ownerId ||
      current?.authenticator !== "myeve-web-session" || initiator?.authenticator !== "myeve-web-session" ||
      current?.principalType !== "user" || initiator?.principalType !== "user" ||
      current.principalId !== input.ownerId || initiator.principalId !== input.ownerId ||
      current.attributes?.owner !== "true" || initiator.attributes?.owner !== "true" ||
      !input.threadId || current.attributes?.webThreadId !== input.threadId ||
      initiator.attributes?.webThreadId !== input.threadId ||
      current.attributes?.myeveRoleId || initiator.attributes?.myeveRoleId)
    throw new Error("Selected Engineering Work requires this owner's direct primary Agent web chat.");
  return selection;
}
