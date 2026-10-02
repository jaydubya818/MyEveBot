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

/** Authenticated transport data still needs exact source/tree and signed custody checks. */
export function cloudCustodyProjection(value:unknown, source:{commit:string;tree:string}) {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='base,candidateCommit,candidateTree,files,sourceFiles')throw Error('Cloud custody projection shape');
 const data=value as {base:string;candidateCommit:string;candidateTree:string;files:Record<string,string>;sourceFiles:Record<string,string>};
 if(data.base!==source.commit||!/^([a-f0-9]{40})$/.test(data.candidateCommit)||!/^([a-f0-9]{40})$/.test(data.candidateTree))throw Error('Cloud custody projection binding');
 boundedFiles(data.sourceFiles);boundedFiles(data.files);
 if(treeObjects(data.sourceFiles).sha!==source.tree||treeObjects(data.files).sha!==data.candidateTree)throw Error('Cloud custody projection tree mismatch');
 return structuredClone(data);
}
