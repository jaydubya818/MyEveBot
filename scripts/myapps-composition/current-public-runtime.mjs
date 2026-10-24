import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hashOrderedTranscript} from './transcript-value-hash.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const timeout=()=>AbortSignal.timeout(30_000);
// The create acknowledgement can precede the server's owner/session binding.
// Retry only the initial read-only stream opening, never the message POST.
const initialStreamReconnectPolicy=Object.freeze({
 retryableErrorStatuses:Object.freeze([500]),
 streamOpenReconnectPolicy:Object.freeze({baseDelayMs:250,maxAttempts:8,maxDelayMs:1000}),
 streamIdleReconnectPolicy:Object.freeze({maxAttempts:0}),
});

/** Validate one actual benign turn; never treat partial text as completion. */
export function validatePublicTurn(events,expected){
 assert(Array.isArray(events)&&events.length>0,'PUBLIC_TURN_EVENTS_REQUIRED');
 const ids=new Set();
 for(const event of events){
  assert(typeof event.meta?.id==='string'&&event.meta.id.length>0,'PUBLIC_EVENT_ID_REQUIRED');
  assert(!ids.has(event.meta.id),'PUBLIC_DUPLICATE_EVENT_ID');ids.add(event.meta.id);
  assert(!['turn.failed','turn.cancelled','session.failed','step.failed',
   'actions.requested','action.result','input.requested','authorization.required'].includes(event.type),
   'PUBLIC_UNEXPECTED_FAILURE_OR_TOOL');
 }
 assert(events.some(event=>event.type==='message.received'),'PUBLIC_USER_MESSAGE_REQUIRED');
 assert(events.some(event=>event.type==='turn.started'),'PUBLIC_TURN_START_REQUIRED');
 assert(events.some(event=>event.type==='turn.completed'),'PUBLIC_TURN_COMPLETION_REQUIRED');
 assert(events.findIndex(event=>event.type==='turn.started')<events.findIndex(event=>event.type==='turn.completed'),
  'PUBLIC_TURN_BOUNDARY_ORDER');
 assert.equal(events.at(-1).type,'session.waiting','PUBLIC_WAITING_BOUNDARY_REQUIRED');
 const starts=events.filter(event=>event.type==='turn.started'),completed=events.filter(event=>event.type==='turn.completed');
 assert.equal(starts.length,1,'PUBLIC_EXACT_TURN_REQUIRED');assert.equal(completed.length,1,'PUBLIC_EXACT_TURN_REQUIRED');
 const turnId=starts[0].data?.turnId;assert(typeof turnId==='string'&&turnId.length>0,'PUBLIC_TURN_ID_REQUIRED');
 for(const event of events.filter(event=>['message.received','turn.started','message.completed','turn.completed'].includes(event.type)))
  assert.equal(event.data?.turnId,turnId,'PUBLIC_TURN_ID_CHANGED');
 const messages=events.filter(event=>event.type==='message.completed');
 assert(messages.length>0&&messages.every(event=>event.data?.finishReason!=='tool-calls'),
  'PUBLIC_COMPLETED_MESSAGE_REQUIRED');
 assert.equal(messages.at(-1).data.message,expected,'PUBLIC_REPLY_MISMATCH');
 return {turnId,events:events.length,eventIds:[...ids],eventsSha256:hash(events),replySha256:hash(expected)};
}

/** A reconnect must replay the exact ordered durable transcript up to its known
 * cursor, including event bodies; matching an ID set is insufficient.
 */
export function validatePublicReplay(actual,expected,cursor){
 assert(Array.isArray(actual)&&Array.isArray(expected)&&expected.length>0,'PUBLIC_REPLAY_EVENTS_REQUIRED');
 assert(Number.isInteger(cursor)&&cursor===expected.length,'PUBLIC_REPLAY_CURSOR_BOUNDARY');
 assert.equal(actual.length,cursor,'PUBLIC_REPLAY_LENGTH');
 const ids=new Set();
 for(const event of actual){
  assert(typeof event.meta?.id==='string'&&event.meta.id&&!ids.has(event.meta.id),'PUBLIC_REPLAY_DUPLICATE_OR_MISSING_ID');
  ids.add(event.meta.id);
 }
 assert.deepEqual(actual,expected,'PUBLIC_REPLAY_TRANSCRIPT_CHANGED');
 return {cursor,events:actual.length,orderedTranscriptSha256:hashOrderedTranscript(actual)};
}

/** SDK 0.66.3's selected public agent workflow identity, bound to the
 * authenticated SDK/build and both owned listeners by the caller. */
export function validatePublicHealthPair(direct,proxy){
 assert(direct?.ok===true&&direct.status==='ready'&&direct.workflowId==='workflow//eve//workflowEntry','PUBLIC_HEALTH_SCHEMA');
 assert.deepEqual(proxy,direct,'PUBLIC_PROXY_SELECTED_RUNTIME_CHANGED');
 return {status:'DIRECT_AND_PROXY_SELECTED_HEALTH_MATCH'};
}

function publicWebBinding(config){
 const origin=new URL(config.webOrigin);
 assert(origin.protocol==='http:'&&origin.hostname==='localhost'&&origin.port
  &&origin.pathname==='/'&&!origin.search&&!origin.hash&&!origin.username&&!origin.password,
  'PUBLIC_CANONICAL_WEB_ORIGIN_REQUIRED');
 assert.match(config.ownerId,/^[a-f0-9-]{36}$/);
 assert(typeof config.password==='string'&&config.password.length>=24&&config.password.length<=128,'PUBLIC_SYNTHETIC_PASSWORD_REQUIRED');
 return origin.origin;
}

/** Synthetic public-client login phase using the same canonical browser origin
 * as R9. Injected send is for fake HTTP tests only; the owned probe uses fetch.
 * Preserve production CSRF and owner checks; never retry an accepted login.
 */
export async function authenticatePublicOwner(config,send=fetch){
 assert.deepEqual(Object.keys(config).sort(),['webOrigin','ownerId','password'].sort(),'PUBLIC_AUTH_CONFIG_FIELDS');
 const base=publicWebBinding(config);
 let cookie='';
 async function request(path,{method='GET',body,headers={}}={}){
  assert(path.startsWith('/')&&!path.startsWith('//'),'PUBLIC_RELATIVE_PATH_REQUIRED');
  const response=await send(base+path,{method,redirect:'error',signal:timeout(),headers:{
   origin:base,...(cookie?{cookie,'x-myeve-browser-owner':config.ownerId}:{}),
   ...(body?{'content-type':'application/json'}:{}),...headers},
   ...(body?{body:JSON.stringify(body)}:{})});
  return response;
 }
 const denied=await request('/api/threads');assert.equal(denied.status,401,'PUBLIC_SIGNED_LOGIN_REQUIRED');
 const login=await request('/api/auth/login',{method:'POST',body:{password:config.password}});
 assert.equal(login.status,200,'PUBLIC_LOGIN_FAILED');
 const cookies=login.headers.getSetCookie().filter(value=>value.startsWith('myeve_session='));
 assert.equal(cookies.length,1,'PUBLIC_SIGNED_SESSION_COOKIE_REQUIRED');
 cookie=cookies[0].split(';')[0];
 const statusResponse=await request('/api/auth/status');
 assert.equal(statusResponse.status,200,'PUBLIC_AUTH_STATUS_FAILED');
 const status=await statusResponse.json();
 assert.equal(status.authenticated,true,'PUBLIC_AUTHENTICATED_STATUS_REQUIRED');
 assert.equal(status.ownerId,config.ownerId,'PUBLIC_AUTHENTICATED_OWNER_REQUIRED');
 assert.equal(status.mode,'owner-session','PUBLIC_OWNER_SESSION_MODE_REQUIRED');
 return {request,cookie};
}

/** Actual public Client probe, to run ONLY inside a separately reviewed owned
 * producer with authenticated inputs/output/process and synthetic local model/PG.
 * No retries of accepted writes, no Work/private API/provider call. This helper
 * alone cannot award packaging or runtime qualification: the caller must bind
 * its HTTP observations to the exact owned process and authoritative DB rows.
 */
export async function observePublicRuntime(config){
 assert.deepEqual(Object.keys(config).sort(),['webOrigin','eveOrigin','clientWorkspace','ownerId','password','marker'].sort(),'PUBLIC_CONFIG_FIELDS');
 for(const value of [config.eveOrigin]){
  const origin=new URL(value);
  assert(origin.protocol==='http:'&&origin.hostname==='127.0.0.1'&&origin.port
   &&origin.pathname==='/'&&!origin.search&&!origin.hash&&!origin.username&&!origin.password,
   'PUBLIC_OWNED_LOOPBACK_ORIGIN_REQUIRED');
 }
 assert.match(config.marker,/^CURRENT_RUNTIME_[a-f0-9]{32}$/);
 const base=publicWebBinding(config),eve=new URL(config.eveOrigin).origin,threadId=randomUUID();
 const workspace=realpathSync(config.clientWorkspace);
 assert.equal(workspace,config.clientWorkspace,'PUBLIC_CLIENT_INPUT_ROOT_ALIAS');
 const appRequire=createRequire(join(workspace,'apps/eve/package.json'));
 const clientEntry=realpathSync(appRequire.resolve('eve/client'));
 const clientKey=relative(workspace,clientEntry);
 assert(clientKey&&!clientKey.startsWith('..'+sep)&&clientKey!=='..','PUBLIC_CLIENT_INPUT_ESCAPE');
 const {request,cookie}=await authenticatePublicOwner({webOrigin:base,ownerId:config.ownerId,password:config.password});
 const healthResponse=await fetch(eve+'/eve/v1/health',{redirect:'error',signal:timeout(),headers:{'x-myeve-runtime-probe':config.marker+'-direct'}});assert.equal(healthResponse.status,200);
 const health=await healthResponse.json();

 const proxyHealthResponse=await request('/eve/v1/health',{headers:{'x-myeve-runtime-probe':config.marker+'-proxy'}});assert.equal(proxyHealthResponse.status,200,'PUBLIC_PROXY_HEALTH_FAILED');
 const proxyHealth=await proxyHealthResponse.json();validatePublicHealthPair(health,proxyHealth);
 const agentsResponse=await request('/api/agents');assert.equal(agentsResponse.status,200,'PUBLIC_AGENTS_READ_FAILED');
 const {agents}=await agentsResponse.json();assert(Array.isArray(agents),'PUBLIC_AGENTS_SCHEMA');
 const primaries=agents.filter(agent=>agent.isPrimary===true);
 assert.equal(primaries.length,1,'PUBLIC_PRIMARY_AGENT_REQUIRED');
 const primary=primaries[0];assert.equal(primary.ownerId,config.ownerId);assert.equal(primary.status,'active');
 assert(typeof primary.id==='string'&&primary.id.length>0,'PUBLIC_AGENT_ID_REQUIRED');
 const initialUsageResponse=await request('/api/chat-usage');assert.equal(initialUsageResponse.status,200,'PUBLIC_INITIAL_USAGE_READ_FAILED');
 const initialUsage=await initialUsageResponse.json();
 assert.equal(initialUsage.dailyTurnsUsed,0);assert.equal(initialUsage.trialReservedMicrousd,0);
 const title='Current runtime packaging probe',updatedAt=Date.now();
 assert.equal((await request('/api/threads/'+threadId,{method:'PUT',body:{title,updatedAt,agentId:primary.id}})).status,200);
 // Only the documented public entrypoint is imported, after all input/launch
 // gates in the owning producer. Never import the private estimator/harness.
 const {Client}=await import(pathToFileURL(clientEntry).href);
 const options={host:base,redirect:'error',headers:{cookie,origin:base,'x-myeve-runtime-probe':config.marker+'-chat','x-myeve-browser-owner':config.ownerId,'x-myeve-thread-id':threadId}};
 const firstText=`Remember this runtime packaging marker: ${config.marker}. Reply in one sentence.`;
 const firstReply=`Runtime packaging marker ${config.marker}.`;
 const first=await new Client(options).sessions.create({message:firstText,signal:timeout(),streamReconnectPolicy:initialStreamReconnectPolicy});
 const firstResult=await first.response.result();
 assert.equal(firstResult.status,'waiting','PUBLIC_FIRST_TURN_NOT_COMPLETE');
 const firstState={...first.session.state};
 assert(firstState.sessionId&&Number.isInteger(firstState.streamIndex)&&firstState.streamIndex>0,'PUBLIC_FIXED_SESSION_REQUIRED');
 assert.equal(firstResult.sessionId,firstState.sessionId,'PUBLIC_RESPONSE_SESSION_CHANGED');
 const firstProof=validatePublicTurn(firstResult.events,firstReply);
 const reattached=new Client(options).sessions.attach(firstState.sessionId,{streamIndex:0});
 const replay=[];
 for await(const event of reattached.stream({follow:false,startIndex:0,signal:timeout(),streamReconnectPolicy:{reconnect:false}}))replay.push(event);
 const replayProof=validatePublicReplay(replay,firstResult.events,firstState.streamIndex);
 assert.equal(reattached.state.sessionId,firstState.sessionId,'PUBLIC_RECONNECT_SESSION_CHANGED');
 assert.equal(reattached.state.streamIndex,firstState.streamIndex,'PUBLIC_RECONNECT_CURSOR_CHANGED');
 const resumed=new Client(options).sessions.attach(firstState.sessionId,{streamIndex:firstState.streamIndex});
 const response=await resumed.send('Repeat my runtime packaging marker in one sentence.',
  {signal:timeout(),streamReconnectPolicy:{reconnect:false}});
 assert.equal(response.sessionId,firstState.sessionId,'PUBLIC_FOLLOWUP_SESSION_CHANGED');
 const secondEvents=[];for await(const event of response)secondEvents.push(event);
 const secondProof=validatePublicTurn(secondEvents,`Your runtime packaging marker is ${config.marker}.`);
 assert(secondProof.eventIds.every(id=>!firstProof.eventIds.includes(id)),'PUBLIC_REPLAYED_TURN_AS_NEW');
 const finalState={...resumed.state};
 assert.equal(finalState.sessionId,firstState.sessionId);assert(finalState.streamIndex>firstState.streamIndex,'PUBLIC_CURSOR_DID_NOT_ADVANCE');
 const events=[...firstResult.events,...secondEvents];
 assert.equal((await request('/api/threads/'+threadId,{method:'PUT',body:{title,agentId:primary.id,updatedAt:Date.now(),chat:{session:finalState,events}}})).status,200);
 const savedResponse=await request('/api/threads/'+threadId);assert.equal(savedResponse.status,200);
 const saved=await savedResponse.json();
 assert.deepEqual(saved.chat.session,finalState);assert.deepEqual(saved.chat.events,events);
 const fresh=new Client(options).sessions.attach(finalState.sessionId,{streamIndex:0});
 const finalReplay=[];for await(const event of fresh.stream({follow:false,startIndex:0,signal:timeout(),streamReconnectPolicy:{reconnect:false}}))finalReplay.push(event);
 const finalReplayProof=validatePublicReplay(finalReplay,events,finalState.streamIndex);
 assert.equal(fresh.state.streamIndex,finalState.streamIndex,'PUBLIC_FINAL_REPLAY_CURSOR_CHANGED');
 const finalOwner=await (await request('/api/auth/status')).json();assert.equal(finalOwner.ownerId,config.ownerId);
 const usageResponse=await request('/api/chat-usage');assert.equal(usageResponse.status,200,'PUBLIC_USAGE_READ_FAILED');
 const usage=await usageResponse.json();
 assert.equal(usage.dailyTurnsUsed,2);assert.equal(usage.quotaRemaining,8);
 assert.equal(usage.dailyReservedMicrousd,200000);assert.equal(usage.trialReservedMicrousd,200000);
 assert.deepEqual(usage.measured,{dailyMicrousd:0,trialMicrousd:0,unsettledOperations:0});
 return {format:'myapps.current-public-runtime-observation.v1',status:'PUBLIC_BEHAVIOR_OBSERVED_BINDING_REQUIRED',
  ownerId:config.ownerId,agentId:primary.id,threadId,sessionId:finalState.sessionId,firstState,finalState,initialUsage,usage,health,proxyHealth,
  webOrigin:base,eveOrigin:eve,publicClientOrigin:base,publicClientEntry:clientKey,
  first:firstProof,second:secondProof,replay:replayProof,finalReplay:finalReplayProof,
  authoredMessages:2,authoredClientInvocations:2,dispatchAttempts:'NOT_MEASURED_BIND_MODEL_TRANSPORT_AND_ACCOUNTING',
  scope:'Synthetic public Client/session/message/stream/reconnect and saved thread observations only; exact process/input/output/database/model accounting binding required'};
}
