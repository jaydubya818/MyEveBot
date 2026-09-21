import {isDeepStrictEqual} from 'node:util';
import {job} from './jobs.mjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Denied, boundedModel, admitHttp } from './postgres.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>{throw new Denied(code);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,120}$/.test(x);
export function requestBinding(method,url,body){return hash(JSON.stringify([method,new URL(url).href,hash(body)]));}
/** Only this process receives the fq_control UPDATE connection. Clients receive
 * distinct role credentials, and cannot reserve arbitrary costs/classifications.
 * Control-plane RPC is bounded separately and never performs provider requests. */
export class Controller {
 constructor(authority,{principals,routes,request=fetch,model,ingressSecrets={},signingKeys={}}) {
  this.authority=authority;this.principals=structuredClone(principals);this.routes=structuredClone(routes);this.request=request;this.model=model;this.ingressSecrets={...ingressSecrets};this.signingKeys=structuredClone(signingKeys);
  if(Object.values(principals).some(p=>!/^[a-f0-9]{64}$/.test(p.credentialHash)||!['worker','origin','operator'].includes(p.role)))throw Error('Invalid principals');
  if(new Set(Object.values(principals).map(p=>p.credentialHash)).size!==Object.keys(principals).length)throw Error('Distinct principal credentials required');
  for(const p of Object.values(principals)){
   if(p.role==='worker'&&(!/^[a-f0-9]{40}$/.test(p.sha??'')||!['myeve','peer','relay'].includes(p.component)))throw Error('Pinned worker required');
   if(p.role==='origin'&&principals[p.worker]?.role!=='worker')throw Error('Origin worker binding required');
   if(p.ownerId!==undefined&&!/^fq[-_][A-Za-z0-9_-]+$/.test(p.ownerId))throw Error('Synthetic owner required');
  }
  for(const route of Object.values(routes)){const u=new URL(route.url);if(u.protocol!=='https:'||u.username||u.password||u.hash||(!route.provider&&(!principals[route.origin]||principals[route.origin].role!=='origin')))throw Error('Invalid origin');}
 }
 authenticate(bearer){
  if(typeof bearer!=='string'||!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(bearer))fail('AUTHENTICATION');
  const digest=Buffer.from(hash(bearer.slice(7)),'hex');
  const match=Object.entries(this.principals).find(([,p])=>timingSafeEqual(digest,Buffer.from(p.credentialHash,'hex')));
  if(!match)fail('AUTHENTICATION');return {name:match[0],...match[1]};
 }
 live(s,now,p){this.authority.check(s,now);const worker=s.workers?.[p.worker??p.name];if(!['worker','origin','operator'].includes(p.role)||!worker||!Number.isFinite(worker.at)||now-worker.at>10||worker.sha!==(this.principals[p.worker??p.name]?.sha??p.sha))fail('WORKER_UNAVAILABLE');}
 async heartbeat(p,sha){
  if(p.role!=='worker'||sha!==p.sha||!/^[a-f0-9]{40}$/.test(sha))fail('WORKER_IDENTITY');
  return this.authority.transaction((s,now)=>{this.authority.check(s,now);s.workers??={};s.workers[p.name]={at:now,sha};return {session:this.authority.id,sha,deadline:s.start+2700};});
 }
 async permit(p,operation,method,url,body,origin){
  const nonce=randomBytes(32).toString('base64url');
  let requestOperation;try{requestOperation=JSON.parse(body.toString()).operation;}catch{}
  await this.authority.transaction((s,now)=>{this.live(s,now,p);if(!id(operation))fail('INVALID_OPERATION');s.permits??={};if(s.permits[operation])fail('PERMIT_EXISTS');s.permits[operation]={hash:hash(nonce),binding:requestBinding(method,url,body),origin,requestOperation,worker:p.worker??p.name,expires:now+15,used:false};});
  return nonce;
 }
 async claim(p,{operation,permit,method,url,bodyBase64}){
  if(p.role!=='origin'||!id(operation)||typeof permit!=='string'||typeof bodyBase64!=='string'||bodyBase64.length>350000)fail('PERMIT_INVALID');
  return this.authority.transaction((s,now)=>{this.live(s,now,p);const v=s.permits?.[operation];if(!v||v.used||v.expires<=now||v.origin!==p.name||v.hash!==hash(permit)||v.binding!==requestBinding(method,url,Buffer.from(bodyBase64,'base64')))fail('PERMIT_INVALID');const worker=s.workers?.[v.worker];if(!worker||!Number.isFinite(worker.at)||now-worker.at>10)fail('WORKER_UNAVAILABLE');v.used=true;return {admitted:true,operation};});
 }
 async http(p,{operation,route:routeId,url:requestedUrl,method:requestedMethod,headers:forwarded={},bodyBase64=''}){
  const route=this.routes[`${p.name}:${routeId}`]??this.routes[routeId];if(!route||route.provider||!route.callers.includes(p.name)||!id(operation)||typeof bodyBase64!=='string'||bodyBase64.length>524288)fail('ROUTE_DENIED');
  const url=new URL(requestedUrl??route.url),base=new URL(route.url),method=requestedMethod??route.method;
  if(url.origin!==base.origin||url.username||url.password||url.hash||!(route.methods??[route.method]).includes(method)||
    (route.pathPattern?!new RegExp(route.pathPattern).test(url.pathname):url.href!==base.href))fail('ROUTE_DENIED');
  const body=Buffer.from(bodyBase64,'base64');if(body.length>(route.provider?393216:131072))fail('BODY_SIZE');
  if(!forwarded||typeof forwarded!=='object'||Object.keys(forwarded).some(k=>!['authorization','cookie','origin','content-type'].includes(k.toLowerCase()))||Object.values(forwarded).some(v=>typeof v!=='string'||v.length>16384||/[\r\n]/.test(v)))fail('HEADER_DENIED');
  await this.authority.transaction((s,now)=>this.live(s,now,p));
  let submittedOperation;try{submittedOperation=JSON.parse(body.toString()).operation;}catch{}
  await admitHttp(this.authority,operation,{submission:route.submission===true||route.submissionOperations?.includes(submittedOperation)===true,channel:'origin'},()=>this.active(p));
  const permit=await this.permit(p,operation,method,url.href,body,route.origin??'provider');
  if(route.provider)await this.authority.transaction((s,now)=>{this.live(s,now,p);const v=s.permits[operation];if(v.used||v.expires<=now)fail('PERMIT_INVALID');v.used=true;});
  const response=await this.request(url.href,{method,headers:{...forwarded,'x-fq-operation':operation,'x-fq-permit':permit,...(this.ingressSecrets[url.origin]?{'x-vercel-protection-bypass':this.ingressSecrets[url.origin]}:{})},...(['GET','HEAD'].includes(method)?{}:{body}),redirect:'error',signal:AbortSignal.timeout(15000)});
  const parts=[];let bytes=0;
  for await(const chunk of response.body??[]){bytes+=chunk.byteLength;if(bytes>262144)fail('RESPONSE_SIZE');parts.push(Buffer.from(chunk));}
  await this.authority.transaction((s)=>{if(!s.permits?.[operation]?.used)fail('ORIGIN_NOT_GUARDED');});
  await this.authority.complete(operation);
  return {status:response.status,headers:Object.fromEntries(['content-type','set-cookie'].flatMap(k=>response.headers.has(k)?[[k,response.headers.get(k)]]:[])),bodyBase64:Buffer.concat(parts).toString('base64')};
 }
 async providerAdmission(p,{operation,route:routeId,url,method,bodyHash,rootOperation}){
  const route=this.routes[`${p.name}:${routeId}`]??this.routes[routeId];
  const target=new URL(url),base=new URL(route?.url??'https://denied.invalid');
  if(p.role!=='origin'||p.worker!=='relay'||!route?.provider||!route.callers.includes(p.name)||target.origin!==base.origin||target.username||target.password||target.hash||!(route.methods??[route.method]).includes(method)||!new RegExp(route.pathPattern).test(target.pathname)||!/^[a-f0-9]{64}$/.test(bodyHash))fail('PROVIDER_ROUTE_DENIED');
  await this.authority.transaction((s,now)=>{this.live(s,now,p);if(!s.active[rootOperation]||s.permits?.[rootOperation]?.origin!==p.name||!s.permits[rootOperation].used)fail('PROVIDER_ROOT_DENIED');});
  await admitHttp(this.authority,operation,{channel:'provider'},()=>this.active(p));
  const permit=randomBytes(32).toString('base64url');
  await this.authority.transaction((s,now)=>{this.live(s,now,p);s.providerPermits??={};s.providerPermits[operation]={principal:p.name,hash:hash(permit),binding:hash(JSON.stringify([method,target.href,bodyHash])),expires:now+15,used:false};});
  return {operation,permit};
 }
 async providerClaim(p,{operation,permit,url,method,bodyHash}){
  return this.authority.transaction((s,now)=>{this.live(s,now,p);const v=s.providerPermits?.[operation];if(!v||v.principal!==p.name||v.used||v.expires<=now||v.hash!==hash(permit)||v.binding!==hash(JSON.stringify([method,new URL(url).href,bodyHash])))fail('PROVIDER_PERMIT_DENIED');v.used=true;return {admitted:true};});
 }
 async providerComplete(p,{operation}){
  await this.authority.transaction((s,now)=>{this.live(s,now,p);const v=s.providerPermits?.[operation];if(!v?.used||v.principal!==p.name)fail('PROVIDER_PERMIT_DENIED');});
  await this.authority.complete(operation);return {completed:true};
 }
 signingBinding(input){
  const {rootOperation,requestId,accountId,agentId,purpose,operation,payloadHash,keyVersion}=input;
  if(!id(rootOperation)||typeof requestId!=='string'||!requestId||requestId.length>255||typeof accountId!=='string'||!accountId||accountId.length>255||!(agentId===null||typeof agentId==='string'&&agentId.length<=255)||!['evidence','federation-delivery','passport'].includes(purpose)||typeof operation!=='string'||!/^[a-f0-9]{64}$/.test(payloadHash)||this.signingKeys[purpose]!==keyVersion)fail('SIGNING_BINDING_DENIED');
  return {rootOperation,requestId,accountId,agentId,purpose,operation,payloadHash,keyVersion};
 }
 async signingAdmission(p,input){
  if(p.role!=='origin'||p.worker!=='relay')fail('SIGNING_ROLE_DENIED');
  const binding=this.signingBinding(input),permit=randomBytes(32).toString('base64url'),permitId=randomBytes(18).toString('hex');
  await this.authority.transaction((s,now)=>{this.live(s,now,p);const root=s.permits?.[binding.rootOperation];
   if(!root?.used||root.origin!==p.name||!s.active[binding.rootOperation]||!p.accountIds?.includes(binding.accountId)||root.requestOperation!==binding.operation||(binding.purpose==='federation-delivery'&&binding.operation!=='poll'))fail('SIGNING_ROOT_DENIED');
   s.signingPermits??={};s.signingPermits[permitId]={binding,hash:hash(permit),principal:p.name,expires:now+15,used:false};
  });return {permitId,permit};
 }
 async signingClaim(p,input){
  const binding=this.signingBinding(input);
  return this.authority.transaction((s,now)=>{this.live(s,now,p);const v=s.signingPermits?.[input.permitId];
   if(p.role!=='origin'||p.worker!=='relay'||!v||v.principal!==p.name||v.used||v.expires<=now||v.hash!==hash(input.permit)||!isDeepStrictEqual(v.binding,binding)||!s.active[binding.rootOperation])fail('SIGNING_PERMIT_DENIED');
   v.used=true;s.events.push({kind:'signing_permit_consumed',...binding,at:now});return {admitted:true};
  });
 }
 async artifact(p,{operation,bodyBase64,ownerId,artifactId}){
  if(!['worker','origin'].includes(p.role)||ownerId!==p.ownerId||!ownerId||typeof artifactId!=='string'||artifactId.length>255||!id(operation)||typeof bodyBase64!=='string'||bodyBase64.length>87384)fail('ARTIFACT_DENIED');
  const bytes=Buffer.from(bodyBase64,'base64');if(bytes.length>65536)fail('ARTIFACT_SIZE');
  const digest=hash(bytes),key=hash(JSON.stringify([ownerId,artifactId]));
  return this.authority.transaction((s,now)=>{
   this.live(s,now,p);this.authority.operation(s,operation);s.artifactRegistry??={};
   const existing=s.artifactRegistry[key];
   if(existing&&(existing.digest!==digest||existing.bytes!==bytes.length))fail('ARTIFACT_CHANGED');
   if(!existing){if(s.artifacts>=8||s.artifactBytes+bytes.length>524288)fail('ARTIFACT_TOTAL');s.artifacts++;s.artifactBytes+=bytes.length;s.artifactRegistry[key]={digest,bytes:bytes.length,ownerId};}
   // Each storage/publication/exposure authorization is a fresh one-use operation;
   // replaying the same artifact allocation with a new permit never refunds it.
   s.operations[operation]={kind:'artifact',status:'COMPLETED',ownerId,binding:key,digest,expires:now+15};
   s.events.push({kind:'artifact_permit_consumed',operation,ownerId,binding:key,digest,at:now});
   return {bytes:bytes.length,sha256:digest,ownerId,artifactId,operation,expiresAt:(now+15)*1000};
  });
 }
 async active(p){return this.authority.transaction((s,now)=>{this.live(s,now,p);return {active:true,session:this.authority.id};});}
 async modelCall(p,{operation,input}){
  if(p.role!=='worker'||!['myeve','peer'].includes(p.component))fail('MODEL_ROLE_DENIED');
  await this.authority.transaction((s,now)=>this.live(s,now,p));
  if(!this.model||!this.model.verifiedLiabilityReference)fail('MODEL_LIABILITY_UNVERIFIED');
  // Model adapter, provider key, price and token bounds are operator-owned; none
  // are caller-supplied. The adapter must report actual provider cost.
  return boundedModel(this.authority,operation,{component:p.component,maximumMicrousd:250000,reference:this.model.verifiedLiabilityReference,authorize:()=>this.active(p)},signal=>this.model.invoke(input,signal,operation));
 }
 async dispatch(bearer,action,input){const p=this.authenticate(bearer);if(action.startsWith('job-'))return job(this,p,action,input);switch(action){case 'signing-admit':return this.signingAdmission(p,input);case 'signing-claim':return this.signingClaim(p,input);case 'provider-admit':return this.providerAdmission(p,input);case 'provider-claim':return this.providerClaim(p,input);case 'provider-complete':return this.providerComplete(p,input);case 'active':return this.active(p);case 'heartbeat':return this.heartbeat(p,input.sha);case 'claim':return this.claim(p,input);case 'http':return this.http(p,input);case 'artifact':return this.artifact(p,input);case 'model':return this.modelCall(p,input);case 'disable-model':if(p.role!=='operator')fail('ROLE_DENIED');return {disabled:this.model?.disable()===true};case 'stop':if(p.role!=='operator')fail('ROLE_DENIED');await this.authority.stop();return {stopped:true};default:fail('ACTION_DENIED');}}
}
