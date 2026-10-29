import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILD_FAILURE_METADATA_MAX_BYTES,encodeBuildFailureMetadata} from './build-failure-metadata.mjs';

const decode=(...values)=>JSON.parse(encodeBuildFailureMetadata(...values));
test('failure metadata has only the fixed public schema and observed scalar fields',()=>{
 assert.deepEqual(decode('EVE_BUILD',4242,null,'SIGKILL','QUIESCENT'),{
  schema:'myapps.build-command-failure.v1',status:'FAILURE_METADATA_ONLY',
  phase:'EVE_BUILD',ownedChildPid:4242,exitCode:null,signal:'SIGKILL',cleanupState:'QUIESCENT'});
 assert.equal(BUILD_FAILURE_METADATA_MAX_BYTES,2048);
});
for(const phase of ['UNKNOWN','INSTALL','PATCH','PATCH_CHECK','SDK_AUTHENTICATE','EVE_BUILD','NEXT_BUILD'])
 test('fixed phase retained: '+phase,()=>assert.equal(decode(phase,123,1,null,'UNKNOWN').phase,phase));
test('missing child identity, exit code and signal stay unknown',()=>{
 const value=decode();assert.equal(value.phase,'UNKNOWN');assert.equal(value.ownedChildPid,null);
 assert.equal(value.exitCode,null);assert.equal(value.signal,null);assert.equal(value.cleanupState,'UNKNOWN');
});
test('exit0 during an otherwise failed command cannot become a qualification result',()=>{
 const value=decode('NEXT_BUILD',123,0,null,'QUIESCENT');
 assert.equal(value.status,'FAILURE_METADATA_ONLY');assert.equal(value.exitCode,0);
 assert(!Object.values(value).includes('PASS'));
});
test('unapproved names and private strings cannot enter public metadata',()=>{
 const secret='synthetic-secret://owner.example/private';
 const body=encodeBuildFailureMetadata(secret,secret,secret,secret,secret),value=JSON.parse(body);
 assert.equal(value.phase,'UNKNOWN');assert.equal(value.ownedChildPid,null);assert.equal(value.exitCode,null);
 assert.equal(value.signal,null);assert.equal(value.cleanupState,'UNKNOWN');assert(!body.includes(secret));
});
test('hostile getters, proxies and coercion hooks are never observed',()=>{
 let touched=0;
 const hostile=new Proxy({},{get(){touched++;throw Error('getter');},ownKeys(){touched++;throw Error('keys');},
  getPrototypeOf(){touched++;throw Error('prototype');}});
 const coercion={toJSON(){touched++;throw Error('json');},toString(){touched++;throw Error('string');},
  [Symbol.toPrimitive](){touched++;throw Error('primitive');}};
 for(const item of [hostile,coercion,Symbol('private'),1n]){
  const value=decode(item,item,item,item,item);
  assert.equal(value.phase,'UNKNOWN');assert.equal(value.ownedChildPid,null);assert.equal(value.exitCode,null);
  assert.equal(value.signal,null);assert.equal(value.cleanupState,'UNKNOWN');
 }
 assert.equal(touched,0);
});
test('out-of-range or wrong primitive numeric observations stay null',()=>{
 for(const pid of [0,-1,1.5,NaN,Infinity,0x80000000,Number.MAX_SAFE_INTEGER,'123',true,null])
  assert.equal(decode('INSTALL',pid,1,null,'UNKNOWN').ownedChildPid,null);
 for(const code of [-1,256,1.5,NaN,Infinity,'1',true,null])
  assert.equal(decode('INSTALL',123,code,null,'UNKNOWN').exitCode,null);
 assert.equal(decode('INSTALL',0x7fffffff,255,null,'UNKNOWN').ownedChildPid,0x7fffffff);
 assert.equal(decode('INSTALL',123,255,null,'UNKNOWN').exitCode,255);
});
test('oversized hostile values do not enlarge the public projection or echo input',()=>{
 const secret='SYNTHETIC_PRIVATE_'.repeat(4096);
 const body=encodeBuildFailureMetadata(secret,secret,secret,secret,secret);
 assert(Buffer.byteLength(body)<BUILD_FAILURE_METADATA_MAX_BYTES);assert(!body.includes('SYNTHETIC_PRIVATE_'));
 assert.equal(JSON.parse(body).phase,'UNKNOWN');
});
test('unapproved signal and cleanup strings remain unknown even if they resemble trusted enums',()=>{
 for(const signal of ['SIGKILL private','sigkill','SIGRTMIN','Error: SIGKILL','SIGKILL\n'])
  assert.equal(decode('EVE_BUILD',123,null,signal,'QUIESCENT').signal,null);
 for(const cleanup of ['PASS','QUIESCENT private','quiescent','QUIESCENT\n'])
  assert.equal(decode('EVE_BUILD',123,null,'SIGKILL',cleanup).cleanupState,'UNKNOWN');
});
