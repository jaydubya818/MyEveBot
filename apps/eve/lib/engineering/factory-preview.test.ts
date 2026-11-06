import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {LiveFactoryAdapter} from './factory-live-adapter.ts';
import {digest} from './contract.ts';

const sourceDigest='1'.repeat(64),configurationDigest='2'.repeat(64);
const connection={origin:'http://127.0.0.1:8789',token:'a'.repeat(64),factoryId:'factory-local',sourceDigest,configurationDigest,
 factoryVersion:digest({sourceDigest,configurationDigest}),repositoryPath:'/repo',
 keys:[{factoryId:'factory-local',keyId:'k',publicKey:'pem',activeFrom:'2026-01-01T00:00:00Z',notAfter:'2027-01-01T00:00:00Z'}],
 qualification:{scopeId:'owner',profileHash:'0'.repeat(64),evidenceRef:'test',qualifiedAt:'2026-11-01T00:00:00Z',expiresAt:'2026-12-01T00:00:00Z',mode:'LIVE' as const,spendEnforced:true}};
describe('Factory candidate preview',()=>{
 it('requests the preview for the exact request and returns a loopback URL on the configured origin',async()=>{
  const requestId=randomUUID(),calls:{url:string;method:string}[]=[],token='f'.repeat(64);
  const fetcher=(async(url:URL,init:RequestInit)=>{calls.push({url:String(url),method:String(init.method)});
   return Response.json({state:'READY',requestId,runId:randomUUID(),candidateCommit:'c'.repeat(40),path:`/preview/${token}/`,files:2});}) as unknown as typeof fetch;
  const preview=await new LiveFactoryAdapter(connection,fetcher).preview(requestId,'c'.repeat(40));
  expect(calls).toEqual([{url:`http://127.0.0.1:8789/api/connect/v1/dispatches/${requestId}/preview`,method:'POST'}]);
  expect(preview).toEqual({url:`http://127.0.0.1:8789/preview/${token}/`,candidateCommit:'c'.repeat(40)});
 });
 it('refuses a preview for another request or candidate, or a path that leaves the preview root',async()=>{
  const requestId=randomUUID();
  for(const body of [{state:'READY',requestId:randomUUID(),candidateCommit:'c'.repeat(40),path:`/preview/${'f'.repeat(64)}/`},
   {state:'READY',requestId,candidateCommit:'d'.repeat(40),path:`/preview/${'f'.repeat(64)}/`},
   {state:'READY',requestId,candidateCommit:'c'.repeat(40),path:'https://elsewhere.example/'}]){
   const fetcher=(async()=>Response.json(body)) as unknown as typeof fetch;
   await expect(new LiveFactoryAdapter(connection,fetcher).preview(requestId,'c'.repeat(40))).rejects.toThrow('FACTORY_PREVIEW_BINDING');
  }
 });
});
