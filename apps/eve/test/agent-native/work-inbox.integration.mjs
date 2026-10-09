import assert from 'node:assert/strict';
import {pool,reset,service,workId,integration,decide} from '../publication/harness.mjs';
import {readWorkInbox} from '../../lib/product/work-inbox.ts';
import {workState} from '../../lib/product/work-state.ts';
import {CanonicalBetaWork} from '../../lib/beta-integration/canonical-work.ts';
if(process.env.MYEVE_PRODUCT_TEST_PORT && !/^[0-9]{1,5}$/.test(process.env.MYEVE_PRODUCT_TEST_PORT))throw Error('Numeric disposable loopback port required');
if(process.env.MYEVE_PUBLICATION_TEST_DATABASE!==`postgresql://postgres@127.0.0.1:${process.env.MYEVE_PRODUCT_TEST_PORT??'55509'}/myeve_beta_publication`)throw Error('Task-owned database required');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
try{
 await reset();
 const before=(await pool.query('SELECT lifecycle,version,generation FROM engineering_work WHERE id=$1',[workId])).rows;
 const threads=(await pool.query("SELECT id,chat FROM web_chat_threads WHERE owner_id='owner' ORDER BY id")).rows;
 const get=async()=> (await readWorkInbox(integration,'owner')).works.find(w=>w.id===workId);
 eq((await get()).lane,'Needs You');eq((await get()).threadId,'agent-native-controlled-thread');
 eq((await readWorkInbox(integration,'not-owner')).works.length,0);
 await decide('keep_private');eq((await get()).lane,'Completed');
 eq((await pool.query('SELECT lifecycle,version,generation FROM engineering_work WHERE id=$1',[workId])).rows,before);
 eq((await pool.query("SELECT id,chat FROM web_chat_threads WHERE owner_id='owner' ORDER BY id")).rows,threads);
 const {projection}=await new CanonicalBetaWork(integration).projection('owner',workId);
 const pub=await service.view('owner',workId);
 // Controlled read-model cases exercise classification only, not cloud or publication effects.
 const synthetic={...pub,decision:{...pub.decision,action:'open_pr'},publication:{...pub.publication,state:'PR_OPEN'}};
 eq(workState(projection,synthetic).lane,'Monitoring');
 eq(workState(projection,{...synthetic,readback:{ci:{status:'FAIL'},review:{status:'NOT_RUN'}}}).lane,'Needs You');
 eq(workState(projection,{...pub,binding:{...pub.binding,generation:999}}).lane,'Waiting');
 eq(workState({...projection,lifecycle:'cancelled'},null),{lane:'Completed',detail:'Cancelled'});
 eq(workState({...projection,lifecycle:'active',runTruth:{...projection.runTruth,activeRun:{id:'controlled-active'}}},null).lane,'Working');
 eq((await pool.query('SELECT pushes,prs FROM publication_boundary_fixture')).rows[0],{pushes:0,prs:0});
 console.log(JSON.stringify({evidence:'DETERMINISTIC',checks,chatArchivalRequired:false,workLifecycleMutated:false,liveCloud:'NOT_RUN'}));
}finally{await reset();await pool.end();}
