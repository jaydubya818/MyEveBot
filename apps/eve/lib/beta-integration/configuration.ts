import { z } from 'zod';
import { webAuthConfigStatus } from '../web-auth.ts';
import { GOLDEN_QUALIFICATION_REPOSITORY } from '../engineering/base-preflight.ts';

/** Explicit startup configuration; owner input cannot choose a datastore or budget.
 * Qualification always stays disposable. Alpha uses the same canonical application DB. */
export function betaConfiguration(env: NodeJS.ProcessEnv = process.env) {
  if (env.MYEVE_BETA_MODE === 'qualification') {
    if(env.VERCEL_ENV==='production')throw new Error('Qualification cannot run in production');
    const url=new URL(env.MYEVE_BETA_DATABASE_URL??'');
    if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/myeve_beta_[a-z0-9_]+$/.test(url.pathname))throw new Error('Disposable beta database required');
    return {url:url.href,policy:{repository:GOLDEN_QUALIFICATION_REPOSITORY,maxCostUsd:1,maxDurationSeconds:300}};
  }
  if(env.MYEVE_BETA_MODE!=='private-alpha')throw new Error('Beta integration is not enabled');
  if(!env.MYEVE_OWNER_ID?.trim()||!webAuthConfigStatus(env).configured)throw new Error('Private alpha requires an explicit owner and configured web authentication');
  const url=new URL(env.DATABASE_URL??'');
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.pathname||url.pathname==='/')throw new Error('Canonical application database required');
  const policy=z.object({repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),maxCostUsd:z.coerce.number().finite().positive().max(1.35),maxDurationSeconds:z.coerce.number().int().positive().max(600)}).parse({repository:env.MYEVE_ALPHA_REPOSITORY,maxCostUsd:env.MYEVE_ALPHA_MAX_WORK_USD,maxDurationSeconds:env.MYEVE_ALPHA_MAX_WORK_SECONDS});
  return {url:url.href,policy};
}
