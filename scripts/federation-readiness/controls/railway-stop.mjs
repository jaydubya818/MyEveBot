/** Operator-only. IDs come from the frozen qualification manifest. This module
 * never discovers targets by name and never creates, restarts or removes them. */
export function railwayStopAdapter({credential,projectId,environmentId,deployments,request=fetch}) {
 const uuid=/^[a-f0-9-]{36}$/;
 if(!credential||!uuid.test(projectId??'')||!uuid.test(environmentId??'')||!Array.isArray(deployments)||deployments.length!==3||new Set(deployments.map(d=>d.serviceId)).size!==3||deployments.some(d=>!uuid.test(d.id??'')||!uuid.test(d.serviceId??'')))throw Error('FROZEN_THREE_WORKER_SCOPE_REQUIRED');
 async function query(query,variables,signal){
  const response=await request('https://backboard.railway.com/graphql/v2',{method:'POST',redirect:'error',signal,headers:{'content-type':'application/json',authorization:`Bearer ${credential}`},body:JSON.stringify({query,variables})});
  if(!response.ok)throw Error('STOP_API_UNAVAILABLE');
  const result=await response.json();if(result.errors||!result.data)throw Error('STOP_API_UNCONFIRMED');return result.data;
 }
 const inspect=(id,signal)=>query('query($id:String!){deployment(id:$id){id projectId environmentId serviceId status}}',{id},signal).then(r=>r.deployment);
 const instance=(target,signal)=>query('query($serviceId:String!,$environmentId:String!){serviceInstance(serviceId:$serviceId,environmentId:$environmentId){serviceId environmentId latestDeployment{id} activeDeployments{id projectId environmentId serviceId status}}}',{serviceId:target.serviceId,environmentId},signal).then(r=>r.serviceInstance);
 const terminal=d=>['REMOVED','FAILED','CRASHED','SKIPPED'].includes(d?.status);
 const scoped=(d,target)=>d?.id===target.id&&d.projectId===projectId&&d.environmentId===environmentId&&d.serviceId===target.serviceId;
 return async signal=>{
  const outcomes=await Promise.all(deployments.map(async target=>{
   try{
    const current=await instance(target,signal);if(current?.serviceId!==target.serviceId||current.environmentId!==environmentId||current.latestDeployment?.id!==target.id||!Array.isArray(current.activeDeployments)||current.activeDeployments.some(d=>!scoped(d,target)))return false;
    const before=await inspect(target.id,signal);if(!scoped(before,target))return false;
    if(!terminal(before)){
     const building=['BUILDING','INITIALIZING','QUEUED','WAITING','NEEDS_APPROVAL'].includes(before.status);
     const action=building?'deploymentCancel':'deploymentStop';
     const result=await query(`mutation($id:String!){${action}(id:$id)}`,{id:target.id},signal);
     if(result[action]!==true)return false;
    }
    const after=await inspect(target.id,signal);const final=await instance(target,signal);return scoped(after,target)&&terminal(after)&&final?.serviceId===target.serviceId&&final.environmentId===environmentId&&final.latestDeployment?.id===target.id&&Array.isArray(final.activeDeployments)&&final.activeDeployments.every(d=>scoped(d,target)&&terminal(d));
   }catch{return false;}
  }));
  return outcomes.every(value=>value===true);
 };
}
