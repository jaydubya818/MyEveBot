import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {targetBlockers} from './preflight.mjs';
test('actual incomplete target cannot launch',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../../docs/federation/production-readiness/target-manifest.json',import.meta.url)));
 const blocked=targetBlockers(manifest);assert(blocked.includes('hostedKms'));assert(blocked.includes('modelHardLiability'));assert(blocked.includes('ingressAdmission'));
});
test('paper ready status or changed external gate cannot bypass prerequisites',()=>{
 const blockers=targetBlockers({status:'READY',independentSecurityGate:'PASS',productionPlatformGate:'PASS'});
 assert(blockers.includes('Implementation agent may not pass security gate'));assert(blockers.includes('hostedKms'));assert(blockers.length>10);
});
