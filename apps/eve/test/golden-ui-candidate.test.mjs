import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fixture} from './engineering-fixtures.ts';
import {syntheticCandidate} from './golden-ui-candidate.mjs';
import {assertCandidateIdentity} from '../lib/engineering/github.ts';
import {manifest} from '../lib/engineering/execution.ts';

test('UI fixture retains an exact candidate but never manufactures protected evidence',async()=>{
  const f=fixture();
  const {run,candidate,localChecks}=await syntheticCandidate(f.contract,f.state.generation);
  assert.doesNotThrow(()=>assertCandidateIdentity(f.contract,run,run.inputSnapshot,candidate));
  assert.equal(localChecks.length,f.contract.profile.checks.length);
  assert.ok(localChecks.every(check=>check.producer==='simulation-local'&&
    JSON.parse(check.artifact).limitation.includes('no protected verifier')));
  for(const [input,output] of [['2','{"quantity":2}\n'],['1.5','{"error":"invalid_quantity"}\n'],['0','{"error":"invalid_quantity"}\n']]){
    const result=spawnSync(process.execPath,['--input-type=module','-e',candidate.files['quantity.mjs']],
      {input,encoding:'utf8',timeout:10_000});
    assert.equal(result.status,0);
    assert.equal(result.stdout,output);
  }
  Object.assign(f.state,{qualificationMode:'simulation',phase:'observing',runs:[run],candidates:[candidate],
    evidence:[],approval:null,effects:[],results:[],blockers:['SIMULATED local host checks only.'],truth:null});
  const current=manifest(f.work,f.state);
  assert.equal(current.readiness.ready,false);
  assert.equal(current.status,'Waiting');
  assert.match(current.readiness.reasons.join(' '),/Protected verification positive is NOT_RUN/);
});
