import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants,closeSync,fstatSync,lstatSync,openSync,readlinkSync,readSync,readdirSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';

const GENERATED=['apps/eve/.eve','apps/eve/.output','apps/eve/.next','apps/eve/.nitro'];
const MAX_ENTRIES=500_000,MAX_BYTES=8*1024**3;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const portable=path=>path.split(sep).join('/');
const under=(path,root)=>path===root||path.startsWith(root+'/');
const mode=stat=>stat.mode&0o7777;
const stamp=stat=>[stat.dev,stat.ino,stat.size,stat.mode,stat.mtimeMs,stat.ctimeMs];
function key(value){
 assert(typeof value==='string'&&value.length<=8192&&!isAbsolute(value)&&!value.includes('\\')
  &&value.split('/').every(part=>part&&part!=='.'&&part!=='..'),'INPUT_RELATIVE_PATH');
 return value;
}
function file(path,before){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  assert.deepEqual(stamp(fstatSync(fd)),stamp(before),'INPUT_FILE_CHANGED');
  const digest=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);let bytes=0,count;
  while((count=readSync(fd,buffer,0,buffer.length,null))>0){
   bytes+=count;assert(bytes<=MAX_BYTES,'INPUT_BYTES_EXCEEDED');digest.update(buffer.subarray(0,count));
  }
  assert.equal(bytes,before.size,'INPUT_FILE_CHANGED');
  assert.deepEqual(stamp(fstatSync(fd)),stamp(before),'INPUT_FILE_CHANGED');
  assert.deepEqual(stamp(lstatSync(path)),stamp(before),'INPUT_FILE_CHANGED');
  return {bytes,sha256:digest.digest('hex')};
 }finally{closeSync(fd);}
}

/** Capture authored files plus EVERY fresh installed input, including native
 * data and workspace/bin aliases. The exact authored inventory must come from
 * the trusted committed-source copy plus separately reviewed seam substitutions.
 * This function does not attest that an install/build actually happened.
 */
export function captureBuildInputs(directory,authoredFiles,installRoots){
 const root=resolve(directory),stat=lstatSync(root);
 assert(stat.isDirectory()&&!stat.isSymbolicLink()&&realpathSync(root)===root,'INPUT_CANONICAL_ROOT_REQUIRED');
 assert(authoredFiles&&Object.getPrototypeOf(authoredFiles)===Object.prototype,'INPUT_AUTHORED_FILES_REQUIRED');
 assert(Array.isArray(installRoots)&&installRoots.length>0,'INPUT_INSTALL_ROOTS_REQUIRED');
 const installs=[...new Set(installRoots.map(key))].sort();
 assert(installs.every(path=>path.split('/').at(-1)==='node_modules'),'INPUT_INSTALL_ROOT_NAME');
 assert(installs.every((path,index)=>!installs.some((other,j)=>j!==index&&under(path,other))),'INPUT_REDUNDANT_INSTALL_ROOT');
 const authored=new Map(),directories=new Set(),seen=new Set();
 for(const [path,digest] of Object.entries(authoredFiles)){
  key(path);assert.match(digest,/^[a-f0-9]{64}$/,'INPUT_AUTHORED_DIGEST');
  assert(!GENERATED.some(prefix=>under(path,prefix))&&!installs.some(prefix=>under(path,prefix)),
   'INPUT_AUTHORED_PATH_BOUNDARY');
  authored.set(path,digest);
  for(let parent=portable(dirname(path));parent!=='.';parent=portable(dirname(parent)))directories.add(parent);
 }
 assert(authored.size>0,'INPUT_AUTHORED_FILES_REQUIRED');
 for(const path of installs)
  for(let parent=portable(dirname(path));parent!=='.';parent=portable(dirname(parent)))directories.add(parent);
 const entries=[],seenInstalls=new Set();let totalBytes=0;
 const add=value=>{entries.push(value);assert(entries.length<=MAX_ENTRIES,'INPUT_ENTRIES_EXCEEDED');};
 function walk(current){
  const before=lstatSync(current),names=readdirSync(current).sort();
  assert(before.isDirectory()&&!before.isSymbolicLink(),'INPUT_DIRECTORY_CHANGED');
  for(const name of names){
   const path=join(current,name),entryKey=portable(relative(root,path));key(entryKey);
   if(GENERATED.some(prefix=>entryKey===prefix))continue;
   const installed=installs.some(prefix=>under(entryKey,prefix)),observed=lstatSync(path);
   if(installs.includes(entryKey)){
    assert(observed.isDirectory()&&!observed.isSymbolicLink(),'INPUT_INSTALL_ROOT_DIRECTORY_REQUIRED');
    seenInstalls.add(entryKey);
   }
   if(observed.isSymbolicLink()){
    assert(installed,'INPUT_UNDECLARED_SOURCE_ALIAS');
    const text=readlinkSync(path);
    assert(text.length>0&&Buffer.byteLength(text)<=4096&&!isAbsolute(text),'INPUT_ALIAS_TEXT');
    let canonical;try{canonical=realpathSync(path);}catch{throw Error('INPUT_ALIAS_INVALID');}
    const target=portable(relative(root,canonical));key(target);
    assert(!isAbsolute(target)&&!target.startsWith('../')&&!GENERATED.some(prefix=>under(target,prefix)),
     'INPUT_ALIAS_ESCAPE');
    const targetStat=lstatSync(canonical);assert(targetStat.isFile()||targetStat.isDirectory(),'INPUT_ALIAS_TARGET');
    assert.equal(readlinkSync(path),text,'INPUT_ALIAS_CHANGED');
    add({path:entryKey,type:'alias',mode:mode(observed),text,target,
     targetType:targetStat.isDirectory()?'directory':'file'});
   }else if(observed.isDirectory()){
    assert(installed||directories.has(entryKey),'INPUT_UNDECLARED_SOURCE_DIRECTORY');
    add({path:entryKey,type:'directory',mode:mode(observed)});walk(path);
   }else{
    assert(observed.isFile(),'INPUT_NONREGULAR_FILE');
    assert(installed||authored.has(entryKey),'INPUT_UNDECLARED_SOURCE_FILE');
    const value=file(path,observed);totalBytes+=value.bytes;assert(totalBytes<=MAX_BYTES,'INPUT_BYTES_EXCEEDED');
    if(!installed){assert.equal(value.sha256,authored.get(entryKey),'INPUT_AUTHORED_BYTES_CHANGED');seen.add(entryKey);}
    add({path:entryKey,type:'file',mode:mode(observed),...value});
   }
  }
  assert.deepEqual(readdirSync(current).sort(),names,'INPUT_DIRECTORY_CHANGED');
  assert.deepEqual(stamp(lstatSync(current)),stamp(before),'INPUT_DIRECTORY_CHANGED');
 }
 walk(root);assert.equal(seen.size,authored.size,'INPUT_AUTHORED_FILE_MISSING');
 assert.equal(seenInstalls.size,installs.length,'INPUT_INSTALL_ROOT_MISSING');
 assert.deepEqual(stamp(lstatSync(root)),stamp(stat),'INPUT_ROOT_CHANGED');
 const payload={format:'myapps.build-input-inventory.v1',status:'BUILD_INPUT_CAPTURE_ONLY_NOT_QUALIFIED',
  root:{path:root,device:stat.dev,inode:stat.ino,uid:stat.uid,mode:mode(stat)},
  authoredFiles:Object.fromEntries([...authored].sort(([a],[b])=>a.localeCompare(b))),
  installRoots:installs,generatedBoundaries:GENERATED,entries,totalBytes};
 return {...payload,sha256:hash(JSON.stringify(payload))};
}

export function verifyBuildInputs(directory,expected){
 assert(expected?.format==='myapps.build-input-inventory.v1'
  &&expected.status==='BUILD_INPUT_CAPTURE_ONLY_NOT_QUALIFIED','INPUT_RECORD_FORMAT');
 assert.deepEqual(Object.keys(expected).sort(),['format','status','root','authoredFiles','installRoots',
  'generatedBoundaries','entries','totalBytes','sha256'].sort(),'INPUT_RECORD_FIELDS');
 const {sha256,...payload}=expected;assert.equal(hash(JSON.stringify(payload)),sha256,'INPUT_RECORD_CHANGED');
 assert.deepEqual(captureBuildInputs(directory,expected.authoredFiles,expected.installRoots),expected,'INPUT_TREE_CHANGED');
 return {status:'BUILD_INPUTS_UNCHANGED_NOT_QUALIFIED',sha256};
}
