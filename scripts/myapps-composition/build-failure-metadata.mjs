/** Public diagnostic contents only. No Error, command, environment or log input.
 * Missing/unapproved observations remain UNKNOWN/null, never inferred success.
 */
export const BUILD_FAILURE_METADATA_MAX_BYTES=2048;
const phases=new Set(['UNKNOWN','INSTALL','PATCH','PATCH_CHECK','SDK_AUTHENTICATE','EVE_BUILD','NEXT_BUILD']);
const signals=new Set(['SIGHUP','SIGINT','SIGQUIT','SIGILL','SIGABRT','SIGFPE','SIGKILL',
 'SIGSEGV','SIGPIPE','SIGALRM','SIGTERM','SIGBUS','SIGXCPU','SIGXFSZ']);
const cleanupStates=new Set(['UNKNOWN','QUIESCENT']);

export function encodeBuildFailureMetadata(phase,pid,exitCode,signal,cleanupState){
 const record={schema:'myapps.build-command-failure.v1',status:'FAILURE_METADATA_ONLY',
  phase:typeof phase==='string'&&phases.has(phase)?phase:'UNKNOWN',
  ownedChildPid:Number.isInteger(pid)&&pid>0&&pid<=0x7fffffff?pid:null,
  exitCode:Number.isInteger(exitCode)&&exitCode>=0&&exitCode<=255?exitCode:null,
  signal:typeof signal==='string'&&signals.has(signal)?signal:null,
  cleanupState:typeof cleanupState==='string'&&cleanupStates.has(cleanupState)?cleanupState:'UNKNOWN'};
 const body=JSON.stringify(record)+'\n';
 return Buffer.byteLength(body,'utf8')<=BUILD_FAILURE_METADATA_MAX_BYTES?body:null;
}
