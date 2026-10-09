import {expect,it} from 'vitest';
import {factoryWorkerApproval,assertFactoryWorkerApproval} from './factory-worker-approval.ts';
const id='11111111-1111-4111-8111-111111111111';
const env:NodeJS.ProcessEnv={NODE_ENV:'test',MYEVE_FACTORY_REAL_EXECUTION_APPROVED:'true',MYEVE_FACTORY_APPROVED_WORK_ID:id,MYEVE_FACTORY_APPROVED_WORK_VERSION:'2',MYEVE_FACTORY_APPROVED_WORK_GENERATION:'3'};
it('live activation cannot grant blanket dispatch or accept incomplete owner approval',()=>{
 for(const key of Object.keys(env).filter(k=>k!=='NODE_ENV'))expect(()=>factoryWorkerApproval('LIVE',{...env,[key]:undefined})).toThrow(/exact Work revision/);
 expect(()=>factoryWorkerApproval('LIVE',{...env,MYEVE_FACTORY_APPROVED_WORK_ID:'anything'})).toThrow();
});
it('permits only the explicitly approved Work and revision and preserves fixture qualification',()=>{
 const approval=factoryWorkerApproval('LIVE',env),input={operation:'start' as const,expectedWorkVersion:2,expectedWorkGeneration:3};
 expect(()=>assertFactoryWorkerApproval(approval,id,input)).not.toThrow();
 for(const [work,command] of [[id,{...input,expectedWorkVersion:3}],[id,{...input,expectedWorkGeneration:4}],['22222222-2222-4222-8222-222222222222',input]] as const)expect(()=>assertFactoryWorkerApproval(approval,work,command)).toThrow(/outside/);
 expect(()=>assertFactoryWorkerApproval(approval,id,{...input,operation:'stop',expectedWorkVersion:3})).not.toThrow();
 expect(factoryWorkerApproval('LOCAL_FIXTURE',{NODE_ENV:'test'})).toBeNull();
});
