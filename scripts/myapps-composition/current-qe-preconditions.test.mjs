import test from 'node:test';
import assert from 'node:assert/strict';
import {runCurrentQEProof} from './current-qe-runtime.mjs';
import {buildPreparedCurrent} from './current-build-producer.mjs';
const spec=()=>({profile:'eve-0.66.3-current-qe-public-chat-v1',sourceRoot:'/never-read',sourceCommit:'f'.repeat(40),workRoot:'/never-create',
 sdkArchive:'/never-read',toolchain:{node:{path:process.execPath}},font:{path:'/never-read'},native:{adminUrl:'never-connect',systemIdentifier:'never-connect',dataDirectory:'/never-touch',port:56792,operatorPreflightSha256:'a'.repeat(64)},
 ports:{model:3184,web:3188,eve:3185}});
test('unknown/fallback profiles fail before reading font/source or invoking a child',async()=>{
 const value=spec();value.profile='fallback-if-historical-fails';await assert.rejects(runCurrentQEProof(value),/CURRENT_PROFILE_MUST_BE_EXPLICIT/);
});
test('unknown operator fields are rejected before all side effects',async()=>{
 await assert.rejects(runCurrentQEProof({...spec(),skipHistorical:true}),/CURRENT_OPERATOR_SPEC_FIELDS/);
});
test('unknown service topology is rejected before all side effects',async()=>{
 const value=spec();value.ports.model=443;await assert.rejects(runCurrentQEProof(value),/CURRENT_REVIEWED_TOPOLOGY/);
});
test('missing physical native preflight never degrades to localhost ownership',async()=>{
 const value=spec();value.native.operatorPreflightSha256='localhost';await assert.rejects(runCurrentQEProof(value),/CURRENT_NATIVE_PREFLIGHT_REQUIRED/);
});
test('an arbitrary prior build receipt cannot be reused as freshly prepared inputs',async()=>{
 await assert.rejects(buildPreparedCurrent({status:'FRESH_INPUTS_PREPARED_NOT_BUILT'},{}),/BUILD_UNKNOWN_PREPARED_INPUT/);
});
