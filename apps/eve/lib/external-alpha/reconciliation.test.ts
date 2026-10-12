import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({repair:vi.fn(),read:vi.fn(),sweep:vi.fn(),policy:{ownerId:'owner-a'},config:{}}));
vi.mock('./policy.ts',()=>({externalAlphaPolicy:()=>m.policy}));
vi.mock('./work-config.ts',()=>({externalAlphaWorkConfig:()=>m.config,assertExternalAlphaWorkBinding:()=>{}}));
vi.mock('./shared-accounting.ts',()=>({sharedAlphaAccounting:()=>({reconcile:m.repair})}));
vi.mock('./work-authority.ts',()=>({WorkAuthoritySigner:{fromEnv:()=>({})},ExternalAlphaWorkAuthority:class{
 policy=m.policy;database:any;constructor(database:any){this.database=database;}forWork=async()=>({workVersion:1,workGeneration:1});sweep=m.sweep;
}}));
vi.mock('./work-controller.ts',()=>({externalAlphaWorkConfig:()=>m.config,receiptKeys:()=>[],HttpExternalAlphaFactoryClient:class{},ExternalAlphaWorkController:class{
 authority:any;constructor(authority:any){this.authority=authority;}reconcile=m.read;
}}));
vi.mock('../engineering/store.ts',()=>({WorkStore:class{
 principal:any;constructor(principal:any){this.principal=principal;}get=async()=>({lifecycle:'active',control:'agent',version:1,generation:1});
}}));
import {runExternalAlphaReconciliation} from './reconciliation.ts';
it('a shared repair outage does not prevent existing authority readback, cleanup or expiry sweep',async()=>{
 m.repair.mockRejectedValue(Error('shared unavailable'));m.read.mockResolvedValue({state:'COMPLETED'});m.sweep.mockResolvedValue({expired:0});
 const database={query:vi.fn().mockImplementation(async(sql:string)=>sql.includes('missioncontrol_enrollment_document')?[{document:null}]:[{work_id:'work-a'}])};
 expect(await runExternalAlphaReconciliation({database,env:{NODE_ENV:'test',MYEVE_OWNER_ID:'owner-a'},factory:{} as any,signer:{} as any})).toEqual({checked:1,outcomes:[{workId:'work-a',state:'COMPLETED'}],sweep:{expired:0},accountingRepair:'UNAVAILABLE',controls:null});
 expect(m.read).toHaveBeenCalledOnce();expect(m.sweep).toHaveBeenCalledOnce();
});

it('unavailable installed eligibility cannot skip retained Work repair, readback or expiry fencing',async()=>{
 m.repair.mockResolvedValue({});m.read.mockClear().mockResolvedValue({state:'COMPLETED'});m.sweep.mockClear().mockResolvedValue({expired:0});
 const database={query:vi.fn().mockImplementation(async(sql:string)=>{if(sql.includes('missioncontrol_enrollment_document'))throw Error('enrollment unavailable');return [{work_id:'work-a'}];})};
 const result=await runExternalAlphaReconciliation({database,env:{NODE_ENV:'test',MYEVE_OWNER_ID:'owner-a'},factory:{} as any,signer:{} as any});
 if('inactive' in result)throw Error('expected active reconciliation');
 expect(result.controls).toEqual({status:'DELIVERY_UNAVAILABLE'});expect(result.accountingRepair).toBe('RECONCILED');
 expect(result.outcomes).toEqual([{workId:'work-a',state:'COMPLETED'}]);expect(m.read).toHaveBeenCalledOnce();expect(m.sweep).toHaveBeenCalledOnce();
});
