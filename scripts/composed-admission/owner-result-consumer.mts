import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {readbackSignature,type ResultRequest} from '../../apps/eve/lib/missioncontrol/result-protocol.ts';
import type {ExecutionPermit} from '../../apps/eve/lib/missioncontrol/execution-permit.ts';

/** Optional cross-repository qualification, never runtime configuration.
 * Require a clean exact source checkout; no fetch, mutation or remote execution. */
export async function qualifyOwnerResultConsumer(document:Record<string,any>,request:ResultRequest,permit:ExecutionPermit,pins:unknown,admissionEvidence:{document:unknown;enrollment:unknown}) {
  const root=process.env.MYEVE_OWNER_RESULT_MC_SOURCE,expected=process.env.MYEVE_OWNER_RESULT_MC_SHA;
  if(!root&&!expected)return {status:'NOT_RUN' as const};
  assert(root&&expected&&/^[a-f0-9]{40}$/.test(expected),'Exact MissionControl test source and SHA required');
  const sha=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  assert.equal(sha,expected);assert.equal(execFileSync('git',['-C',root,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'');
  const module=await import(pathToFileURL(root+'/convex/lib/installedFactoryResult.ts').href);
  const secret='synthetic-owner-composition-readback-secret';
  const packet={document,signature:readbackSignature(document,'mc-result-readback/v1',secret)};
  const current=module.verifyResultReadbackPacket(packet,request,permit,secret);
  const verified=module.verifyInstalledFactoryResult(current,permit,module.parseFactoryResultPins(pins),Date.now(),admissionEvidence);
  assert.equal(verified.status,'RESULT_VERIFIED_SETTLEMENT_REPORTED');assert.equal(verified.result.independentVerdict,'PASS');
  assert.equal(verified.missionId,permit.missionId);assert.equal(verified.result.nativeResultId,document.result.nativeResultId);
  assert.equal(verified.result.proofHash,document.result.proofHash);assert.equal(verified.executionAuthority,'NONE');
  const foreign={...document,missionId:'foreign'};
  assert.throws(()=>module.verifyResultReadbackPacket({document:foreign,signature:readbackSignature(foreign,'mc-result-readback/v1',secret)},request,permit,secret));
  assert.throws(()=>module.verifyInstalledFactoryResult({...current,admission:{...current.admission,binding:{...current.admission.binding,
    factoryBinding:{...current.admission.binding.factoryBinding,runId:'foreign'}}}},permit,module.parseFactoryResultPins(pins),Date.now(),admissionEvidence));
  return {status:'PASS' as const,sha};
}
