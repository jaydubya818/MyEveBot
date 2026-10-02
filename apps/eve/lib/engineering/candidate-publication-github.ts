import { spawn } from "node:child_process";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPublicationCustody,deny,type PublicationBinding } from "./publication-contract.ts";
import { treeObjects } from "./github.ts";
import type { Candidate } from "./execution.ts";
import type { PublicationPort,PublicationRemote } from "./candidate-publication.ts";

export async function publicationCommand(file:'git'|'gh',args:string[],input?:Buffer):Promise<{code:number;out:string}>{
 return new Promise((resolve,reject)=>{
  const env={...process.env,GIT_TERMINAL_PROMPT:'0',GH_PROMPT_DISABLED:'1'};
  for(const key of Object.keys(env))if(key.startsWith('GIT_')&&key!=='GIT_TERMINAL_PROMPT')delete (env as Record<string,string|undefined>)[key];
  const child=spawn(file,args,{shell:false,env,stdio:['pipe','pipe','pipe']});let out='',size=0;
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Publication command timed out; reconcile only'));},120000);
  child.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>12*1024*1024){child.kill('SIGKILL');reject(Error('Publication output limit'));}else out+=b.toString();});
  child.stderr.on('data',()=>{});child.on('error',()=>{clearTimeout(timer);reject(Error('Publication command unavailable'));});
  child.on('close',code=>{clearTimeout(timer);resolve({code:code??-1,out});});child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
/** Materializes only authenticated Git objects in a fresh bare repository.
 * Never reads a mutable Factory/host checkout or stages working-tree content. */
export async function materializeCandidate(b:PublicationBinding,c:Candidate,sourceFiles:Record<string,string>){
 assertPublicationCustody(b,c,sourceFiles);
 const directory=await mkdtemp(join(tmpdir(),'myeve-publication-'));
 const git=async(args:string[],input?:Buffer)=>{const r=await publicationCommand('git',['-c','core.hooksPath=/dev/null','-C',directory,...args],input);if(r.code)throw Error('Immutable candidate materialization failed');return r.out.trim();};
 try{
  await git(['init','--bare']);
  for(const content of Object.values(c.files))await git(['hash-object','-w','--stdin'],Buffer.from(content));
  for(const tree of treeObjects(c.files).objects){
   const bytes=Buffer.concat(tree.entries.flatMap(e=>[Buffer.from(`${e.type==='tree'?'40000':e.mode} ${e.path}\0`),Buffer.from(e.sha,'hex')]));
   if(await git(['hash-object','-t','tree','-w','--stdin'],bytes)!==tree.sha)deny('Tree materialization differs');
  }
  if(await git(['hash-object','-t','commit','-w','--stdin'],Buffer.from(c.rawCommit!))!==b.candidate ||
   await git(['rev-parse',`${b.candidate}^{tree}`])!==b.verifiedTree)deny('Verified tree differs');
  return {directory,git};
 }catch(e){await rm(directory,{recursive:true,force:true});throw e;}
}
export class CandidateGitHub implements PublicationPort {
 private async api(b:PublicationBinding,path:string,body?:Record<string,unknown>){
  const args=['api',`repos/${b.repository}${path}`,'--method',body?'POST':'GET'];
  if(body)args.push('--input','-');
  const r=await publicationCommand('gh',args,body?Buffer.from(JSON.stringify(body)):undefined);
  if(r.code)throw Error('GitHub boundary unavailable');return JSON.parse(r.out);
 }
 async base(b:PublicationBinding){const r=await this.api(b,'/git/ref/heads/'+b.baseRef);return String(r.object?.sha);}
 async inspect(b:PublicationBinding):Promise<PublicationRemote>{
  const repo=await this.api(b,'');if(repo.full_name!==b.repository)deny('Repository identity differs');
  // Matching refs returns [] for absence; transport errors cannot be mistaken for absence.
  const refs=await this.api(b,'/git/matching-refs/heads/'+b.branch),exact=refs.filter((r:any)=>r.ref==='refs/heads/'+b.branch);
  if(exact.length>1)deny('Ambiguous branch identity');
  const pulls=await this.api(b,`/pulls?state=all&head=${encodeURIComponent(b.repository.split('/')[0]+':'+b.branch)}&per_page=100`);
  if(pulls.length>1)deny('Duplicate candidate PRs');const pr=pulls[0];
  if(pr&&(pr.head.repo?.full_name!==b.repository||pr.head.ref!==b.branch||pr.html_url!==`https://github.com/${b.repository}/pull/${pr.number}`))deny('PR identity differs');
  return {branchSha:exact[0]?.object.sha??null,pr:pr?{number:pr.number,url:pr.html_url,candidate:pr.head.sha,base:pr.base.ref,draft:pr.draft,open:pr.state==='open'}:null};
 }
 async push(b:PublicationBinding,c:Candidate,sourceFiles:Record<string,string>){
  const {directory,git}=await materializeCandidate(b,c,sourceFiles);
  try{
   // Read the exact parent objects; the server-resolved ref must still be qualified.
   if(await this.base(b)!==b.expectedBaseSha)deny('Base ref moved');
   await git(['fetch','--no-tags',`https://github.com/${b.repository}.git`,b.baseRef]);
   if(await git(['rev-parse','FETCH_HEAD'])!==b.expectedBaseSha)deny('Fetched base differs');
   const diff=await git(['diff','--name-only',b.expectedBaseSha,b.candidate]);
   if(JSON.stringify(diff.split('\n').sort())!==JSON.stringify([...b.allowedPaths].sort()))deny('Published diff exceeds scope');
   if(await git(['rev-parse',`${b.candidate}^{tree}`])!==b.verifiedTree)deny('Verified tree changed');
   // Empty expected ref is create-only CAS: it cannot overwrite an existing branch.
   await git(['push','--porcelain',`--force-with-lease=refs/heads/${b.branch}:`,`https://github.com/${b.repository}.git`,`${b.candidate}:refs/heads/${b.branch}`]);
  }finally{await rm(directory,{recursive:true,force:true});}
 }
 async openPR(b:PublicationBinding){await this.api(b,'/pulls',{title:b.title,body:b.body,head:b.branch,base:b.baseRef,draft:true});}
}
