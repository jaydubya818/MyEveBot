import type { ToolContext } from 'eve/tools';
import { executionIdentityFromAuth } from '../execution-auth.ts';
import { configuredOwnerIds } from '../web-auth.ts';
import { capabilityStore } from './runtime.ts';
import { CapabilityError } from './contracts.ts';

export function capabilityToolOwner(ctx: Pick<ToolContext, 'session'>) {
  const caller = ctx.session.auth.current;
  if (!caller || caller.principalType !== 'user' || caller.attributes.owner !== 'true'
    || caller.attributes.role === 'guest' || caller.attributes.myeveRoleId
    || ctx.session.parent || executionIdentityFromAuth(ctx.session.auth)
    || !configuredOwnerIds().includes(caller.principalId))
    throw new CapabilityError('direct_owner_required', 'Capability management requires the direct authenticated owner.', 403);
  return caller.principalId;
}

export function inspectOwnerCapabilities(ctx: Pick<ToolContext, 'session'>) {
  return capabilityStore({ ownerId: capabilityToolOwner(ctx), source: 'sofie' }).inspect();
}
export function changeOwnerCapability(input: unknown, ctx: Pick<ToolContext, 'session'>) {
  return capabilityStore({ ownerId: capabilityToolOwner(ctx), source: 'sofie' }).command(input);
}
