import {describe,it,expect} from 'vitest';
import fixture from '../../test/fixtures/attempt7-accounting.json';
import {workSpendV2Schema} from './factory-spend.ts';
import {summarizeJourneyAccounting} from './journey-accounting.ts';
import {journeyCostText} from '../digital-worker/model-accounting.ts';
describe('canonical journey accounting',()=>{
 it('retained failed Work includes Sofie plus Factory and does not double-count duplicate readbacks',()=>{
  const value=summarizeJourneyAccounting(fixture.workId,[...fixture.calls,...fixture.calls],[fixture.spend,fixture.spend]);
  expect(value).toMatchObject({sofieMicrousd:4768,factoryMicrousd:13194,nativeMicrousd:0,settledMicrousd:17962,reservedMicrousd:0,unknownExposureMicrousd:0,coverage:'COMPLETE'});
  expect(journeyCostText(value)).toContain('$0.017962');
 });
 it('exposes UNKNOWN separately from incurred spend without losing the settled other source',()=>{
  const calls=structuredClone(fixture.calls);calls[1]={...calls[1],status:'USAGE_UNKNOWN',spent_microusd:'0',reserved_microusd:'150000'};
  expect(summarizeJourneyAccounting(fixture.workId,calls,[fixture.spend])).toMatchObject({settledMicrousd:14157,reservedMicrousd:150000,unknownExposureMicrousd:150000,coverage:'UNSETTLED'});
 });
 it('keeps a proof-time snapshot immutable while final explanation increases current total',()=>{
  const first=summarizeJourneyAccounting(fixture.workId,fixture.calls.slice(0,1),[fixture.spend]);const retained=JSON.stringify(first);
  const final=summarizeJourneyAccounting(fixture.workId,fixture.calls,[fixture.spend]);
  expect(first.settledMicrousd).toBe(14157);expect(final.settledMicrousd).toBe(17962);expect(JSON.stringify(first)).toBe(retained);
 });
 it('does not add the mirrored native budget to its operation rows',()=>{
  const calls=[{...fixture.calls[0],purpose:'NATIVE_EXECUTION'}];
  expect(summarizeJourneyAccounting(fixture.workId,calls,[]).settledMicrousd).toBe(963);
 });
 it('never calls missing Factory accounting complete or zero-cost',()=>{
  const value=summarizeJourneyAccounting(fixture.workId,fixture.calls,[null]);expect(value.coverage).toBe('UNAVAILABLE');expect(value.sofieMicrousd).toBe(4768);
 });
 it('settles a previously UNKNOWN Factory observation once, preserving the current liability when still unknown',()=>{
  const prior=workSpendV2Schema.parse(fixture.spend),op=prior.operations[0],paid=op.actualMicrousd!;
  op.state='unknown';op.actualMicrousd=null;op.providerRequestId=null;op.usage=null;
  prior.status='UNKNOWN';prior.settledMicrousd-=paid;prior.retainedMicrousd+=op.reservedMicrousd;prior.availableMicrousd-=op.reservedMicrousd-paid;
  prior.productiveAllowanceRemainingMicrousd-=op.reservedMicrousd-paid;prior.unknownExposureMicrousd=op.reservedMicrousd;prior.accountingComplete=false;
  const uncertain=summarizeJourneyAccounting(fixture.workId,fixture.calls,[prior]);expect(uncertain.unknownExposureMicrousd).toBe(op.reservedMicrousd);
  for(const observations of [[prior,fixture.spend],[fixture.spend,prior]])expect(summarizeJourneyAccounting(fixture.workId,fixture.calls,observations)).toMatchObject({settledMicrousd:17962,reservedMicrousd:0,coverage:'COMPLETE'});
 });
 it('failed-before-dispatch is no spend; real paid failure is retained',()=>{
  const call={...fixture.calls[0],id:'not-dispatched',status:'FAILED_BEFORE_DISPATCH',spent_microusd:'0'};
  expect(summarizeJourneyAccounting(fixture.workId,[...fixture.calls,call],[fixture.spend])).toMatchObject({settledMicrousd:17962,coverage:'COMPLETE'});
 });
 it('denies conflicting receipts and foreign work rather than inventing totals',()=>{
  expect(()=>summarizeJourneyAccounting(fixture.workId,[fixture.calls[0],{...fixture.calls[0],spent_microusd:'1'}],[])).toThrow(/Conflicting/);
  expect(()=>summarizeJourneyAccounting('00000000-0000-4000-8000-000000000000',[],[fixture.spend])).toThrow(/Foreign/);
 });
});
