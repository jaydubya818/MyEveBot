import {z} from 'zod';
import {digest} from './contract.ts';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const alphaOwnerBindingSchema=z.object({slot:z.enum(['A','B','C']),clientId:z.enum(['sofie-alpha-a','sofie-alpha-b','sofie-alpha-c']),ownerScope:z.string().regex(/^[-a-zA-Z0-9_]{1,200}$/),sourceProjectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),rosterSha256:hash,environment:z.literal('production'),factoryProjectId:z.literal('prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK')}).strict().superRefine((b,ctx)=>{
 if(b.clientId!=='sofie-alpha-'+b.slot.toLowerCase()||['prj_L6faw25wnFGUZtrLKBIccg8gIDLR',b.factoryProjectId].includes(b.sourceProjectId))ctx.addIssue({code:'custom',message:'Separate exact synthetic source/client required'});
});
/** Server-only installation binding. This has no grant, request or deadline. */
export function alphaOwnerBinding(env:Readonly<Record<string,string|undefined>>=process.env){
 const raw=env.MYEVE_ALPHA_OWNER_BINDING;if(!raw)return null;
 if(raw.length>4000)throw Error('ALPHA_OWNER_BINDING');
 const binding=alphaOwnerBindingSchema.parse(JSON.parse(raw));
 if(typeof window!=='undefined'||env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||(env.VERCEL_TARGET_ENV&&env.VERCEL_TARGET_ENV!=='production')||env.VERCEL_PROJECT_ID!==binding.sourceProjectId||env.MYEVE_OWNER_ID!==binding.ownerScope||env.MYEVE_ALPHA_OWNER_ROSTER_SHA256!==binding.rosterSha256)throw Error('ALPHA_OWNER_BINDING');
 return binding;
}
export function assertAlphaOwnerApproval(envelope:any,binding:z.infer<typeof alphaOwnerBindingSchema>){
 const actual=alphaOwnerBindingSchema.parse(envelope?.approval?.ownerBinding);
 if(digest(actual)!==digest(binding)||envelope.approval.manifestTemplate.clientId!==binding.clientId||envelope.approval.manifestTemplate.ownerScope!==binding.ownerScope)throw Error('ALPHA_OWNER_APPROVAL_BINDING');
}
