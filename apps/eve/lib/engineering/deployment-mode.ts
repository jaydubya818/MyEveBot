import {cloudRuntimeEnabled} from './cloud-runtime-guard.ts';
/** Hosted discovery permits only queued requests. Local canonical admission grants execution. */
export function hostedFactoryQueue(env: NodeJS.ProcessEnv = process.env): boolean {
  if(cloudRuntimeEnabled(env))return !!env.MYEVE_OWNER_ID?.trim()&&env.MYEVE_FACTORY_ID==='myfactory-cloud-staging';
  return env.MYEVE_BETA_MODE === 'private-alpha' &&
    env.MYEVE_ENGINEERING_MODE === 'private-alpha' &&
    env.MYEVE_FACTORY_WORKER_ENABLED === 'true' &&
    !!env.MYEVE_OWNER_ID?.trim() && !!env.MYEVE_FACTORY_ID?.trim();
}
export function engineeringWorkEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.MYEVE_ENGINEERING_MODE === 'dogfood' && env.VERCEL_ENV !== 'production') || hostedFactoryQueue(env);
}
