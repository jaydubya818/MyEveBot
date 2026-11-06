import {describe,it,expect} from 'vitest';
import {z} from 'zod';
import {missionControlToolSchema} from './prepare-execution.ts';

const id='11111111-1111-4111-8111-111111111111',digest='sha256:'+'a'.repeat(64);
describe('mission_control tool input',()=>{
 it('is one top-level object schema, which Anthropic and OpenAI tool calls require',()=>{
  const schema=z.toJSONSchema(missionControlToolSchema) as {type?:string;properties?:Record<string,unknown>};
  expect(schema.type).toBe('object');
  expect(Object.keys(schema.properties??{})).toEqual(expect.arrayContaining(['operation','missionId','proposalId','workId']));
 });
 it('still accepts exactly one existing variant and rejects mixed or incomplete input',()=>{
  expect(missionControlToolSchema.safeParse({operation:'enterprise.result',missionId:id,expectedPlanDigest:digest}).success).toBe(true);
  expect(missionControlToolSchema.safeParse({operation:'enterprise.result',missionId:id}).success).toBe(false);
  expect(missionControlToolSchema.safeParse({operation:'enterprise.result',missionId:id,expectedPlanDigest:digest,workId:'22222222-2222-4222-8222-222222222222'}).success).toBe(false);
  expect(missionControlToolSchema.safeParse({operation:'enterprise.unknown'}).success).toBe(false);
 });
});
