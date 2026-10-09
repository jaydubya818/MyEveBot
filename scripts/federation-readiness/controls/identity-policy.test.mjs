import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workloadIdentityPolicy } from './identity-policy.mjs';
test('identity policy cannot be generated with unresolved IDs',()=>{
 for(const fields of [{},{projectId:'synthetic-project',projectNumber:'123456789',customEnvironmentId:'preview'}])assert.throws(()=>workloadIdentityPolicy(fields),/REQUIRED/);
});
test('qualification identity restricted to exact team/project/custom environment and keys',()=>{
 const policy=workloadIdentityPolicy({projectId:'synthetic-project',projectNumber:'123456789',customEnvironmentId:'env_synthetic'});
 assert.equal(policy.apply,false);assert.match(policy.attributeCondition,/assertion.custom_environment_id == 'env_synthetic'/);assert.match(policy.attributeCondition,/assertion.owner_id == 'team_p8z8exJRTGfOPk1GC9vUOpv3'/);assert.match(policy.attributeCondition,/assertion.project_id == 'prj_3IRvr9knK5VJcBTgTYMvhv6ixmJK'/);assert.match(policy.attributeCondition,/assertion.environment == 'federation-qualification'/);
 assert.deepEqual(policy.bindings.flatMap(x=>x.keys),['fq-evidence','fq-delivery','fq-passport','fq-envelope']);
 assert.equal(policy.bindings.flatMap(x=>x.permissions).some(x=>/Admin|create|setIam|destroy/.test(x)),false);
});
