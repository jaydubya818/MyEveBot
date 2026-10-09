import { constants } from "node:fs";
import { open, realpath, readdir, stat, mkdir, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { localOperationSchema, type LocalOperation, type LocalResult } from "../../lib/local-computer-contract.ts";

const exec=promisify(execFile);
const deniedNames=new Set(["Library",".ssh",".aws",".azure",".config",".codex",".claude",".gnupg",".git",".npmrc",".netrc",".docker",".kube",".local-computer"]);
const skippedNames=new Set(["node_modules",".next",".eve",".output",".turbo",".worktrees"]);
const digest=(data:Buffer|string)=>createHash("sha256").update(data).digest("hex");
const within=(root:string,file:string)=>file===root || file.startsWith(root+path.sep);
function permittedName(file:string){
  return file.split(path.sep).every(part=>!deniedNames.has(part) && !/^\.env(?:\.|$)/i.test(part) && !/\.(pem|key|p12|pfx|keychain-db)$/i.test(part));
}

export async function resolveSharedPath(file:string,roots:readonly string[]){
  if(!path.isAbsolute(file) || file.includes("\0") || !permittedName(file))throw new Error("Path is private or outside the shared folders. Use a specifically approved shell command only if the task requires broader access.");
  const resolved=await realpath(file);
  if(!roots.some(root=>within(root,resolved)) || !permittedName(resolved))throw new Error("Path resolves outside the shared folders or into private app data.");
  return resolved;
}
async function textFile(file:string,roots:readonly string[]){
  const resolved=await resolveSharedPath(file,roots);
  const handle=await open(resolved,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const info=await handle.stat();
    if(!info.isFile() || info.size>200000 || info.nlink>1)throw new Error("Only ordinary text files up to 200 KB with one link may be read.");
    const buffer=Buffer.alloc(200001);
    const {bytesRead}=await handle.read(buffer,0,buffer.length,0);
    const data=buffer.subarray(0,bytesRead);
    if(bytesRead>200000 || data.includes(0))throw new Error("The file is too large or binary.");
    return {path:resolved,content:new TextDecoder("utf-8",{fatal:true}).decode(data),sha256:digest(data)};
  }finally{await handle.close();}
}
export function runLocalShell(command:string):Promise<LocalResult>{
  return new Promise(resolve=>{
    // Do not give subprocesses the pairing token, app credentials, or shell startup files.
    const child=spawn("/bin/zsh",["-f","-c",command],{cwd:os.homedir(),detached:true,
      env:{NODE_ENV:"production",PATH:"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",HOME:os.homedir(),USER:os.userInfo().username,TMPDIR:os.tmpdir(),LANG:"en_US.UTF-8"}});
    let output="",terminated=false;
    const stop=()=>{terminated=true;try{process.kill(-child.pid!,"SIGKILL");}catch{}};
    const timer=setTimeout(stop,20000);
    const collect=(chunk:Buffer)=>{output+=chunk.toString();if(Buffer.byteLength(output)>180000)stop();};
    child.stdout.on("data",collect);child.stderr.on("data",collect);
    child.on("error",()=>{clearTimeout(timer);resolve({text:"Could not launch local zsh.",isError:true});});
    child.on("close",code=>{clearTimeout(timer);resolve({text:JSON.stringify({exitCode:code,terminated,output:output.slice(0,180000)}),isError:terminated||code!==0});});
  });
}
export async function desktopStatus(helper:string){
  try{return JSON.parse((await exec(helper,["status"],{timeout:5000,maxBuffer:4096})).stdout) as {accessibility:boolean;screenRecording:boolean};}
  catch{return {accessibility:false,screenRecording:false};}
}
export async function executeLocalOperation(raw:unknown,roots:readonly string[],helper:string):Promise<LocalResult>{
  const input:LocalOperation=localOperationSchema.parse(raw);
  if(input.operation==="roots")return {text:JSON.stringify({roots})};
  if(input.operation==="read_text")return {text:JSON.stringify(await textFile(input.path,roots))};
  if(input.operation==="list_files" || input.operation==="find_files"){
    const searchName=input.operation==="find_files"?input.name.toLowerCase():null;
    const glob=searchName!==null && /[*?]/.test(searchName)
      ? new RegExp("^"+searchName.replace(/[.+^${}()|[\]\\]/g,"\\$&").replace(/\*+/g,".*").replace(/\?/g,".")+"$","i") : null;
    const directory=await resolveSharedPath(input.path,roots);
    const found:Array<{path:string;type:string}>=[];let visited=0,truncated=false;
    async function walk(dir:string,depth:number):Promise<void>{
      const entries=await readdir(dir,{withFileTypes:true});
      for(const item of entries.sort((a,b)=>a.name.localeCompare(b.name))){
        if(++visited>3000 || found.length>=200){truncated=true;return;}
        const file=path.join(dir,item.name);
        if(!permittedName(file) || skippedNames.has(item.name) || item.isSymbolicLink())continue;
        if(searchName===null || (glob ? glob.test(item.name) : item.name.toLowerCase().includes(searchName)))found.push({path:file,type:item.isDirectory()?"directory":"file"});
        if(input.operation==="find_files" && item.isDirectory() && depth<4){
          try{await walk(await resolveSharedPath(file,roots),depth+1);}catch{/* Unreadable directories are not traversed. */}
        }
      }
    }
    await walk(directory,0);return {text:JSON.stringify({entries:found,truncated,maxDepth:input.operation==="find_files"?4:0})};
  }
  if(input.operation==="write_text"){
    const parent=await resolveSharedPath(path.dirname(input.path),roots);
    const file=path.join(parent,path.basename(input.path));
    if(!permittedName(file))throw new Error("Cannot write private configuration with the scoped file tool.");
    if(input.expected_sha256===null){
      const handle=await open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{await handle.writeFile(input.content);}finally{await handle.close();}
    }else{
      // Compare again just before replacement; the expected hash is bound to approval.
      const before=await textFile(file,roots);
      if(before.sha256!==input.expected_sha256)throw new Error("The file changed since it was read. Read again and request a fresh approval.");
      const temporary=path.join(parent,`.sofie-${randomUUID()}.tmp`);
      try{
        const handle=await open(temporary,"wx",(await stat(file)).mode&0o777);
        try{await handle.writeFile(input.content);}finally{await handle.close();}
        if((await textFile(file,roots)).sha256!==input.expected_sha256)throw new Error("Concurrent file change; nothing overwritten.");
        await rename(temporary,file);
      }finally{await unlink(temporary).catch(()=>{});}
    }
    const saved=await textFile(file,roots);
    if(saved.sha256!==digest(input.content))throw new Error("Write verification failed; inspect before retrying.");
    return {text:JSON.stringify({path:file,sha256:saved.sha256,verified:true})};
  }
  if(input.operation==="shell")return runLocalShell(input.command);
  const {stdout}=await exec(helper,[JSON.stringify(input)],{timeout:10000,maxBuffer:3500000});
  const result=JSON.parse(stdout);
  return input.operation==="screenshot"?{text:JSON.stringify({width:result.width,height:result.height,coordinates:"screen points",scale:result.scale}),image:result.image}:{text:JSON.stringify(result)};
}
