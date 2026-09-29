import { deploymentOwnerId } from "./owner-identity.ts";
export const PARTNER_PRIVATE_TOOLS = new Set(['remember','get_knowledge','search_knowledge','inspect_owner_knowledge','search_owner_knowledge']);
export function isPartnerPrincipal(id:string|undefined,env:NodeJS.ProcessEnv=process.env){
 return !!env.MYEVE_PARTNER_OWNER_ID && !!id && id!==deploymentOwnerId(env);
}
/** Fail closed for legacy deployment-account surfaces. Extend only after an
 * end-to-end owner binding review, never merely because a route authenticates. */
export function partnerPrivateRoute(path:string,method:string){
 if(/^\/api\/(owner-knowledge|knowledge|files|threads)(?:\/|$)/.test(path))return true;
 if(method==='GET' && /^\/api\/(agents|goals|outcomes)(?:\/|$)/.test(path))return true;
 return false;
}
export function omitDeploymentInstructions(ctx:{session:{auth:{current:{principalId:string;attributes:Readonly<Record<string,unknown>>}|null}}}){
 const current=ctx.session.auth.current;
 return isPartnerPrincipal(current?.principalId) || (!!process.env.MYEVE_PARTNER_OWNER_ID && current?.attributes.myeveEngineeringWorkId!==undefined);
}
