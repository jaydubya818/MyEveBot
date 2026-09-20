import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Denied, boundedModel } from './postgres.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>{throw new Denied(code);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,120}$/.test(x);
export function requestBinding(method,url,body){return hash(JSON.stringify([method,new URL(url).href,hash(body)]));}
/** Only this process receives the fq_control UPDATE connection. Clients receive
 * distinct role credentials, and cannot reserve arbitrary costs/classifications.
 * Control-plane RPC is bounded separately and never performs provider requests. */
export class Controller {
 constructor(authority,{principals,routes,request=fetch,model}) {
  this.authority=authority;this.principals=structuredClone(principals);this.routes=structuredClone(routes);this.request=request;this.model=model;
  if(Object.values(principals).some(p=>!/^[a-f0-9]{64}$/.test(p.credentialHash)||!['worker','origin','operator'].includes(p.role)))throw Error('Invalid principals');
  for(const route of Object.values(routes)){const u=new URL(route.url);if(u.protocol!=='https:'||u.username||u.password||u.hash||!principals[route.origin]||principals[route.origin].role!=='origin')throw Error('Invalid origin');}
 }
 authenticate(bearer){
  if(typeof bearer!=='string'||!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(bearer))fail('AUTHENTICATION');
  const digest=Buffer.from(hash(bearer.slice(7)),'hex');
  const match=Object.entries(this.principals).find(([,p])=>timingSafeEqual(digest,Buffer.from(p.credentialHash,'hex')));
  if(!match)fail('AUTHENTICATION');return {name:match[0],...match[1]};
 }
 live(s,now,p){this.authority.check(s,now);const worker=s.workers?.[p.name];if(p.role!=='worker'||!worker||!Number.isFinite(worker.at)||now-worker.at>10||worker.sha!==p.sha)fail('WORKER_UNAVAILABLE');}
 async heartbeat(p,sha){
  if(p.role!=='worker'||sha!==p.sha||!/^[a-f0-9]{40}$/.test(sha))fail('WORKER_IDENTITY');
  return this.authority.transaction((s,now)=>{this.authority.check(s,now);s.workers??={};s.workers[p.name]={at:now,sha};return {session:this.authority.id,sha,deadline:s.start+2700};});
 }
 async permit(p,operation,method,url,body,origin){
  const nonce=randomBytes(32).toString('base64url');
  await this.authority.transaction((s,now)=>{this.live(s,now,p);if(!id(operation))fail('INVALID_OPERATION');s.permits??={};if(s.permits[operation])fail('PERMIT_EXISTS');s.permits[operation]={hash:hash(nonce),binding:requestBinding(method,url,body),origin,worker:p.name,expires:now+15,used:false};});
  return nonce;
 }
 async claim(p,{operation,permit,method,url,bodyBase64}){
  if(p.role!=='origin'||!id(operation)||typeof permit!=='string'||typeof bodyBase64!=='string'||bodyBase64.length>350000)fail('PERMIT_INVALID');
  return this.authority.transaction((s,now)=>{this.authority.check(s,now);const v=s.permits?.[operation];if(!v||v.used||v.expires<=now||v.origin!==p.name||v.hash!==hash(permit)||v.binding!==requestBinding(method,url,Buffer.from(bodyBase64,'base64')))fail('PERMIT_INVALID');const worker=s.workers?.[v.worker];if(!worker||!Number.isFinite(worker.at)||now-worker.at>10)fail('WORKER_UNAVAILABLE');v.used=true;return {admitted:true};});
 }
 async http(p,{operation,route:routeId,bodyBase64=''}){
  const route=this.routes[routeId];if(!route||!route.callers.includes(p.name)||!id(operation)||typeof bodyBase64!=='string'||bodyBase64.length>175000)fail('ROUTE_DENIED');
  const body=Buffer.from(bodyBase64,'base64');if(body.length>131072)fail('BODY_SIZE');
  await this.authority.transaction((s,now)=>this.live(s,now,p));
  // Every attempt, including a caller-requested retry with a fresh operation ID,
  // consumes the aggregate allowance. Reusing an ID never repeats the request.
  await this.authority.http(operation,{submission:route.submission===true});
  const permit=await this.permit(p,operation,route.method,route.url,body,route.origin);
  const response=await this.request(route.url,{method:route.method,headers:{'content-type':'application/json','x-fq-operation':operation,'x-fq-permit':permit},...(route.method==='GET'?{}:{body}),redirect:'error',signal:AbortSignal.timeout(15000)});
  const parts=[];let bytes=0;
  for await(const chunk of response.body??[]){bytes+=chunk.byteLength;if(bytes>262144)fail('RESPONSE_SIZE');parts.push(Buffer.from(chunk));}
  await this.authority.transaction((s)=>{if(!s.permits?.[operation]?.used)fail('ORIGIN_NOT_GUARDED');});
  await this.authority.complete(operation);
  return {status:response.status,bodyBase64:Buffer.concat(parts).toString('base64')};
 }
 async artifact(p,{operation,bodyBase64}){
  await this.authority.transaction((s,now)=>this.live(s,now,p));
  if(!id(operation)||typeof bodyBase64!=='string'||bodyBase64.length>87384)fail('ARTIFACT_SIZE');
  const bytes=await this.authority.artifact(operation,[Buffer.from(bodyBase64,'base64')]);
  return {bytes:bytes.length,sha256:hash(bytes),bodyBase64:bytes.toString('base64')};
 }
 async modelCall(p,{operation,input}){
  await this.authority.transaction((s,now)=>this.live(s,now,p));
  if(!this.model||!this.model.verifiedLiabilityReference)fail('MODEL_LIABILITY_UNVERIFIED');
  // Model adapter, provider key, price and token bounds are operator-owned; none
  // are caller-supplied. The adapter must report actual provider cost.
  return boundedModel(this.authority,operation,{component:p.component,maximumMicrousd:250000,reference:this.model.verifiedLiabilityReference},signal=>this.model.invoke(input,signal,operation));
 }
 async dispatch(bearer,action,input){const p=this.authenticate(bearer);switch(action){case 'heartbeat':return this.heartbeat(p,input.sha);case 'claim':return this.claim(p,input);case 'http':return this.http(p,input);case 'artifact':return this.artifact(p,input);case 'model':return this.modelCall(p,input);case 'stop':if(p.role!=='operator')fail('ROLE_DENIED');await this.authority.stop();return {stopped:true};default:fail('ACTION_DENIED');}}
}
