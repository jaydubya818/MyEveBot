import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
/** These are the current owner-journey production-build seams, with a stricter
 * local transport and an explicitly pinned local font to avoid a build fetch.
 * The positive Work grants, profiles and assertions remain unchanged. */
export function currentQESeams(sourceRoot,font){
 assert.equal(hash(readFileSync(join(sourceRoot,'apps/eve/test/owner-journey/runner-prod.ts'))),'ca5af03faa4e036d19e8b5c1feb2e5d93b4635dc3c5b3862fb9bcda8e31cb00c','QE_RUNNER_PROFILE_CHANGED');
 assert.equal(hash(readFileSync(join(sourceRoot,'apps/eve/test/owner-journey/gateway.ts'))),'cee51d550aa8b8830351dea38e13270d29150532cbfba0877f63e8bc0a8317fd','QE_GATEWAY_PROFILE_CHANGED');
 assert.equal(hash(font),'bde046ddd9f20be35b0bd56cc79eb752b967fb6661a3fe76cb067bb09f871d76','QE_FONT_BODY');
 const app='apps/eve/',modelPath=app+'lib/external-alpha/model.ts',layoutPath=app+'app/layout.tsx';
 const model=readFileSync(join(sourceRoot,modelPath),'utf8');
 const from='import { gateway } from "ai";';assert.equal(model.split(from).length,2,'QE_MODEL_SEAM_CHANGED');
 const layout=readFileSync(join(sourceRoot,layoutPath),'utf8');
 // Exact existing R9 local-font seam, no application UI or behavior replacement.
 const fontImport='import { Geist, Geist_Mono, Inter } from "next/font/google";';
 assert.equal(layout.split(fontImport).length,2,'QE_LAYOUT_IMPORT_SEAM_CHANGED');
 const fontDeclarations=layout.slice(layout.indexOf('const inter = Inter('),layout.indexOf('export const metadata:'));
 assert(fontDeclarations.startsWith('const inter = Inter(')&&fontDeclarations.includes('const geistMono = Geist_Mono('),'QE_LAYOUT_FONT_SEAM_CHANGED');
 const localDeclarations=['const inter = localFont({ src: "../test/owner-chat-only/fixture-geist-regular.ttf", variable: "--font-sans" });',
  'const geist = localFont({ src: "../test/owner-chat-only/fixture-geist-regular.ttf", variable: "--font-geist" });',
  'const geistMono = localFont({ src: "../test/owner-chat-only/fixture-geist-regular.ttf", variable: "--font-geist-mono" });','',''].join('\n');
 const transport=projectCurrentQETransport(readFileSync(join(sourceRoot,app+'test/owner-chat-only/transport.cjs'),'utf8'));
 const neonBodies=Object.fromEntries(CURRENT_QE_NEON_STORES.map(path=>[path,Buffer.from(projectCurrentQENeonStore(readFileSync(join(sourceRoot,path),'utf8'),path))]));
 const bodies={
  [modelPath]:Buffer.from(model.replace(from,'import { gateway } from "../../test/owner-journey/gateway.ts";')),
  [app+'next.config.ts']:Buffer.from("export default {serverExternalPackages:['@remotion/bundler','@remotion/renderer','heif2jpeg'],async rewrites(){return [{source:'/eve/:path*',destination:'http://127.0.0.1:3185/eve/:path*'}]}};\n"),
  [layoutPath]:Buffer.from(layout.replace(fontImport,'import localFont from "next/font/local";').replace(fontDeclarations,localDeclarations)),
  [app+'test/owner-chat-only/fixture-geist-regular.ttf']:font,
  [app+'test/owner-journey/transport.cjs']:Buffer.from(transport),
  ...neonBodies,
 };
 return Object.entries(bodies).map(([path,body])=>{
  let beforeSha256=null;try{beforeSha256=hash(readFileSync(join(sourceRoot,path)));}catch(error){if(error.code!=='ENOENT')throw error;}
  return {path,beforeSha256,afterSha256:hash(body),bodyBase64:body.toString('base64')};
 });
}

/** Public configuration only, applied in each copied SQL store's own Neon
 * import context. The adapter handles this exact parseable endpoint using owned
 * pg; it is never an HTTP listener or an additional network allowance. */
export function currentQENeonConfiguration(typeScript=false){
 const argumentsText=typeScript?'host: string, port: number | string':'host, port';
 return [
  'neonConfig.fetchEndpoint = ('+argumentsText+') => {',
  ' let database;',
  " try { database = new URL(process.env.DATABASE_URL || ''); }",
  " catch { throw Error('QE_OWNED_NEON_DATABASE_REQUIRED'); }",
  " if (database.protocol !== 'postgresql:' || database.hostname !== '127.0.0.1'",
  "  || !/^[1-9]\\d{0,4}$/.test(database.port) || Number(database.port)>65535",
  "  || !/^\\/ea_work_[a-f0-9]{32}$/.test(database.pathname) || database.search || database.hash)",
  "  throw Error('QE_OWNED_NEON_DATABASE_REQUIRED');",
  " if (typeof host !== 'string' || !['string','number'].includes(typeof port)",
  "  || host !== database.hostname || String(port) !== database.port)",
  "  throw Error('QE_NEON_ENDPOINT_CONNECTION_MISMATCH');",
  " return 'http://127.0.0.1:'+database.port+'/__current_qe_neon';",
  '};',
 ].join('\n');
}

export const CURRENT_QE_NEON_STORES=Object.freeze([
 'apps/eve/agent/lib/receipts-db.ts',
 'apps/eve/lib/threads-db.ts',
]);
const NEON_STORE_PREIMAGES=Object.freeze({
 'apps/eve/agent/lib/receipts-db.ts':'1170582127a23fd9b59ed7ce9b5878e5391f74a9cf9f20b0b72f05e6ec1c3a42',
 'apps/eve/lib/threads-db.ts':'dba323c10ddd2deed3dae9ebf4fcb3714e58c4318315edd4d6cece29b282047d',
});

export function projectCurrentQENeonStore(source,path){
 assert(Object.hasOwn(NEON_STORE_PREIMAGES,path),'QE_UNREVIEWED_NEON_STORE');
 assert.equal(hash(source),NEON_STORE_PREIMAGES[path],'QE_NEON_STORE_PREIMAGE_CHANGED');
 const imported='import { neon, type NeonQueryFunction } from "@neondatabase/serverless";';
 const lazy='  if (_sql === null) _sql = neon(process.env.DATABASE_URL!);';
 assert.equal(source.split(imported).length,2,'QE_NEON_IMPORT_SEAM_CHANGED');
 assert.equal(source.split(lazy).length,2,'QE_NEON_LAZY_SEAM_CHANGED');
 const configured='  if (_sql === null) {\n    '+currentQENeonConfiguration(true).replaceAll('\n','\n    ')
  +'\n    _sql = neon(process.env.DATABASE_URL!);\n  }';
 return source.replace(imported,'import { neon, neonConfig, type NeonQueryFunction } from "@neondatabase/serverless";').replace(lazy,configured);
}

export function projectCurrentQETransport(source){
 assert.equal(hash(source),'775ce4b368c59a0460ab67e3030b65f3c17129da65eb10326fa42c93d0d515ca','QE_PROXY_TRANSPORT_SEAM_CHANGED');
 const webGuard='  if (!web.has(url.origin)) return false;';assert.equal(source.split(webGuard).length,2,'QE_PROXY_TRANSPORT_SEAM_CHANGED');
 const endpoint="const endpoint = typeof neonConfig.fetchEndpoint === 'function' ? neonConfig.fetchEndpoint(app.hostname, app.port) : neonConfig.fetchEndpoint;";
 assert.equal(source.split(endpoint).length,2,'QE_NEON_TRANSPORT_SEAM_CHANGED');
 const fetchStart='const fetch = globalThis.fetch;\nglobalThis.fetch = async (input, init) => {';
 const fetchEnd='  return fetch(input, init);\n};';
 assert.equal(source.split(fetchStart).length,2,'QE_FETCH_DIAGNOSTIC_START_CHANGED');
 assert.equal(source.split(fetchEnd).length,2,'QE_FETCH_DIAGNOSTIC_END_CHANGED');
 return source.replace(webGuard,webGuard+"\n  if (/^\\/eve\\/v1\\/(health|info|session(?:\\/[^/]+)?(?:\\/stream)?)$/.test(url.pathname)) return ['GET','HEAD','POST'].includes(method);")
  .replace(endpoint,currentQENeonConfiguration()+'\n'+endpoint)
  .replace(fetchStart,currentQEFailureDiagnostics()+'\n'+fetchStart+'\n try {')
  .replace(fetchEnd,'  return await fetch(input, init);\n } catch (error) {\n  recordCurrentQEFetchFailure(input,init,error);\n  throw error;\n }\n};');
}

/** Qualification-only observation. Never logs a URL, header, body, arbitrary
 * message/code or session ID, and never replaces the original fetch error. */
export function currentQEFailureDiagnostics(){
 return String.raw`const currentQEDiagnosticHash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
let currentQEDiagnosticCount=0;
function recordCurrentQEFetchFailure(input,init,error){
 try {
  if(currentQEDiagnosticCount++>=32)return;
  const codes=new Set(['ECONNREFUSED','ECONNRESET','ENOTFOUND','ETIMEDOUT','EACCES','EPERM','ERR_INVALID_URL',
   'UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT',
   'CHAT_FIXTURE_FOREIGN_IPC_DENIED','CHAT_FIXTURE_FOREIGN_SOCKET_DENIED','CHAT_FIXTURE_FOREIGN_NODE_HTTP_DENIED',
   'CHAT_FIXTURE_FOREIGN_HTTP_DENIED','CHAT_FIXTURE_FOREIGN_FETCH_DENIED','CHAT_FIXTURE_FOREIGN_NEON_DENIED']);
  const classes=new Set(['Error','TypeError','RangeError','SyntaxError','AbortError','AggregateError']);
  const own=(value,key)=>value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
  const chain=[],seen=new Set();let value=error;
  while(value&&typeof value==='object'&&!seen.has(value)&&chain.length<4){
   seen.add(value);
   const name=own(value,'name')??own(Object.getPrototypeOf(value),'name'),code=own(value,'code'),message=own(value,'message');
   chain.push({class:classes.has(name)?name:'OtherError',code:codes.has(code)?code:null,
    messageSha256:typeof message==='string'?currentQEDiagnosticHash(message.slice(0,16384)):null,
    messageTruncated:typeof message==='string'&&message.length>16384});
   value=own(value,'cause');
  }
  const target=typeof input==='string'?input:input instanceof URL?input.href:input?.url;
  let origin='unrecognized',route='unrecognized',pathSha256=null,hasQuery=false,hasFragment=false;
  try {
   const url=new URL(target);hasQuery=Boolean(url.search);hasFragment=Boolean(url.hash);
   if(!url.username&&!url.password){
    if(url.origin===model)origin='owned-model';else if(url.origin===eve)origin='owned-eve';
    else if(web.has(url.origin))origin='owned-web';
    else if(url.origin==='http://127.0.0.1:'+app.port)origin='owned-pg-endpoint';
   }
   if(origin!=='unrecognized'){
    const known=new Set(['/model','/__current_qe_neon','/.well-known/workflow/v1/flow','/eve/v1/health','/eve/v1/info','/eve/v1/session']);
    if(known.has(url.pathname))route=url.pathname;
    else if(/^\/eve\/v1\/session\/[^/]+\/stream$/.test(url.pathname))route='/eve/v1/session/:id/stream';
    else if(/^\/eve\/v1\/session\/[^/]+$/.test(url.pathname))route='/eve/v1/session/:id';
    else pathSha256=currentQEDiagnosticHash(url.pathname);
   }
  } catch {}
  const rawMethod=init?.method??(input instanceof Request?input.method:'GET');
  const method=typeof rawMethod==='string'&&['GET','HEAD','POST','PUT'].includes(rawMethod.toUpperCase())?rawMethod.toUpperCase():'OTHER';
  console.error('CURRENT_QE_FETCH_FAILURE',JSON.stringify({origin,route,pathSha256,hasQuery,hasFragment,method,chain}));
 } catch {
  // Diagnostics must never hide or substitute the original failure.
  try {console.error('CURRENT_QE_FETCH_DIAGNOSTIC_UNAVAILABLE');} catch {}
 }
}`;
}
