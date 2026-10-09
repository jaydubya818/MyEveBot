import {describe,it,expect} from 'vitest';
import {deriveRequirements,requirementsDigest} from '../environment-fabric/router.ts';
import {cloudRoutingEvidenceSchema,assertCloudRoutingWork} from './cloud-environment-routing.ts';
import type {Work} from './types.ts';
const work={id:'2a9444d1-0845-4a25-8258-f70323559d80',generation:2,scopeId:'cloud-qualification-owner',repository:'jaydubya818/MyFactory'} as Work;
function fixture(){const {requirements,reasons}=deriveRequirements({workId:work.id,generation:work.generation,ownerId:work.scopeId,businessId:null,repository:work.repository},{kind:'repository'});return {requirements,reasons,binding:{environmentId:'myfactory-cloud-staging',environmentType:'CLOUD',identityDigest:'a'.repeat(64),factoryVersion:'b'.repeat(64),protocolVersion:1,policyVersion:'environment-routing-v1',requirementsDigest:requirementsDigest(requirements)},qualificationEvidenceRef:'qualification:deterministic-staging',evidenceClass:'DETERMINISTIC',productionAdmission:'DISABLED',sessionSurface:'HEADLESS'};}
describe('hosted attempt 1 routing admission regression',()=>{
 it('accepts and retains the real Fabric CLOUD binding',()=>{const f=fixture(),parsed=cloudRoutingEvidenceSchema.parse(f);expect(parsed).toEqual(f);expect(()=>assertCloudRoutingWork(parsed,work,'b'.repeat(64))).not.toThrow();});
 it.each(['generation','scopeId','repository','id'])('rejects changed Work %s',key=>{const changed={...work,[key]:key==='generation'?3:'other'};expect(()=>assertCloudRoutingWork(cloudRoutingEvidenceSchema.parse(fixture()),changed as Work,'b'.repeat(64))).toThrow('current Work');});
 it('rejects another FactoryVersion',()=>expect(()=>assertCloudRoutingWork(cloudRoutingEvidenceSchema.parse(fixture()),work,'c'.repeat(64))).toThrow('FactoryVersion'));
 it('rejects requirement drift without a matching binding',()=>{const f=fixture();f.requirements.generation++;expect(cloudRoutingEvidenceSchema.safeParse(f).success).toBe(false);});
 it('rejects local fallback and extra authority',()=>{const f=fixture();expect(cloudRoutingEvidenceSchema.safeParse({...f,authority:true}).success).toBe(false);expect(cloudRoutingEvidenceSchema.safeParse({...f,binding:{...f.binding,environmentType:'LOCAL_FACTORY'}}).success).toBe(false);});
});
