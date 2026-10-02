import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
// Runs after next build, before provider upload. Never print credential values.
if(process.env.VERCEL_PROJECT_ID==='prj_XU7fJW735PtsnKoAYtGfzdnsotIB'){
 if(process.env.VERCEL_ENV!=='preview')throw Error('CLOUD_QUALIFICATION_PREVIEW_REQUIRED');
 const names=['FACTORY_STAGING_PROTECTION_BYPASS','FACTORY_SOFIE_STAGING_TOKEN','SOFIE_CLOUD_QUALIFICATION_TOKEN'];
 const secrets=names.map(k=>process.env[k]);
 if(secrets.some(s=>!s))throw Error('CLOUD_SERVER_CREDENTIAL_MISSING');
 for(const [key,value] of Object.entries(process.env))if(key.startsWith('NEXT_PUBLIC_')&&secrets.some(s=>value?.includes(s)))throw Error('PUBLIC_CREDENTIAL_CONFIGURATION');
 let files=0;
 function scan(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isSymbolicLink())throw Error('CLIENT_ARTIFACT_SYMLINK');if(entry.isDirectory())scan(path);else{const bytes=readFileSync(path);if(secrets.some(s=>bytes.includes(Buffer.from(s))))throw Error('CLIENT_CREDENTIAL_DISCLOSURE');files++;}}}
 if(!existsSync('.next/static'))throw Error('CLIENT_ARTIFACTS_MISSING');
 scan('.next/static');
 console.log(JSON.stringify({check:'cloud-client-credential-containment',status:'PASS',files}));
}
