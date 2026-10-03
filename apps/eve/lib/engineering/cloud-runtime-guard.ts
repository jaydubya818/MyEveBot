export const cloudQualificationProjectId='prj_XU7fJW735PtsnKoAYtGfzdnsotIB';
/** Only the dedicated preview may compose the deterministic runtime. This is an
 * installation guard, never an owner session, Work grant or paid-model gate. */
export function cloudRuntimeEnabled(env:Readonly<Record<string,string|undefined>>=process.env){
 return env.VERCEL==='1'&&env.VERCEL_PROJECT_ID===cloudQualificationProjectId&&env.VERCEL_ENV==='preview'&&
  (!env.VERCEL_TARGET_ENV||env.VERCEL_TARGET_ENV==='preview')&&env.MYEVE_CLOUD_DETERMINISTIC_ENABLED==='true';
}
export function cloudRuntimeConfiguration(env:Readonly<Record<string,string|undefined>>=process.env):Record<string,unknown>{
 if(!cloudRuntimeEnabled(env))throw Error('CLOUD_QUALIFICATION_RUNTIME_DISABLED');
 if(env.FACTORY_STAGING_PROTECTION_BYPASS||env.MYEVE_FACTORY_REAL_EXECUTION_APPROVED==='true'||env.MYEVE_FACTORY_LOCAL_WORKER==='true')throw Error('CLOUD_QUALIFICATION_AUTHORITY_CONFLICT');
 const raw=env.MYEVE_CLOUD_QUALIFICATION_CONFIG??'';
 if(Buffer.byteLength(raw)>100000)throw Error('CLOUD_QUALIFICATION_CONFIG_BOUND');
 const config=JSON.parse(raw);
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).sort().join(',')!=='engineering,factory,source')throw Error('CLOUD_QUALIFICATION_CONFIG_REQUIRED');
 return config;
}

/** Narrow staging ingress. Existing route authentication still decides access. */
export function cloudIngressAllowed(path:string,method:string){
 if(path==='/api/cloud-qualification/access')return method==='POST';
 if(path==='/api/cloud-qualification/controller')return method==='POST';
 if(/^\/eve\/v1\/(health|session(?:\/[^/]+)?(?:\/(stream|cancel|compact|clear|reset))?)$/.test(path))return ['GET','POST'].includes(method);
 if(/^\/api\/auth\/(login|logout|status)$/.test(path))return ['GET','POST'].includes(method);
 if(/^\/api\/threads(?:\/[^/]+)?$/.test(path))return ['GET','POST','PUT','PATCH','DELETE'].includes(method);
 if(/^\/api\/beta\/(work|factory)$/.test(path))return ['GET','POST'].includes(method);
 if(method==='GET'&&(/^\/api\/(features|agents|capabilities|settings|app-settings|task-runs|beta\/(results|inbox|activity|goals|evidence|owner-decision))$/.test(path)||/^\/(?:$|login$|results$|chat(?:\/|$)|work(?:\/|$)|_next\/|favicon\.ico$)/.test(path)))return true;
 return false;
}
