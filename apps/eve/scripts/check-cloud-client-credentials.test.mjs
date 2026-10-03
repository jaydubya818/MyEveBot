import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkCloudClientCredentials,cloudCredentialNames} from './check-cloud-client-credentials.mjs';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'sofie-client-scan-'));t.after(()=>rmSync(root,{recursive:true,force:true}));for(const dir of ['.next/static','.next/server','public'])mkdirSync(join(root,dir),{recursive:true});writeFileSync(join(root,'.next/static/app.js'),'const publicValue=1;');writeFileSync(join(root,'.next/server/index.html'),'<html>qualification</html>');const env={VERCEL_PROJECT_ID:'prj_XU7fJW735PtsnKoAYtGfzdnsotIB',VERCEL_ENV:'preview',...Object.fromEntries(cloudCredentialNames.map((k,i)=>[k,`synthetic-${i}-`.padEnd(64,'x')]))};return {root,env};}
test('checks every required credential, static output and prerender data',t=>{const {root,env}=fixture(t);assert.deepEqual(checkCloudClientCredentials(root,env),{check:'cloud-client-credential-containment',status:'PASS',credentials:5,browserFiles:1,htmlHydrationFiles:1,publicFiles:0});delete env.VERCEL_AUTOMATION_BYPASS_SECRET;assert.throws(()=>checkCloudClientCredentials(root,env),/CLOUD_SERVER_CREDENTIAL_MISSING/);});
test('rejects runtime bypass in browser bundle, HTML, hydration and public files without logging it',t=>{const {root,env}=fixture(t);for(const file of ['.next/static/app.js','.next/server/index.html','.next/server/page.rsc','public/config.json']){writeFileSync(join(root,file),env.VERCEL_AUTOMATION_BYPASS_SECRET);assert.throws(()=>checkCloudClientCredentials(root,env),e=>e.message==='CLIENT_CREDENTIAL_DISCLOSURE');writeFileSync(join(root,file),'safe');}});
test('rejects public variables and base64 client leakage',t=>{const {root,env}=fixture(t);assert.throws(()=>checkCloudClientCredentials(root,{...env,NEXT_PUBLIC_CONFIG:env.VERCEL_AUTOMATION_BYPASS_SECRET}),/PUBLIC_CREDENTIAL_CONFIGURATION/);writeFileSync(join(root,'.next/static/app.js'),Buffer.from(env.VERCEL_AUTOMATION_BYPASS_SECRET).toString('base64'));assert.throws(()=>checkCloudClientCredentials(root,env),/CLIENT_CREDENTIAL_DISCLOSURE/);});
test('fails closed on production target and missing outputs',t=>{const {root,env}=fixture(t);assert.throws(()=>checkCloudClientCredentials(root,{...env,VERCEL_ENV:'production'}),/PREVIEW_REQUIRED/);rmSync(join(root,'.next/static'),{recursive:true});assert.throws(()=>checkCloudClientCredentials(root,env),/CLIENT_ARTIFACTS_MISSING/);});

test('rejects Proof read credential leakage',t=>{const {root,env}=fixture(t);writeFileSync(join(root,'.next/static/app.js'),env.FACTORY_PROOF_TOKEN);assert.throws(()=>checkCloudClientCredentials(root,env),/CLIENT_CREDENTIAL_DISCLOSURE/);});

test('production scans fresh application and session credentials and rejects qualification configuration',t=>{
 const {root}=fixture(t),env={VERCEL_PROJECT_ID:'prj_L6faw25wnFGUZtrLKBIccg8gIDLR',VERCEL_ENV:'production',MYEVE_FACTORY_PRODUCTION_APPLICATION_TOKEN:'p'.repeat(64),VERCEL_OIDC_TOKEN:'o'.repeat(64),MYEVE_SESSION_SECRET:'s'.repeat(64)};
 assert.equal(checkCloudClientCredentials(root,env).credentials,3);
 assert.throws(()=>checkCloudClientCredentials(root,{...env,SOFIE_CLOUD_QUALIFICATION_TOKEN:'q'.repeat(64)}),/QUALIFICATION_CREDENTIALS_IN_PRODUCTION/);
 for(const file of ['.next/static/app.js','.next/server/index.html']){
  writeFileSync(join(root,file),env.MYEVE_FACTORY_PRODUCTION_APPLICATION_TOKEN);assert.throws(()=>checkCloudClientCredentials(root,env),/CLIENT_CREDENTIAL_DISCLOSURE/);writeFileSync(join(root,file),'safe');
 }
});

test('production contains partner credentials in public variables, plain bundles and base64 hydration',t=>{
 const {root}=fixture(t),secret='partner-private-password-12345',env={VERCEL_PROJECT_ID:'prj_L6faw25wnFGUZtrLKBIccg8gIDLR',VERCEL_ENV:'production',MYEVE_FACTORY_PRODUCTION_APPLICATION_TOKEN:'p'.repeat(64),VERCEL_OIDC_TOKEN:'o'.repeat(64),MYEVE_PARTNER_ACCESS_PASSWORD:secret};
 assert.throws(()=>checkCloudClientCredentials(root,{...env,NEXT_PUBLIC_PARTNER_PASSWORD:secret}),/PUBLIC_CREDENTIAL_CONFIGURATION/);
 for(const [file,value] of [['.next/static/app.js',secret],['.next/server/page.rsc',Buffer.from(secret).toString('base64')]]){
  writeFileSync(join(root,file),value);assert.throws(()=>checkCloudClientCredentials(root,env),/CLIENT_CREDENTIAL_DISCLOSURE/);writeFileSync(join(root,file),'safe');
 }
});
