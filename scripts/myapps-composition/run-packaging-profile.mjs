/** Explicit qualification dispatch. An error in one profile never selects the
 * other. Current acceptance comes only from running the reviewed owned operator,
 * not from trusting an arbitrary preexisting receipt. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {observedCommand} from './current-build-producer.mjs';
const CURRENT='eve-0.66.3-current-qe-public-chat-v1',HISTORICAL='historical-tokenizer-f896';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function selectPackagingProfile(spec){
 assert(spec&&Object.getPrototypeOf(spec)===Object.prototype,'PACKAGING_EXPLICIT_PROFILE_REQUIRED');
 assert([CURRENT,HISTORICAL].includes(spec.profile),'PACKAGING_UNKNOWN_PROFILE_NO_FALLBACK');
 const expected=spec.profile===CURRENT?['profile','plan','planSha256','clearance','clearanceSha256','log']:
  ['profile','sourceRoot','serverRoot','output','node','log'];
 assert.deepEqual(Object.keys(spec).sort(),expected.sort(),'PACKAGING_PROFILE_FIELDS');
 return spec.profile;
}
export async function runPackagingProfile(spec){
 const profile=selectPackagingProfile(spec);
 if(profile===HISTORICAL){
  // Existing verifier, manifest, canonical consumers and assertion semantics
  // remain unchanged. This branch has no catch/fallback to the current profile.
  return observedCommand(spec.node,[join(spec.sourceRoot,'scripts/myapps-composition/verify-tokenizer-trace.mjs'),spec.sourceRoot,spec.serverRoot,spec.output],
   {cwd:spec.sourceRoot,env:{PATH:'/usr/bin:/bin'},log:spec.log,timeoutMs:60000});
 }
 for(const [file,expected] of [[spec.plan,spec.planSha256],[spec.clearance,spec.clearanceSha256]]){
  assert.equal(realpathSync(file),file,'PACKAGING_CONTROL_FILE_ALIAS');assert.match(expected,/^[a-f0-9]{64}$/);assert.equal(hash(readFileSync(file)),expected,'PACKAGING_CONTROL_DRIFT');
 }
 const plan=JSON.parse(readFileSync(spec.plan));assert.equal(plan.profile,CURRENT);
 const operator=join(plan.sourceRoot,'scripts/myapps-composition/current-native-operator.py');
 assert.equal(hash(readFileSync(operator)),plan.sourceFiles['scripts/myapps-composition/current-native-operator.py'],'PACKAGING_OPERATOR_BODY_DRIFT');
 const python=plan.toolchain.python;assert.equal(realpathSync(python.path),python.path);assert.equal(hash(readFileSync(python.path)),python.sha256);
 // A signal/timeout may arrive at ANY native stage. The outer owner must honor
 // the complete bounded native cleanup, independently of the nominal deadline:
 // controller35s + registry57s + cluster165s + ports20s + source20s < 420s.
 // Forced native-owner loss remains UNKNOWN; its empty PG alone proves nothing
 // about detached groups/PG. Only a complete successful operator receipt qualifies.
 let observation;
 try{
  observation=await observedCommand(python.path,[operator,'--plan',spec.plan,'--plan-sha256',spec.planSha256,
   '--clearance',spec.clearance,'--clearance-sha256',spec.clearanceSha256],
   {cwd:plan.sourceRoot,env:{PATH:'/usr/bin:/bin',HOME:'/nonexistent'},log:spec.log,timeoutMs:900000,cleanupGraceMs:420000});
 }catch(error){
  // Python's PG can be empty while its detached controller/children/PG survive.
  // A failed owner cannot certify that wider cleanup; retain the first failure
  // and require separate exact owned-state reconciliation, never an auto retry.
  throw new AggregateError([error,Error('PACKAGING_NATIVE_DESCENDANT_CLEANUP_UNKNOWN')],'Current profile failed; retain owned-state HOLD');
 }
 const path=join(plan.nativeRoot,'operator-receipt.json'),receipt=JSON.parse(readFileSync(path));
 assert.equal(receipt.status,'PASS_CURRENT_QE_PUBLIC_CHAT_'+plan.platform.toUpperCase()+'_'+plan.arch.toUpperCase(),'PACKAGING_OPERATOR_NOT_QUALIFIED');
 assert.equal(receipt.planSha256,spec.planSha256);assert.equal(receipt.clearanceSha256,spec.clearanceSha256);
 assert.equal(receipt.sourceCommit,plan.sourceCommit);assert.equal(receipt.sourceTree,plan.sourceTree);
 assert.equal(receipt.clusterStopped,true);assert.equal(receipt.sourceCleanAfter,true);
 assert(receipt.ports.every(row=>row.noListener));
 return {profile,status:receipt.status,sourceCommit:receipt.sourceCommit,sourceTree:receipt.sourceTree,
  operatorReceipt:path,operatorReceiptSha256:hash(readFileSync(path)),operatorProcess:observation,
  limits:receipt.limits};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--spec');
 const result=await runPackagingProfile(JSON.parse(readFileSync(process.argv[3],'utf8')));process.stdout.write(JSON.stringify(result)+'\n');
}
