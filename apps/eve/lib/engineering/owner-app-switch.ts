import {WorkError} from './types.ts';

/** The named host switch for real-provider Factory Work from Sofie. Never on in production or hosted runtimes. */
export function localLiveFactoryEnabled(env:NodeJS.ProcessEnv=process.env):boolean{
 if(env.MYEVE_FACTORY_LOCAL_LIVE!=='true'||env.MYEVE_ENGINEERING_MODE!=='dogfood'||env.VERCEL_ENV==='production'||env.VERCEL==='1')return false;
 if(!env.MYEVE_FACTORY_OWNER_PROFILE?.startsWith('/'))throw new WorkError('factory_setup','MYEVE_FACTORY_OWNER_PROFILE must be an absolute path.',503);
 return true;
}
