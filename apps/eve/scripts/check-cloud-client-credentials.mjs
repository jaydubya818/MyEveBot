import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const cloudCredentialNames = ['FACTORY_PROOF_TOKEN','VERCEL_OIDC_TOKEN','FACTORY_SOFIE_STAGING_TOKEN','SOFIE_CLOUD_QUALIFICATION_TOKEN','VERCEL_AUTOMATION_BYPASS_SECRET'];
/** Scan deployable client data, not trusted server code. Errors never contain values. */
export function checkCloudClientCredentials(root='.', env=process.env) {
 const production=env.VERCEL_PROJECT_ID==='prj_L6faw25wnFGUZtrLKBIccg8gIDLR'&&env.VERCEL_ENV==='production';
 if(!production&&env.VERCEL_PROJECT_ID!=='prj_XU7fJW735PtsnKoAYtGfzdnsotIB')return null;
 if(!production&&env.VERCEL_ENV!=='preview')throw Error('CLOUD_QUALIFICATION_PREVIEW_REQUIRED');
 if(production&&['FACTORY_SOFIE_STAGING_TOKEN','SOFIE_CLOUD_QUALIFICATION_TOKEN','MYEVE_CLOUD_QUALIFICATION_CONFIG','MYEVE_CLOUD_DETERMINISTIC_ENABLED'].some(key=>env[key]))throw Error('QUALIFICATION_CREDENTIALS_IN_PRODUCTION');
 if(env.FACTORY_STAGING_PROTECTION_BYPASS)throw Error('STATIC_FACTORY_BYPASS_FORBIDDEN');
 const names=production?['MYEVE_FACTORY_PRODUCTION_APPLICATION_TOKEN','VERCEL_OIDC_TOKEN']:cloudCredentialNames;
 const secrets=names.map(k=>env[k]);
 if(secrets.some(s=>!s || s.length<32))throw Error('CLOUD_SERVER_CREDENTIAL_MISSING');
 if(production)for(const key of ['FACTORY_PROOF_TOKEN','MYEVE_ACCESS_PASSWORD','MYEVE_PARTNER_ACCESS_PASSWORD','SOFIE_ACCESS_PASSWORD','MYEVE_SESSION_SECRET','SOFIE_SESSION_SECRET','VERCEL_AUTOMATION_BYPASS_SECRET'])if(env[key])secrets.push(env[key]);
 const needles=secrets.flatMap(s=>[Buffer.from(s),Buffer.from(Buffer.from(s).toString('base64'))]);
 const leaks=bytes=>needles.some(n=>bytes.includes(n));
 for(const [key,value] of Object.entries(env))if(key.startsWith('NEXT_PUBLIC_')&&value&&leaks(Buffer.from(value)))throw Error('PUBLIC_CREDENTIAL_CONFIGURATION');
 const counts={browserFiles:0,htmlHydrationFiles:0,publicFiles:0};
 function scan(dir,kind,select=()=>true){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isSymbolicLink())throw Error('CLIENT_ARTIFACT_SYMLINK');if(entry.isDirectory())scan(path,kind,select);else if(select(path)){if(leaks(readFileSync(path)))throw Error('CLIENT_CREDENTIAL_DISCLOSURE');counts[kind]++;}}}
 const staticDir=join(root,'.next/static');
 if(!existsSync(staticDir))throw Error('CLIENT_ARTIFACTS_MISSING');
 scan(staticDir,'browserFiles');
 const server=join(root,'.next/server');
 if(!existsSync(server))throw Error('PRERENDER_ARTIFACTS_MISSING');
 scan(server,'htmlHydrationFiles',path=>/\.(?:html|rsc|body|meta|txt|json)$/.test(path));
 if(existsSync(join(root,'public')))scan(join(root,'public'),'publicFiles');
 return {check:'cloud-client-credential-containment',status:'PASS',credentials:secrets.length,...counts};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const report=checkCloudClientCredentials();if(report)console.log(JSON.stringify(report));}
