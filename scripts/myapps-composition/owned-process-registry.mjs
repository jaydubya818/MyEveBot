/** Native process evidence for the outer operator. Normal Node/OS observation,
 * not a hostile-native containment boundary. Only the spawn-returned PID is read. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants,openSync,closeSync,writeSync,fstatSync,lstatSync,readFileSync,realpathSync} from 'node:fs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function parseProcessIdentity(text,pid){
 const line=text.trim();
 const match=/^(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\w{3}\s+\d{1,2}\s+\d\d:\d\d:\d\d\s+\d{4})\s+(.+)$/.exec(line);
 assert(match,'OWNED_PROCESS_IDENTITY_FORMAT');assert.equal(Number(match[1]),pid,'OWNED_PROCESS_PID');assert.equal(Number(match[2]),pid,'OWNED_PROCESS_GROUP');
 return {pid,pgid:pid,start:match[3].replace(/\s+/g,' '),commandSha256:hash(match[4])};
}
export function appendOwnedRegistry(registry,row){
 assert.equal(realpathSync(registry.path),registry.path,'OWNED_REGISTRY_ALIAS');
 const stat=lstatSync(registry.path);assert(stat.isFile()&&(stat.mode&0o7777)===0o600&&stat.size<1024*1024,'OWNED_REGISTRY_FILE');
 const line=Buffer.from(JSON.stringify(row)+'\n');assert(line.length<=16384&&stat.size+line.length<=1024*1024,'OWNED_REGISTRY_LIMIT');
 const fd=openSync(registry.path,constants.O_WRONLY|constants.O_APPEND|constants.O_NOFOLLOW);
 try{
  const opened=fstatSync(fd);assert(opened.dev===stat.dev&&opened.ino===stat.ino&&(opened.mode&0o7777)===0o600,'OWNED_REGISTRY_REPLACED');
  let offset=0;while(offset<line.length){const count=writeSync(fd,line,offset,line.length-offset);assert(count>0,'OWNED_REGISTRY_WRITE_STALLED');offset+=count;}
  const after=lstatSync(registry.path);assert(after.dev===stat.dev&&after.ino===stat.ino,'OWNED_REGISTRY_REPLACED');
 }finally{closeSync(fd);}
}
export function registerOwnedProcess(registry,{pid,binary,args,cwd}){
 assert(Number.isInteger(pid)&&pid>0,'OWNED_PROCESS_PID_REQUIRED');
 assert.equal(realpathSync(registry.ps.path),registry.ps.path);assert.equal(hash(readFileSync(registry.ps.path)),registry.ps.sha256);
 const text=execFileSync(registry.ps.path,['-ww','-p',String(pid),'-o','pid=','-o','pgid=','-o','lstart=','-o','command='],
  {encoding:'utf8',timeout:2000,maxBuffer:65536,env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}});
 const identity=parseProcessIdentity(text,pid),record={event:'OPEN',...identity,binary,args,cwd};
 appendOwnedRegistry(registry,record);return record;
}
export function closeOwnedProcess(registry,record){
 appendOwnedRegistry(registry,{event:'CLOSED',pid:record.pid,pgid:record.pgid,start:record.start,commandSha256:record.commandSha256});
}
