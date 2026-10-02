import { OwnerPublication } from "./owner-publication.ts";
import { assertPublicationCustody, deny, type PublicationBinding } from "./publication-contract.ts";
import type { Candidate } from "./execution.ts";
export interface PublicationRemote {branchSha:string|null;pr:null|{number:number;url:string;candidate:string;base:string;draft:boolean;open:boolean};}
export interface PublicationPort {
 base(binding:PublicationBinding):Promise<string>;
 inspect(binding:PublicationBinding):Promise<PublicationRemote>;
 push(binding:PublicationBinding,candidate:Candidate,sourceFiles:Record<string,string>):Promise<void>;
 openPR(binding:PublicationBinding):Promise<void>;
}
/** Durable per-Result claims survive refresh, network retry and process restart.
 * A recorded attempt can only be reconciled; it can never be repeated. */
export class CandidatePublication {
 constructor(readonly owner:OwnerPublication,readonly remote:PublicationPort){}
 async run(ownerId:string,workId:string,decisionId:string){
  const connection=await this.owner.db.pool.connect();
  let locked=false;
  try{
   const [lock]=(await connection.query("SELECT pg_try_advisory_lock(hashtextextended($1,980)) AS acquired",[ownerId+":"+workId])).rows;
   if(!lock?.acquired)deny("Publication is already being handled.");locked=true;
   const initial=await this.owner.current(ownerId,workId),decision=initial.decision,publication=initial.publication;
   if(!decision||decision.id!==decisionId||!publication||publication.decision_id!==decisionId||decision.binding_hash!==initial.bindingHash||
    !['open_pr','push_branch'].includes(decision.action))deny("No current exact-candidate publication decision.");
   const b=initial.binding;
   const update=async(values:{state:string;remote?:unknown;reason?:string})=>{await this.owner.db.query(`UPDATE engineering_candidate_publications SET state=$3,remote=coalesce($4::jsonb,remote),reason=$5,updated_at=now() WHERE owner_id=$1 AND result_id=$2`,[ownerId,b.resultId,values.state,values.remote?JSON.stringify(values.remote):null,values.reason??null]);};
   const validateRemote=(x:PublicationRemote)=>{
    if(x.branchSha!==null&&x.branchSha!==b.candidate)deny("Candidate branch contains a different commit.");
    if(x.pr&&(!x.pr.open||!x.pr.draft||x.pr.candidate!==b.candidate||x.pr.base!==b.baseRef))deny("Existing PR differs from this approval.");
    if(decision.action==='push_branch'&&x.pr)deny("Push-only decision cannot adopt a PR.");
   };
   const current=async()=>{
    const now=await this.owner.current(ownerId,workId);
    if(now.bindingHash!==decision.binding_hash||now.decision?.id!==decisionId||!now.publication||['UNKNOWN','DENIED'].includes(now.publication.state)||Date.parse(decision.expires_at)<=Date.now())deny("Owner decision is stale or expired.");
    assertPublicationCustody(b,now.candidate,now.sourceFiles);
    if(await this.remote.base(b)!==b.expectedBaseSha)deny("Qualified base ref moved; no rebase is permitted.");
    return now;
   };
   try{
    let state=await this.remote.inspect(b);validateRemote(state);
    if(['PR_OPEN','BRANCH_PUBLISHED'].includes(publication.state)){
     if(state.branchSha!==b.candidate||(publication.state==='PR_OPEN'&&!state.pr))deny("Published identity changed.");
     return state;
    }
    if(publication.state==='DENIED')deny("Publication denied; no automatic retry.");
    if(publication.state==='UNKNOWN'){
     if(state.branchSha===b.candidate&&(decision.action==='push_branch'||state.pr)){
      await update({state:state.pr?'PR_OPEN':'BRANCH_PUBLISHED',remote:state});return state;
     }
     deny("Uncertain prior effect remains fenced; readback cannot create another effect.");
    }
    await current();
    await update({state:'PUBLISHING'});
    if(state.branchSha===null){
     if(publication.push_attempted){await update({state:'UNKNOWN',reason:'Push outcome unconfirmed; no repeat'});return null;}
     const now=await current();
     await this.owner.db.query("UPDATE engineering_candidate_publications SET push_attempted=true WHERE owner_id=$1 AND result_id=$2",[ownerId,b.resultId]);
     try{await this.remote.push(b,now.candidate,now.sourceFiles);}catch{/* Readback is the only recovery. */}
     state=await this.remote.inspect(b);validateRemote(state);
     if(state.branchSha!==b.candidate){await update({state:'UNKNOWN',reason:'Push outcome unconfirmed; no repeat'});return null;}
    }
    if(decision.action==='push_branch'){await update({state:'BRANCH_PUBLISHED',remote:state});return state;}
    if(!state.pr){
     if(publication.pr_attempted){await update({state:'UNKNOWN',reason:'PR outcome unconfirmed; no repeat'});return null;}
     await current();
     await this.owner.db.query("UPDATE engineering_candidate_publications SET pr_attempted=true WHERE owner_id=$1 AND result_id=$2",[ownerId,b.resultId]);
     try{await this.remote.openPR(b);}catch{/* Never repeat a create after an ambiguous response. */}
     state=await this.remote.inspect(b);validateRemote(state);
     if(!state.pr){await update({state:'UNKNOWN',reason:'PR outcome unconfirmed; no repeat'});return null;}
    }
    await update({state:'PR_OPEN',remote:state});return state;
   }catch(error){
    const [latest]=await this.owner.db.query("SELECT push_attempted,pr_attempted FROM engineering_candidate_publications WHERE owner_id=$1 AND result_id=$2",[ownerId,b.resultId]);
    await update({state:latest?.push_attempted||latest?.pr_attempted?'UNKNOWN':'DENIED',reason:'Publication guard or readback failed; no automatic retry'});throw error;
   }
  }finally{if(locked)await connection.query("SELECT pg_advisory_unlock(hashtextextended($1,980))",[ownerId+":"+workId]);connection.release();}
 }
}
