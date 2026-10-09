// Local-only canonical contract producer/consumer qualification. No provider calls.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const relay=resolve(process.env.RELAY_SOURCE);
const get=p=>import(pathToFileURL(resolve(relay,p)).href);
const {signDelivery,verifyDelivery}=await get('lib/v2/federation/transport.ts');
const {federationSigningEnvelope}=await get('lib/v2/federation/signing-envelope.ts');
const {envelopeV2Fixtures,qualificationAudience,qualificationIssuer,qualificationKeyVersion}=await get('scripts/production-qualification/envelope-v2-fixtures.ts');
const {canonical,verifyEnvelope}=await import('../../apps/eve/lib/relay/transport.ts');
const hash=x=>createHash('sha256').update(x).digest('hex');
const cases=[],vectors=[];
const pair=generateKeyPairSync('ed25519');const publicKey=pair.publicKey.export({type:'spki',format:'pem'}).toString();
const clock=new Date();
for(const f of envelopeV2Fixtures(clock)){
 let input='',calls=0;
 const signer={keyId:f.keyId,keyVersion:qualificationKeyVersion,publicKeyPem:async()=>publicKey,sign:async data=>{input=data;calls++;return sign(null,Buffer.from(data),pair.privateKey).toString('base64url');},verify:async()=>{throw Error('Unused');}};
 const bindings={signer,issuer:qualificationIssuer,keyWrapper:{keyId:'unused',wrap:async()=>{throw Error('Unused');},unwrap:async()=>{throw Error('Unused');}}};
 const token=await signDelivery(f.envelope,qualificationAudience,String(f.envelope.id),String(f.envelope.expiresAt),bindings);
 const verifier={issuer:qualificationIssuer,audience:qualificationAudience,trustedPublicKey:async(id,v)=>id===f.keyId&&v===qualificationKeyVersion?publicKey:undefined,claimRequest:async()=>true};
 const identity={issuer:qualificationIssuer,address:qualificationAudience,ownerId:'fq-owner-b',agentId:'fq-agent-b',keyId:f.keyId,keyVersion:qualificationKeyVersion,publicKey};
 assert.deepEqual(await verifyDelivery(token,verifier),verifyEnvelope(token,identity));
 const parts=token.split('.'),material=parts.slice(0,2).join('.');
 // MyEve's canonical serializer reconstructs precisely Relay's signed bytes.
 const reconstructed=canonical(JSON.parse(input));assert.equal(input,reconstructed);
 const locallySigned=material+'.'+sign(null,Buffer.from(reconstructed),pair.privateKey).toString('base64url');
 await verifyDelivery(locallySigned,verifier);verifyEnvelope(locallySigned,identity);
 const deny=async(t,label)=>{await assert.rejects(verifyDelivery(t,verifier),undefined,label);assert.throws(()=>verifyEnvelope(t,identity),undefined,label);};
 const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString());payload.envelope.caller.agentId='tampered';await deny(parts[0]+'.'+Buffer.from(canonical(payload)).toString('base64url')+'.'+parts[2],'tamper');
 for(const [field,value] of [['purpose','passport'],['version',3],['protocol','relay.audit'],['signingAlgorithm','EdDSA'],['keyIdentity',{id:'wrong',version:qualificationKeyVersion}]]){
  const altered={...JSON.parse(input),[field]:value};await deny(material+'.'+sign(null,Buffer.from(canonical(altered)),pair.privateKey).toString('base64url'),field);
 }
 const downgrade=Buffer.from(canonical({alg:'EdDSA',typ:'relay-federation+jwt',kid:f.keyId})).toString('base64url');await deny(downgrade+'.'+parts[1]+'.'+parts[2],'downgrade');
 const wrong=generateKeyPairSync('ed25519');await deny(material+'.'+sign(null,Buffer.from(input),wrong.privateKey).toString('base64url'),'wrong key');
 assert.equal(calls,1);assert.equal(token.length,f.materialBytes+87);
 cases.push({name:f.name,materialBytes:f.materialBytes,tokenCharacters:token.length,providerInputBytes:Buffer.byteLength(input),relayToMyEve:'PASS',myEveCanonicalBytesToRelay:'PASS',tamperPurposeVersionDomainAlgorithmKeyDowngrade:'DENY'});
 if(f.name==='small')vectors.push({contract:'relay-federation-v2',purpose:'federation-delivery',keyId:f.keyId,keyVersion:qualificationKeyVersion,publicKey,token,payloadDigest:hash(material),requestId:f.envelope.id});
}
const oversized=envelopeV2Fixtures(new Date(),[262058]).at(-1);let calls=0;
await assert.rejects(signDelivery(oversized.envelope,qualificationAudience,String(oversized.envelope.id),String(oversized.envelope.expiresAt),{issuer:qualificationIssuer,signer:{keyId:oversized.keyId,keyVersion:qualificationKeyVersion,sign:async()=>{calls++;throw Error('Forbidden signer');}},keyWrapper:{}}),{status:413});assert.equal(calls,0);
const worstInput=federationSigningEnvelope('synthetic',{id:'\u0000'.repeat(255),version:'\u0000'.repeat(512)});assert.ok(Buffer.byteLength(worstInput)<8192);
const report={status:'PASS',contract:'relay-federation-v2',relaySource:execFileSync('git',['rev-parse','HEAD'],{cwd:relay,encoding:'utf8'}).trim(),contractHash:hash(readFileSync(new URL('../../apps/eve/lib/relay/fixtures/canonical-relay-v2.json',import.meta.url))),cases,maximumPlusOne:{rejected:true,signerCalls:calls},worstSchemaSigningInputBytes:Buffer.byteLength(worstInput),absoluteSigningInputCapBytes:8192,kmsCalls:0,reverseRuntimeDeliverySigning:'NOT_APPLICABLE: MyEve does not issue Relay delivery assertions; canonical byte reconstruction tested',vectors};
writeFileSync(process.env.PROTOCOL_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,vectors:'public synthetic token saved in report'},null,2));
