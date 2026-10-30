/** Synthetic builders only: invented git objects, throwaway Ed25519 keys, no real repository, model, credential or spend. */
import {createHash,generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import * as codec from '../lib/engineering/factory-producer-protocol.ts';
import {digest} from '../lib/engineering/contract.ts';

const objectId=(kind,bytes)=>createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest('hex');
const tree=body=>Buffer.concat([Buffer.from('100644 input.txt\0'),Buffer.from(objectId('blob',Buffer.from(body)),'hex')]);
export const h=c=>c.repeat(64);

/** A synthetic Factory that signs a chain of completed stage Results, each based on the previous candidate. */
export function syntheticFactory(){
 const pair=generateKeyPairSync('ed25519');
 const configuration={model:'openai/gpt-5.4-mini',executor:'codex-cli',executorVersion:'synthetic-only',skillRevision:'synthetic-skill',workerProfile:'mac',verificationImage:'synthetic-verifier',nodeVersion:'v24.18.1',platform:'darwin',architecture:'arm64',commands:['node --test synthetic.test.mjs'],allowedPaths:['input.txt'],timeoutMs:1000};
 const sourceDigest=h('1'),configurationDigest=codec.digest(configuration),factoryId='synthetic-qdev-factory';
 const factoryVersion=codec.digest({sourceDigest,configurationDigest});
 const base=Buffer.from(`tree ${objectId('tree',tree('baseline\n'))}\nauthor S <s@example.invalid> 1793016000 +0000\ncommitter S <s@example.invalid> 1793016000 +0000\n\nSynthetic baseline\n`);
 const baseline={commit:objectId('commit',base),tree:objectId('tree',tree('baseline\n'))};
 const key={factoryId,keyId:'synthetic-key',publicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:'2020-01-01T00:00:00Z',notAfter:'2099-01-01T00:00:00Z'};
 const expectedByStage={};
 function stage(n,input,{mutate,dropArtifacts}={}){
  const candTree=tree('stage '+n+'\n'),candTreeId=objectId('tree',candTree);
  const commit=Buffer.from(`tree ${candTreeId}\nparent ${input.commit}\nauthor S <s@example.invalid> 179301600${n} +0000\ncommitter S <s@example.invalid> 179301600${n} +0000\n\nSynthetic stage ${n}\n`);
  const candidate=objectId('commit',commit),patch=Buffer.from('Synthetic inert patch '+n+'\n'),log=Buffer.from('Synthetic producer check '+n+'\n');
  const request={stage:n};
  const execution={version:4,factoryId,factoryVersion,sourceDigest,configurationDigest,configuration,requestId:'synthetic-request-'+n,requestDigest:codec.digest(request),workOrderId:randomUUID(),runId:randomUUID(),attemptNumber:1,inputCommit:input.commit,inputTree:input.tree,workspace:{kind:'GIT_WORKTREE',path:'/synthetic/worktree-'+n,branch:null},capturedAt:'2026-10-26T10:00:00.000Z'};
  const meta=[['commit','git-commit',commit],['tree','git-tree',candTree],['patch','patch',patch],['check','check-log',log]];
  const artifacts=meta.map(([id,,b])=>({id,base64:b.toString('base64')}));
  const artifactMetadata=meta.map(([id,kind,b])=>({id,kind,producer:factoryId,runId:execution.runId,candidateCommit:candidate,sha256:codec.sha256(b),size:b.length,createdAt:'2026-10-26T10:00:00.200Z'}));
  const evidence=[{id:'check-'+n,producer:factoryId,runId:execution.runId,candidateCommit:candidate,command:configuration.commands[0],status:'passed',exitCode:0,startedAt:'2026-10-26T10:00:00.100Z',finishedAt:'2026-10-26T10:00:00.200Z',logArtifactId:'check'}];
  const manifest={protocol:codec.RESULT_PROTOCOL,keyId:key.keyId,producer:factoryId,operationId:codec.digest([codec.RESULT_PROTOCOL,factoryId,execution.requestId,execution.workOrderId,execution.runId]),execution,status:'COMPLETED',candidate:{commit:candidate,tree:candTreeId,base:input.commit,patchDigest:codec.sha256(patch),commitArtifactId:'commit',treeArtifactId:'tree',patchArtifactId:'patch'},evidence,artifacts:artifactMetadata,evidenceDigest:codec.digest(evidence),artifactDigest:codec.digest(artifactMetadata),completedAt:'2026-10-26T10:00:00.300Z',issuedAt:'2026-10-26T10:00:00.400Z'};
  mutate?.(manifest);
  if(dropArtifacts)artifacts.length=0;
  const encoded=Buffer.from(codec.canonical(manifest)).toString('base64url');
  const signed={protocol:codec.RESULT_PROTOCOL,encoded,signature:sign(null,Buffer.from(codec.RESULT_PROTOCOL+'\0'+encoded),pair.privateKey).toString('base64url'),manifestDigest:codec.digest(manifest),artifacts};
  const {version,workspace,capturedAt,inputCommit,inputTree,factoryVersion:_f,sourceDigest:_s,...expected}=structuredClone(execution);
  expectedByStage[n]=expected;
  return {signed,candidate:{commit:candidate,tree:candTreeId},manifest};
 }
 return {pair,key,baseline,factoryVersion,sourceDigest,stage,expectedByStage,producerPem:key.publicKey};
}

/** A separately administered synthetic verifier (disjoint key set from the producer). */
export function syntheticVerifier(){
 const pair=generateKeyPairSync('ed25519');
 const key={keyId:'synthetic-verifier-key',publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:'2020-01-01T00:00:00Z',notAfter:'2099-01-01T00:00:00Z'};
 const signVerdict=verdict=>({verdict,signatureBase64:sign(null,Buffer.from(codec.canonical(verdict)),pair.privateKey).toString('base64')});
 return {pair,key,signVerdict};
}
export const verdictFor=(over)=>({schema:'myeve.qualification-verdict/v1',verifierKeyId:'synthetic-verifier-key',outcome:'PASS',issuedAt:'2026-10-27T00:00:00.000Z',...over});
export {digest,codec};
