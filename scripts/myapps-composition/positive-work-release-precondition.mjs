import {types} from 'node:util';

const profiles=new Set(['golden','e3','independent']);
const sourcePattern=/^[a-f0-9]{40}$/;
function ownData(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value))return null;
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==Object.prototype&&prototype!==null)return null;
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(descriptors).length!==keys.length)return null;
 const result=Object.create(null);
 for(const key of keys){
  const descriptor=descriptors[key];
  if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
  result[key]=descriptor.value;
 }
 return result;
}
function equalHashes(value,expected){
 const data=ownData(value,Object.keys(expected));
 return data!==null&&Object.keys(expected).every(key=>typeof data[key]==='string'&&data[key]===expected[key]);
}
function blocked(code,profile='UNKNOWN',sourceBound=false){
 return Object.freeze({version:1,obligation:'POSITIVE_WORK_V1',status:'BLOCKED_NOT_QUALIFIED',
  code,profile,sourceBinding:sourceBound?'MATCHED_CHECKOUT':'UNVERIFIED',positiveWorkQualified:false});
}
export function observationUnavailable(){return blocked('POSITIVE_WORK_OBSERVATION_UNAVAILABLE');}
export function parsePreconditionArguments(argv){
 if(!argv||types.isProxy(argv)||!Array.isArray(argv)||argv.length!==4)return null;
 const values=[];
 for(let index=0;index<4;index++){
  const descriptor=Object.getOwnPropertyDescriptor(argv,String(index));
  if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='string')return null;
  values.push(descriptor.value);
 }
 if(values[0]!=='--source-commit'||values[2]!=='--journey'
  ||!sourcePattern.test(values[1])||!profiles.has(values[3]))return null;
 return {declaredSource:values[1],profile:values[3]};
}
/** Source classification only, never a Work grant or a positive qualification.
 * Even an unknown/future release must be separately qualified, not auto-allowed.
 * No environment, client request or executable application dependency is read. */
export function evaluatePositiveWorkPrecondition(input){
 try{
  const data=ownData(input,['declaredSource','checkoutSource','checkoutTree','sourceClean',
   'profile','releaseMode','observedArchiveSha256','workFileHashes','guardFileHashes']);
  if(!data)return blocked('POSITIVE_WORK_DECLARED_CONTRACT_INVALID');
  if(typeof data.profile!=='string'||!profiles.has(data.profile))return blocked('POSITIVE_WORK_PROFILE_UNSUPPORTED');
  const profile=data.profile;
  if(typeof data.declaredSource!=='string'||!sourcePattern.test(data.declaredSource)
   ||data.checkoutSource!==data.declaredSource||typeof data.checkoutTree!=='string'
   ||!sourcePattern.test(data.checkoutTree)||data.sourceClean!==true)
   return blocked('POSITIVE_WORK_SOURCE_BINDING_MISMATCH',profile);
  if(data.observedArchiveSha256!==archiveSha256||!equalHashes(data.workFileHashes,archivedWorkFiles))
   return blocked('POSITIVE_WORK_ARCHIVE_DRIFT',profile,true);
  if(data.releaseMode!=='CHAT_ONLY_V1'||!equalHashes(data.guardFileHashes,releaseGuardFiles))
   return blocked('POSITIVE_WORK_RELEASE_REQUALIFICATION_REQUIRED',profile,true);
  return blocked('POSITIVE_WORK_CHAT_ONLY_RELEASE',profile,true);
 }catch{return observationUnavailable();}
}

export const archivePath="apps/eve/test/owner-journey/positive-work-v1-archive.json";
export const archiveSha256="de2275aaf38dc39645772c11d6068f72fc10a822e5f67272a10f275d0f84b86a";
export const archivedWorkFiles=Object.freeze({
  "apps/eve/test/owner-journey/runner-prod.ts": "d67d959043a603802bc61d75949618ce8d711ad5e4c17197e8ba696e3156137c",
  "apps/eve/test/owner-journey/runner.ts": "3ea6570e2dc3804544834d7e536b9b9de44fd96f250b3cc59c1dd2f45d2e303b",
  "apps/eve/test/owner-journey/gateway.ts": "cee51d550aa8b8830351dea38e13270d29150532cbfba0877f63e8bc0a8317fd",
  "apps/eve/test/owner-journey/journey.spec.cjs": "b4cfb4cae1ae2fb02e6a37a5a9d883564a04df64f024043d2df353b3849e1f84",
  "apps/eve/test/owner-journey/e3-natural-followup.spec.cjs": "051aca289346a60196ad69be5bf1c9733f62edb25e9e077b6827be7b42a7eba1",
  "apps/eve/test/owner-journey/independent.spec.cjs": "4fe8f6bf6abd0365864389b1a6134962e140ebc6d353c1fde4c0b6da45eb71cf",
  "apps/eve/test/owner-journey/playwright.config.cjs": "0fe63f06d4c967bb6d57447b3e200bad5189f355571507ffb6f9dd9fa9fbff81",
  "apps/eve/test/owner-journey/e3.config.cjs": "bccea9cbdb7fe87997890534c71f8ae544b1874e02411251fa4b0f7c4c65a48f",
  "apps/eve/test/owner-journey/independent.config.cjs": "b07fc2d1531f6c1c592db187e1f7ada431d09086e42447e3e3153a772536f4e0",
  "apps/eve/test/owner-journey/README.md": "ac3a15b7eeca1966b47fb0eab281d6ce112d14c64f4572ba4821a2b12e38e7db"
});
export const releaseGuardFiles=Object.freeze({
  "apps/eve/lib/external-alpha/model.ts": "406f45c94c3e2605ec5ace2593ac8efedfe82256f69de35695fa6f7d1331c7d1",
  "apps/eve/lib/external-alpha/tool-authority.ts": "c3502cfef60044fcad91bd2daa11d31aedba4aa705323a5466b8e402d4d2acd4",
  "apps/eve/lib/external-alpha/features.ts": "9746f05ad90886627d9f9e30d12800062792a72a50a94acf1e3985b0e9c224f8",
  "apps/eve/lib/external-alpha/context.ts": "5d96a998c9501560c8b482a170ef67cbfce6c54f15f960dd038a5e3970d67121",
  "apps/eve/lib/external-alpha/shared-accounting-chat-only.sql": "c1ee56e72f20fae8e277a2bcada1644583dd3de0e9c69114f5d2b20eaca3cb14",
  "apps/eve/migrations/0109_external_alpha_chat_only.sql": "71a3cf4eb5b4bcb12d9eb451dd2e35810773bf6c247243c2250aec44b725ffd3"
});
