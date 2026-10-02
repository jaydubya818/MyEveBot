import { z } from 'zod';
import { webPrincipal } from '../../../lib/web-auth.ts';
import { betaIntegration } from '../../../lib/beta-integration/runtime.ts';
import { readWorkThread } from '../../../lib/product/work-thread.ts';
import { WorkError } from '../../../lib/engineering/types.ts';
export async function GET(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  const owner = webPrincipal(request, { ...process.env, NODE_ENV: 'production' });
  if (!owner) return Response.json({ error: 'Sign in to view this Work.' }, { status: 401, headers });
  try {
    const url = new URL(request.url);
    const thread = z.string().min(1).max(200).parse(url.searchParams.get('threadId'));
    const offset = z.coerce.number().int().min(0).max(10000).parse(url.searchParams.get('offset') ?? 0);
    return Response.json(await readWorkThread(betaIntegration(), owner.id, thread, offset), { headers });
  } catch (error) {
    const status = error instanceof WorkError ? error.status : error instanceof z.ZodError ? 400 : 503;
    return Response.json({ error: status === 404 ? 'Conversation not found.' : 'Work progress is unavailable. Retry to refresh its saved state.' }, { status, headers });
  }
}
