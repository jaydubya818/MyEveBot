import {generateKeyPairSync,createHash,verify,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
if(!process.env.FQ_MYEVE_SOURCE)throw Error('FQ_MYEVE_SOURCE_REQUIRED');
const {artifactShare,receiveArtifact}=await import(pathToFileURL(resolve(process.env.FQ_MYEVE_SOURCE,'apps/eve/lib/relay/artifacts.ts')).href);
const a=generateKeyPairSync('ed25519'),b=generateKeyPairSync('ed25519');
const pem=pair=>pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
const publicPem=pair=>pair.publicKey.export({type:'spki',format:'pem'}).toString();
const bytes=Buffer.alloc(65536,'a'),id='relay_artifact_00000000-0000-4000-8000-000000000001';
const addressA='relay://fq-owner-a/fq-agent-a',addressB='relay://fq-owner-b/fq-agent-b';
process.env.MYEVE_RELAY_ARTIFACT_PRIVATE_KEY=pem(a);
process.env.MYEVE_RELAY_ARTIFACT_ORIGIN='https://myeve-a.synthetic.invalid';
process.env.MYEVE_RELAY_ENCRYPTION_KEY=randomBytes(32).toString('hex');
const connectionA={ownerId:'fq-owner-a',address:addressA};
const metadata={sourceOwnerId:'fq-owner-a',name:'synthetic.txt',type:'text/plain',size:bytes.length,checksum:`sha256:${createHash('sha256').update(bytes).digest('hex')}`};
const payload=await artifactShare({ownerId:'fq-owner-a',connection:async()=>connectionA,database:{query:async sql=>sql.startsWith('UPDATE')?[]:sql.includes('myeve_relay_peers')?[{artifact_public_key:publicPem(b)}]:[{metadata,expires_at:new Date(Date.now()+600000).toISOString()}]}},id,addressB);
const source=new URL(payload.retrieval.url).searchParams.get('token');
const material=token=>token.split('.').slice(0,2).join('.');
const valid=(token,key)=>verify(null,Buffer.from(material(token)),key,Buffer.from(token.split('.')[2],'base64url'));
let proof;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(_url,options)=>{proof=options.headers.authorization.slice(7);return new Response(bytes);};
try{
 process.env.MYEVE_RELAY_ARTIFACT_PRIVATE_KEY=pem(b);
 await receiveArtifact({ownerId:'fq-owner-b',connection:async()=>({ownerId:'fq-owner-b',address:addressB}),database:{query:async sql=>sql.includes('SELECT * FROM myeve_relay_peers')?[{artifact_origin:'https://myeve-a.synthetic.invalid',artifact_public_key:publicPem(a)}]:[]}},
 {id:'fq-artifact-request',target:{address:addressB},caller:{ownerId:'fq-owner-a',agentId:'fq-agent-a'},resource:id,capability:'artifact.share',idempotencyKey:'fq-artifact-request',expiresAt:new Date(Date.now()+60000).toISOString(),payload});
 console.log(JSON.stringify({mode:'actual_MyEve_functions_with_synthetic_store_and_fetch',artifactBytes:bytes.length,sourceAssertionSigningBytes:Buffer.byteLength(material(source)),sourceAssertionTokenBytes:source.length,sourceVerified:valid(source,publicPem(a)),receiverProofSigningBytes:Buffer.byteLength(material(proof)),receiverProofTokenBytes:proof.length,receiverVerified:valid(proof,publicPem(b)),maxVerifierAcceptedSigningBytes:8192-87},null,2));
}finally{globalThis.fetch=originalFetch;}
