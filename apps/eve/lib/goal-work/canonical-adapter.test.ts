import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {CanonicalGoalWorkAdapter,contractDigest,type CanonicalCreate,type CanonicalGateway,type CanonicalValidators} from './canonical-adapter.ts';
import type {WorkRequest} from './contracts.ts';
import {createWorkSchema} from '../engineering/types.ts';

it.each(['\\','"','\n'])('bounds escaped handoff context while retaining the complete intent (%j)',async text=>{
 const source={workId:randomUUID(),workVersion:1,workGeneration:1,candidate:'a'.repeat(40),artifactRefs:['artifact'],result:null,disposition:'TERMINAL_FENCED' as const,
  checkpoint:{receiptId:randomUUID(),manifestDigest:'b'.repeat(64),candidate:'a'.repeat(40),tree:'c'.repeat(40),base:'d'.repeat(40),attemptId:randomUUID(),trust:'ADVISORY_ONLY' as const}};
 const request:WorkRequest={ownerId:'owner',goalId:randomUUID(),taskId:randomUUID(),goalGeneration:1,taskGeneration:2,correlationKey:randomUUID(),objective:'o'.repeat(240),goalObjective:'project',criteria:['tests pass'],requiredCapabilities:[],assignedTo:'coder',targetAt:null,goalCriteria:['combined checks pass'],planVersion:1,dependencies:[],decisions:[],
  continuation:{fromAgent:text.repeat(255),reason:text.repeat(1000),sources:Array.from({length:40},()=>({...source,workId:randomUUID()}))}};
 let captured:CanonicalCreate|undefined,retained:WorkRequest|undefined;
 const gateway:CanonicalGateway={find:async()=>null,policy:async()=>({repository:'fixture/project',maxCostUsd:1,maxDurationSeconds:60,methods:['test']}),
  ensure:async(ownerId,input,intent)=>{captured=input;retained=intent;return {ownerId,input,intent,correlationKey:intent.correlationKey,workId:randomUUID(),workGeneration:1,state:'active'};},result:async()=>{throw Error('unused');}};
 const validators:CanonicalValidators={create:createWorkSchema,contract:{parse(){throw Error('unused');}},proof:{parse(){throw Error('unused');}},proofLinkProblems:()=>[]};
 const adapter=new CanonicalGoalWorkAdapter(gateway,validators);
 await adapter.ensure(request);
 expect(captured!.objective.length).toBeLessThanOrEqual(4000);
 expect(captured!.objective.startsWith(request.objective)).toBe(true);
 const summary=JSON.parse(captured!.objective.split('authority):\n')[1]);
 expect(summary.contextSha256).toBe(contractDigest(request.continuation));
 expect(summary.retainedSources).toBe(40);expect(summary.sources.length).toBeLessThanOrEqual(3);
 expect(retained).toEqual(request);
});
