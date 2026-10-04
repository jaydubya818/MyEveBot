import {it,expect} from 'vitest';
import {productionValidationReportSchema} from './production-validation-report.ts';
it('renders the complete owner readback shape and refuses incomplete PASS claims',()=>{
 const report={state:'PASS',workId:'11111111-1111-4111-8111-111111111111',resultId:'22222222-2222-4222-8222-222222222222',proofReferences:['factory-evidence:sha256:a','factory-evidence:sha256:b'],evidence:[{kind:'TestEvidence',sha256:'a'.repeat(64),size:10},{kind:'DiffEvidence',sha256:'b'.repeat(64),size:20}],isolation:{factoryCrossOwner:'DENIED',factoryCrossWork:'DENIED',myEveCrossOwner:'DENIED',myEveCrossWork:'DENIED',crossOwnerDisclosures:0,crossWorkDisclosures:0},modelExecution:'DISABLED',publication:'DISABLED'};
 expect(productionValidationReportSchema.parse(report)).toEqual(report);
 for(const key of ['isolation','evidence','proofReferences','resultId','publication'])expect(productionValidationReportSchema.safeParse({...report,[key]:undefined}).success).toBe(false);
 expect(productionValidationReportSchema.safeParse({...report,isolation:{...report.isolation,crossOwnerDisclosures:1}}).success).toBe(false);
});
