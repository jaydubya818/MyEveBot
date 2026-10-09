import { z } from 'zod';
import { boundedJson } from '@/lib/relay/client';
import { CapabilityError } from '@/lib/capability-control/contracts';
import { capabilityPrincipal, capabilityStore } from '@/lib/capability-control/runtime';

const headers = { 'Cache-Control': 'no-store' };
async function handle(request: Request) {
  try {
    const store = capabilityStore({ ownerId: await capabilityPrincipal(request), source: 'settings' });
    let command: unknown;
    if (request.method !== 'GET') {
      try { command = await boundedJson(new Response(request.body), 4096); }
      catch { throw new CapabilityError('invalid_command', 'Send a valid capability command of at most 4096 bytes.', 400); }
    }
    const body = request.method === 'GET' ? await store.inspect() : await store.command(command);
    return Response.json(body, { headers });
  } catch (error) {
    if (error instanceof CapabilityError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
    if (error instanceof z.ZodError) return Response.json({ error: 'Check the capability command and revision.', code: 'invalid_command' }, { status: 400, headers });
    return Response.json({ error: 'Capability storage is unavailable. Saved preferences have not been discarded.', code: 'capabilities_unavailable' }, { status: 503, headers });
  }
}
export const GET = handle;
export const POST = handle;
