import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants,closeSync,fstatSync,lstatSync,openSync,readlinkSync,readSync,readdirSync,realpathSync} from 'node:fs';
import {isAbsolute,join,relative,resolve,sep} from 'node:path';

const FORMAT='myapps.runtime-output-seal.v1';
const MAX_ENTRIES=50_000,MAX_BYTES=2*1024**3,MAX_LINK_TEXT=4096;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const mode=stat=>stat.mode&0o7777;
const portable=path=>path.split(sep).join('/');
function within(root,path){
 const rel=relative(root,path);
 return rel!==''&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);
}
function identity(stat){return {device:stat.dev,inode:stat.ino,uid:stat.uid,mode:mode(stat)};}
function sameFile(before,after){
 return before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&
  before.mode===after.mode&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs;
}
function regularFile(path,observed){
 assert.equal(typeof constants.O_NOFOLLOW,'number','RUNTIME_SEAL_NOFOLLOW_REQUIRED');
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=fstatSync(fd);
  assert(before.isFile()&&sameFile(observed,before),'RUNTIME_SEAL_FILE_CHANGED');
  const digest=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);
  let bytes=0,count;
  while((count=readSync(fd,buffer,0,buffer.length,null))>0){
   bytes+=count;assert(bytes<=MAX_BYTES,'RUNTIME_SEAL_BYTES_EXCEEDED');
   digest.update(buffer.subarray(0,count));
  }
  assert(bytes===before.size&&sameFile(before,fstatSync(fd))&&sameFile(before,lstatSync(path)),
   'RUNTIME_SEAL_FILE_CHANGED');
  return {bytes,sha256:digest.digest('hex')};
 }finally{closeSync(fd);}
}

/**
 * Capture every emitted file, mode and in-output alias before an owned launch.
 * This primitive does not authenticate a compiler, package provenance, dependency
 * completeness or a launched process. It cannot award packaging qualification.
 */
export function sealRuntimeOutput(directory){
 const root=resolve(directory),observed=lstatSync(root);
 assert(observed.isDirectory()&&!observed.isSymbolicLink(),'RUNTIME_SEAL_ROOT_REQUIRED');
 assert.equal(realpathSync(root),root,'RUNTIME_SEAL_ROOT_ALIAS');
 const entries=[];let totalBytes=0;
 function add(value){
  entries.push(value);assert(entries.length<=MAX_ENTRIES,'RUNTIME_SEAL_ENTRIES_EXCEEDED');
 }
 function walk(current){
  const before=lstatSync(current);
  assert(before.isDirectory()&&!before.isSymbolicLink(),'RUNTIME_SEAL_DIRECTORY_CHANGED');
  const names=readdirSync(current).sort();
  for(const name of names){
   const path=join(current,name),stat=lstatSync(path),key=portable(relative(root,path));
   assert(within(root,path),'RUNTIME_SEAL_PATH_ESCAPE');
   if(stat.isSymbolicLink()){
    const text=readlinkSync(path);
    assert(text.length>0&&Buffer.byteLength(text)<=MAX_LINK_TEXT&&!isAbsolute(text),
     'RUNTIME_SEAL_ALIAS_TEXT');
    let target;
    try{target=realpathSync(path);}catch{throw Error('RUNTIME_SEAL_ALIAS_INVALID');}
    assert(within(root,target),'RUNTIME_SEAL_ALIAS_ESCAPE');
    const targetStat=lstatSync(target);
    assert(targetStat.isFile()||targetStat.isDirectory(),'RUNTIME_SEAL_ALIAS_TARGET');
    assert.equal(readlinkSync(path),text,'RUNTIME_SEAL_ALIAS_CHANGED');
    add({path:key,type:'alias',mode:mode(stat),text,target:portable(relative(root,target)),
     targetType:targetStat.isDirectory()?'directory':'file'});
   }else if(stat.isDirectory()){
    add({path:key,type:'directory',mode:mode(stat)});walk(path);
   }else{
    assert(stat.isFile(),'RUNTIME_SEAL_NONREGULAR_FILE');
    const file=regularFile(path,stat);totalBytes+=file.bytes;
    assert(totalBytes<=MAX_BYTES,'RUNTIME_SEAL_BYTES_EXCEEDED');
    add({path:key,type:'file',mode:mode(stat),...file});
   }
  }
  assert.deepEqual(readdirSync(current).sort(),names,'RUNTIME_SEAL_DIRECTORY_CHANGED');
  assert(sameFile(before,lstatSync(current)),'RUNTIME_SEAL_DIRECTORY_CHANGED');
 }
 walk(root);
 assert(sameFile(observed,lstatSync(root)),'RUNTIME_SEAL_ROOT_CHANGED');
 const payload={format:FORMAT,status:'CAPTURE_ONLY_NOT_QUALIFIED',root:{path:root,...identity(observed)},
  entryCount:entries.length,totalBytes,entries};
 return {...payload,sha256:hash(JSON.stringify(payload))};
}

/** Recheck the complete sealed tree, including additions and alias retargeting. */
export function verifyRuntimeOutput(directory,expected){
 assert(expected&&expected.format===FORMAT&&expected.status==='CAPTURE_ONLY_NOT_QUALIFIED',
  'RUNTIME_SEAL_FORMAT');
 assert.deepEqual(Object.keys(expected).sort(),
  ['format','status','root','entryCount','totalBytes','entries','sha256'].sort(),'RUNTIME_SEAL_FIELDS');
 assert.match(expected.sha256,/^[a-f0-9]{64}$/,'RUNTIME_SEAL_DIGEST');
 const {sha256,...payload}=expected;
 assert.equal(hash(JSON.stringify(payload)),sha256,'RUNTIME_SEAL_RECORD_CHANGED');
 const actual=sealRuntimeOutput(directory);
 assert.deepEqual(actual,expected,'RUNTIME_SEAL_OUTPUT_CHANGED');
 return {status:'SEALED_OUTPUT_UNCHANGED_NOT_QUALIFIED',sha256:actual.sha256,
  entries:actual.entryCount,bytes:actual.totalBytes};
}
