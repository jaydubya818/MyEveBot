import { treeObjects, type RepositorySnapshot } from './github.ts';
import { canonical, type ExecutionSnapshot } from './factory-producer-protocol.ts';

function boundedFiles(value:unknown):asserts value is Record<string,string> {
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length>200||Buffer.byteLength(canonical(value))>500000)throw Error('Cloud custody file bound');
 const files=value as Record<string,unknown>;
 for(const [path,text] of Object.entries(files)){
  if(!/^[\w./-]+$/.test(path)||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git')||typeof text!=='string'||text.includes('\0')||Buffer.byteLength(text)>100000||Buffer.from(text).toString('utf8')!==text||Object.keys(files).some(other=>other.startsWith(path+'/')))throw Error('Unsupported cloud custody file');
 }
}
/** A bounded read projection from Factory custody, not new MyEve execution.
 * The caller subsequently verifies the complete candidate tree/raw commit with
 * assertFactoryCandidateIdentity against the authenticated signed Result. */
export function cloudCustodyFiles(source:RepositorySnapshot,files:unknown,snapshot:ExecutionSnapshot):Record<string,string> {
 if(snapshot.version!==2||snapshot.inputCommit!==source.sha||snapshot.configuration.workerProfile!=='container'||!snapshot.configuration.cloud)throw Error('Cloud custody execution binding');
 boundedFiles(source.files);boundedFiles(files);
 if(treeObjects(source.files).sha!==snapshot.inputTree)throw Error('Cloud custody source tree mismatch');
 return structuredClone(files);
}
