import { createHash, randomUUID } from "node:crypto";
import { digest, type WorkContract } from "./contract.ts";
import { nowIso, type Candidate, type EngineeringRun, type GitHubTruth } from "./execution.ts";
import { WorkError } from "./types.ts";

export interface RepositorySnapshot { sha: string; files: Record<string,string>; }
export interface EngineeringGitHub {
  issue(number: number): Promise<{number:number;url:string;body:string}>;
  snapshot(ref: string): Promise<RepositorySnapshot>;
  observe(contract: WorkContract, branch: string): Promise<GitHubTruth>;
  publish(contract: WorkContract, candidate: Candidate, branch: string, expectedHead: string | null): Promise<{number:number;url:string}>;
}
function objectSha(kind: string, content: string | Buffer) {
  const body = Buffer.from(content); return createHash("sha1").update(`${kind} ${body.length}\0`).update(body).digest("hex");
}
export function treeObjects(files: Record<string,string>) {
  const objects: {sha:string; entries:{path:string;mode:"100644"|"040000";type:"blob"|"tree";sha:string}[]}[] = [];
  function tree(prefix: string): string {
    const children = new Map<string,boolean>();
    for (const path of Object.keys(files).filter(p => p.startsWith(prefix))) {
      const rest = path.slice(prefix.length), part = rest.split("/")[0]; children.set(part,rest.includes("/"));
    }
    const entries = [...children].sort(([a,ad],[b,bd]) => Buffer.compare(Buffer.from(a+(ad?"/":"")),Buffer.from(b+(bd?"/":""))))
      .map(([path,dir]) => ({path,mode:(dir?"040000":"100644") as "040000"|"100644",type:(dir?"tree":"blob") as "tree"|"blob",sha:dir?tree(prefix+path+"/"):objectSha("blob",files[prefix+path])}));
    const data = Buffer.concat(entries.flatMap(e => [Buffer.from(`${e.type === "tree" ? "40000" : e.mode} ${e.path}\0`),Buffer.from(e.sha,"hex")]));
    const sha = objectSha("tree",data); objects.push({sha,entries}); return sha;
  }
  return {sha:tree(""),objects};
}
export type CandidateContract = Pick<WorkContract,"workId"|"repository"|"baseSha"> &
  { profile: Pick<WorkContract["profile"],"allowedPaths"> };
function candidateMaterial(contract: CandidateContract, base: RepositorySnapshot, files: Record<string,string>) {
  const paths = [...new Set([...Object.keys(base.files),...Object.keys(files)])].filter(p=>base.files[p]!==files[p]).sort();
  if (!paths.length || paths.some(p=>!contract.profile.allowedPaths.includes(p)) || Object.keys(files).length>200 ||
    Buffer.byteLength(JSON.stringify(files))>500000 || Object.values(files).some(v=>v.includes("\0")))
    throw new WorkError("candidate_denied", "Candidate must contain bounded changes only in the admitted source paths.");
  if (paths.some(p=>/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9]{24,})/.test(files[p]??"")))
    throw new WorkError("secret_detected", "Candidate contains a potential credential and cannot be published.");
  const tree = treeObjects(files).sha;
  const patch = JSON.stringify(paths.map(path=>({path,before:base.files[path]??null,after:files[path]??null})));
  return {paths,tree,patch};
}
function candidateCommitSha(tree: string, parentSha: string, commit: Candidate["commit"]) {
  const timestamp=Date.parse(commit.date);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString()!==commit.date || timestamp%1000!==0)
    throw new WorkError("candidate_denied", "Candidate commit date is invalid.");
  const author = `${commit.name} <${commit.email}> ${Math.floor(timestamp/1000)} +0000`;
  return objectSha("commit",`tree ${tree}\nparent ${parentSha}\nauthor ${author}\ncommitter ${author}\n\n${commit.message}`);
}
export function createCandidate(contract: CandidateContract, run: EngineeringRun, base: RepositorySnapshot, files: Record<string,string>): Candidate {
  const {paths,tree,patch}=candidateMaterial(contract,base,files);
  const commit = {message:`MyEve Work ${contract.workId}\nRun ${run.id}\n`,name:"MyEve Engineering",email:"engineering@users.noreply.github.com",date:new Date(Math.floor(Date.now()/1000)*1000).toISOString()};
  const sha = candidateCommitSha(tree,run.publicationParentSha,commit);
  return {id:randomUUID(),workId:contract.workId,runId:run.id,attemptId:run.attemptId,repository:contract.repository,baseSha:contract.baseSha,
    parentSha:run.publicationParentSha,sha,tree,files,changedPaths:paths,patch,artifactHash:digest({files,patch}),createdAt:nowIso(),commit};
}
/** Recompute identity before a candidate enters durable custody or protected verification. */
export function assertCandidateIdentity(contract: CandidateContract, run: EngineeringRun, base: RepositorySnapshot, candidate: Candidate) {
  const {paths,tree,patch}=candidateMaterial(contract,base,candidate.files);
  const expectedCommit={message:`MyEve Work ${contract.workId}\nRun ${run.id}\n`,name:"MyEve Engineering",email:"engineering@users.noreply.github.com"};
  if (base.sha!==run.parentSha || candidate.workId!==contract.workId || candidate.runId!==run.id ||
    candidate.attemptId!==run.attemptId || candidate.repository!==contract.repository ||
    candidate.baseSha!==contract.baseSha || candidate.parentSha!==run.publicationParentSha ||
    candidate.tree!==tree || candidate.patch!==patch || JSON.stringify(candidate.changedPaths)!==JSON.stringify(paths) ||
    candidate.artifactHash!==digest({files:candidate.files,patch}) ||
    candidate.commit.message!==expectedCommit.message || candidate.commit.name!==expectedCommit.name ||
    candidate.commit.email!==expectedCommit.email ||
    candidate.sha!==candidateCommitSha(tree,run.publicationParentSha,candidate.commit))
    throw new WorkError("candidate_denied", "Candidate identity does not match the exact Work, Run, source and commit.");
}
export function assertFactoryCandidateIdentity(contract: CandidateContract, base: RepositorySnapshot, candidate: Candidate) {
  const {paths,tree,patch}=candidateMaterial(contract,base,candidate.files);
  const raw=candidate.rawCommit;
  if(candidate.producer!=="MYFACTORY" || !candidate.factoryProvenance || !raw ||
    candidate.workId!==contract.workId || candidate.repository!==contract.repository || base.sha!==contract.baseSha || candidate.baseSha!==base.sha || candidate.parentSha!==base.sha ||
    candidate.tree!==tree || candidate.patch!==patch || JSON.stringify(candidate.changedPaths)!==JSON.stringify(paths) ||
    candidate.artifactHash!==digest({files:candidate.files,patch}) || objectSha("commit",raw)!==candidate.sha ||
    raw.split("\n\n")[0].split("\n").filter(x=>x.startsWith("parent ")).join("\n")!==`parent ${base.sha}` || !raw.startsWith(`tree ${tree}\n`))
    throw new WorkError("factory_candidate_identity","Factory custody does not match the exact authenticated Git candidate.");
}
export function workBranch(workId: string) { return `myeve/work-${workId}`; }

/** This client exposes no merge, deployment, workflow, secret or repository-admin operation. */
export class GitHubAdapter implements EngineeringGitHub {
  constructor(readonly repository: string, private readonly token: string | (() => Promise<string>), private readonly request: typeof fetch = fetch) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) throw new Error("An explicit qualification repository and publication credential are required.");
  }
  private async api(path: string, body?: unknown, method?: string): Promise<any> {
    const token = typeof this.token === "string" ? this.token : await this.token();
    const response = await this.request(`https://api.github.com/repos/${this.repository}${path?`/${path}`:""}`,{
      method:method??(body?"POST":"GET"),redirect:"error",signal:AbortSignal.timeout(10000),
      headers:{authorization:`Bearer ${token}`,accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","content-type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{})});
    if (response.status===404 && !body) return null;
    if (!response.ok) throw new WorkError("github_unavailable",`GitHub returned ${response.status}; repository state requires reconciliation.`);
    const text = await response.text(); if (text.length>2000000) throw new Error("GitHub response exceeded the qualification bound.");
    return JSON.parse(text);
  }
  private async authority() {
    const repo = await this.api("");
    if (!repo?.private || repo.full_name.toLowerCase()!==this.repository.toLowerCase() || !repo.permissions?.push || repo.archived)
      throw new WorkError("repository_denied","A current private qualification repository with write authority is required.");
  }
  async issue(number: number) {
    await this.authority(); const issue=await this.api(`issues/${number}`);
    if (!issue || issue.pull_request || issue.state!=="open") throw new Error("An open bounded issue is required.");
    return {number:issue.number,url:issue.html_url,body:String(issue.body??"")};
  }
  async snapshot(ref: string): Promise<RepositorySnapshot> {
    if (!/^[\w/-]+$/.test(ref)) throw new Error("Invalid repository revision.");
    await this.authority(); const commit=await this.api(`commits/${ref}`);
    if (!commit) throw new Error("Repository revision unavailable.");
    const tree=await this.api(`git/trees/${commit.commit.tree.sha}?recursive=1`);
    if (tree.truncated || tree.tree.length>200 || tree.tree.some((e:any)=>!["100644","040000"].includes(e.mode)))
      throw new Error("Qualification supports at most 200 regular text files, with no symlinks, executables or submodules.");
    const files:Record<string,string>={}; let bytes=0;
    for (const entry of tree.tree.filter((e:any)=>e.type==="blob")) {
      if (entry.size>100000 || entry.path.split("/").some((p:string)=>!p || p==="." || p===".." || p===".git")) throw new Error("Unsupported repository file.");
      const blob=await this.api(`git/blobs/${entry.sha}`), value=Buffer.from(blob.content,"base64");
      bytes+=value.length;
      if (bytes>500000 || value.includes(0) || !Buffer.from(value.toString("utf8")).equals(value)) throw new Error("Qualification repository must contain bounded UTF-8 text.");
      files[entry.path]=value.toString("utf8");
    }
    return {sha:commit.sha,files};
  }
  async observe(contract: WorkContract, branch: string): Promise<GitHubTruth> {
    await this.authority();
    const base=await this.api(`commits/${contract.profile.baseBranch}`), ref=await this.api(`git/ref/heads/${branch}`);
    const prs=await this.api(`pulls?state=open&head=${encodeURIComponent(this.repository.split("/")[0]+":"+branch)}&per_page=100`);
    if (prs?.length>1) throw new Error("Multiple PRs found for this Work branch.");
    const pr=prs?.[0]; const head=ref?.object.sha??null;
    if (pr && (pr.head.repo.full_name!==this.repository || pr.base.ref!==contract.profile.baseBranch || pr.head.sha!==head)) throw new Error("PR repository, base or head binding changed.");
    const checks=head?await this.api(`commits/${head}/check-runs?filter=latest&per_page=100`):null;
    const reviews=pr?await this.api(`pulls/${pr.number}/reviews?per_page=100`):[];
    // Fail closed instead of silently omitting pagination that could contain newer review requirements.
    if (checks?.total_count>100 || reviews.length>=100) throw new Error("GitHub observation exceeds bounded pagination; human review required.");
    return {observedAt:nowIso(),authority:true,repository:this.repository,baseSha:base.sha,head,
      pr:pr?{number:pr.number,url:pr.html_url,draft:pr.draft,open:pr.state==="open"}:null,
      checks:(checks?.check_runs??[]).map((c:any)=>({id:String(c.id),name:c.name,sha:c.head_sha,attempt:Date.parse(c.started_at??c.completed_at??0),
        result:c.status!=="completed"?"NOT_RUN":c.conclusion==="success"?"PASS":["failure","timed_out","cancelled","action_required"].includes(c.conclusion)?"FAIL":"UNKNOWN",
        details:JSON.stringify({title:c.output?.title,summary:c.output?.summary,text:c.output?.text}).slice(0,16000)})),
      reviews:reviews.map((r:any)=>({id:String(r.id),author:r.user.login,sha:r.commit_id,state:r.state,body:String(r.body??"").slice(0,16000),submittedAt:r.submitted_at}))};
  }
  async publish(contract: WorkContract, candidate: Candidate, branch: string, expectedHead: string|null) {
    const truth=await this.observe(contract,branch);
    if (truth.head!==expectedHead || truth.baseSha!==contract.baseSha || candidate.parentSha!==(expectedHead??contract.baseSha) ||
      candidate.repository!==this.repository || candidate.workId!==contract.workId || candidate.artifactHash!==digest({files:candidate.files,patch:candidate.patch}))
      throw new Error("Publication binding changed; refusing write.");
    const base=await this.snapshot(expectedHead??contract.baseSha);
    const changes=[...new Set([...Object.keys(base.files),...Object.keys(candidate.files)])].filter(path=>base.files[path]!==candidate.files[path]);
    if(!changes.length||changes.some(path=>!contract.profile.allowedPaths.includes(path)))throw new Error("Publication changes exceed the admitted source paths.");
    for (const content of new Set(Object.values(candidate.files))) {
      const blob=await this.api("git/blobs",{content,encoding:"utf-8"});
      if (blob.sha!==objectSha("blob",content)) throw new Error("GitHub blob identity mismatch.");
    }
    for (const tree of treeObjects(candidate.files).objects) {
      const result=await this.api("git/trees",{tree:tree.entries});
      if (result.sha!==tree.sha) throw new Error("GitHub tree identity mismatch.");
    }
    const person={name:candidate.commit.name,email:candidate.commit.email,date:candidate.commit.date};
    const commit=await this.api("git/commits",{message:candidate.commit.message,tree:candidate.tree,parents:[candidate.parentSha],author:person,committer:person});
    if (commit.sha!==candidate.sha) throw new Error("GitHub candidate identity mismatch.");
    // Never force-update. A concurrent divergent human commit causes GitHub to reject this write.
    if (expectedHead) await this.api(`git/refs/heads/${branch}`,{sha:candidate.sha,force:false},"PATCH");
    else await this.api("git/refs",{ref:`refs/heads/${branch}`,sha:candidate.sha});
    if (truth.pr) return {number:truth.pr.number,url:truth.pr.url};
    const pr=await this.api("pulls",{title:`MyEve: ${contract.objective.slice(0,120)}`,head:branch,base:contract.profile.baseBranch,draft:true,
      body:`Work ${contract.workId}\n\n${contract.objective}\n\nCandidate: ${candidate.sha}\n\nProtected evidence is retained by MyEve. Human review is required. No merge or deployment is authorized.`});
    return {number:pr.number,url:pr.html_url};
  }
}
