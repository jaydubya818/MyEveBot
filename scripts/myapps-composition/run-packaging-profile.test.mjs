import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPackagingProfile,runPackagingProfile} from './run-packaging-profile.mjs';
const current=()=>({profile:'eve-0.66.3-current-qe-public-chat-v1',plan:'/not-read',planSha256:'f'.repeat(64),clearance:'/not-read',clearanceSha256:'e'.repeat(64),log:'/not-created'});
test('current profile requires an explicit full owned operator/clearance binding',()=>assert.equal(selectPackagingProfile(current()),'eve-0.66.3-current-qe-public-chat-v1'));
test('historical profile keeps its own original verifier inputs',()=>assert.equal(selectPackagingProfile({profile:'historical-tokenizer-f896',sourceRoot:'/source',serverRoot:'/artifact',output:'/output',node:'/node',log:'/log'}),'historical-tokenizer-f896'));
test('a historical error can never select an automatic current fallback',async()=>{
 const value={...current(),profile:'current-if-historical-fails'};await assert.rejects(runPackagingProfile(value),/UNKNOWN_PROFILE_NO_FALLBACK/);
});
test('untrusted standalone receipts cannot award the current profile',()=>assert.throws(()=>selectPackagingProfile({...current(),receipt:{status:'PASS'}}),/PACKAGING_PROFILE_FIELDS/));
test('missing operator clearance fails before filesystem or execution',async()=>{const value=current();delete value.clearance;await assert.rejects(runPackagingProfile(value),/PACKAGING_PROFILE_FIELDS/);});
