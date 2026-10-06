import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ownerSession } from '../channels/eve.ts';

const mocks = vi.hoisted(() => ({ query: vi.fn(), principal: vi.fn(), execution: vi.fn(), summary:vi.fn() }));
vi.mock('./receipts-db.ts', () => ({ db: () => ({ query: mocks.query }) }));
vi.mock('../../lib/web-auth.ts', () => ({ authenticateWebPrincipal: mocks.principal }));
vi.mock('../../lib/engineering/alpha-selected-work.ts', () => ({ selectedEngineeringWorkEnabled: mocks.execution }));
vi.mock('./retained-work-summary.ts',async()=>({...await vi.importActual('./retained-work-summary.ts'),readRetainedWorkSummary:mocks.summary}));
const work = '00000000-0000-4000-8000-000000000001';
const request = (method = 'GET', session = 'existing-session', owner = 'a') => new Request(`https://${owner}.example/eve/v1/session/${session}/stream`, {
  method, headers: { 'x-myeve-thread-id': 'existing-thread', 'x-myeve-engineering-work-id': work, 'x-myeve-engineering-intent': 'continue' },
});
beforeEach(() => {
  vi.stubEnv('MYEVE_PARTNER_OWNER_ID', '');
  mocks.principal.mockReset().mockResolvedValue({ id: 'a' });
  mocks.query.mockReset().mockImplementation(async (sql, [owner, thread, id, session]) =>
    sql.includes('FROM agent_runs') ? (owner === 'existing-session' ? [{ owner_id: 'a', thread_id: 'existing-thread' }] : []) :
    owner === 'a' && thread === 'existing-thread' && id === work && session === 'existing-session'
      ? [{ chat: { session: { sessionId: 'existing-session' }, workSelection: { workId: work }, workContextLocked: true } }] : []);
  mocks.execution.mockReset().mockImplementation(() => { throw Error('EXPIRED_OR_REVOKED'); });
  mocks.summary.mockReset().mockRejectedValue(Error('NO_RETAINED_SUMMARY'));
});
afterEach(() => vi.unstubAllEnvs());

it('replays the retained conversation with revoked execution authority and never evaluates that authority', async () => {
  expect(await ownerSession()(request())).toMatchObject({ principalId: 'a' });
  expect(mocks.execution).not.toHaveBeenCalled();
  const sql = mocks.query.mock.calls.find(([sql]) => sql.includes('SELECT t.chat'))![0];
  expect(sql).toContain("w.scope_id=t.owner_id AND w.scope_kind='personal' AND w.id=$3");
  expect(sql).toContain('t.owner_id=$1 AND t.id=$2');
  expect(sql).toContain('FROM engineering_work_model_calls c');
  expect(sql).toContain('c.scope_id=w.scope_id AND c.scope_kind=w.scope_kind AND c.work_id=w.id');
  expect(sql).toContain('c.actor_id=$1 AND c.session_id=$4');
});
it.each(['b', 'c'])('denies owner %s reading A even if execution is enabled', async owner => {
  mocks.principal.mockResolvedValue({ id: owner }); mocks.execution.mockReturnValue(true);
  await expect(ownerSession()(request('GET', 'existing-session', owner))).rejects.toThrow();
  expect(mocks.execution).not.toHaveBeenCalled();
});
it('denies a different session, thread, Work, and unlocked saved binding', async () => {
  await expect(ownerSession()(request('GET', 'other-session'))).rejects.toThrow();
  const thread = request(); thread.headers.set('x-myeve-thread-id', 'other-thread');
  await expect(ownerSession()(thread)).rejects.toThrow();
  const other = request(); other.headers.set('x-myeve-engineering-work-id', '00000000-0000-4000-8000-000000000002');
  await expect(ownerSession()(other)).rejects.toThrow();
  mocks.query.mockImplementation(async sql => sql.includes('FROM agent_runs') ? [{ owner_id: 'a', thread_id: 'existing-thread' }] : [{ chat: { session: { sessionId: 'existing-session' }, workSelection: { workId: work }, workContextLocked: false } }]);
  await expect(ownerSession()(request())).rejects.toThrow();
});
it('a replay permission cannot send a message, start a session, cancel, reset or compact', async () => {
  for (const path of ['session', 'session/existing-session', 'session/existing-session/cancel', 'session/existing-session/reset', 'session/existing-session/compact']) {
    const original = request('POST');
    await expect(ownerSession()(new Request('https://a.example/eve/v1/' + path, original))).rejects.toThrow();
  }
  expect(mocks.query).not.toHaveBeenCalled();
});
it('denies unauthenticated readers and database outages', async () => {
  mocks.principal.mockResolvedValueOnce(null);
  expect(await ownerSession()(request())).toBeNull();
  expect(mocks.query).not.toHaveBeenCalled();
  mocks.query.mockRejectedValue(Error('unavailable'));
  await expect(ownerSession()(request())).rejects.toThrow();
  expect(mocks.execution).not.toHaveBeenCalled();
});
it('owner-editable chat JSON cannot establish ownership of another durable session', async () => {
  // A forged saved chat without a server-written owner/Work/session ledger
  // association must yield no joined row even when execution is enabled.
  mocks.query.mockImplementation(async sql => sql.includes('FROM agent_runs') ? [{ owner_id: 'b', thread_id: 'other-thread' }] : [{chat:{session:{sessionId:'foreign-durable-session'},workSelection:{workId:work},workContextLocked:true}}]); mocks.execution.mockReturnValue(true);
  await expect(ownerSession()(request('GET', 'foreign-durable-session'))).rejects.toThrow();
  expect(mocks.query.mock.calls[0][1]).toEqual(['foreign-durable-session']);
  expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(mocks.execution).not.toHaveBeenCalled();
});

it('omitting Work and thread headers cannot bypass session ownership', async () => {
  const bare = new Request('https://a.example/eve/v1/session/existing-session/stream');
  expect(await ownerSession()(bare)).toMatchObject({principalId:'a'});
  mocks.principal.mockResolvedValue({id:'b'});
  await expect(ownerSession()(bare)).rejects.toThrow();
  mocks.principal.mockResolvedValue({id:'a'});
  mocks.query.mockResolvedValue([{owner_id:'a',thread_id:'existing-thread'},{owner_id:'b',thread_id:'foreign-thread'}]);
  await expect(ownerSession()(bare)).rejects.toThrow();
  mocks.query.mockResolvedValue([]);
  await expect(ownerSession()(bare)).rejects.toThrow();
  expect(mocks.execution).not.toHaveBeenCalled();
});
it('first-session replay fails retryably before runtime binding, then attaches without a provider call', async () => {
  mocks.query.mockResolvedValue([]);
  let pending: unknown;
  try { await ownerSession()(request()); } catch (error) { pending = error; }
  expect(pending).toBeInstanceOf(Error);
  expect((pending as Error).name).not.toBe('ForbiddenError');
  expect((pending as Error).message).toBe('Session ownership binding is not available yet.');
  expect(mocks.execution).not.toHaveBeenCalled();
  // The server writes agent_runs at turn.started before the model reservation.
  mocks.query.mockImplementation(async sql => sql.includes('FROM agent_runs')
    ? [{owner_id:'a',thread_id:'existing-thread'}] : []);
  mocks.execution.mockReturnValue(true);
  expect(await ownerSession()(request())).toMatchObject({principalId:'a'});
  mocks.principal.mockResolvedValue({id:'b'});
  await expect(ownerSession()(request())).rejects.toMatchObject({name:'ForbiddenError'});
});
it('only explicit observation of an existing verified session can select a zero-provider summary',async()=>{
  const binding={ownerId:'a',threadId:'existing-thread',sessionId:'existing-session',workId:work,resultId:'00000000-0000-4000-8000-000000000003',proofHash:'a'.repeat(64),version:3,generation:3};
  mocks.summary.mockResolvedValue({binding,text:'Retained summary'});
  const observe=new Request('https://a.example/eve/v1/session/existing-session',{method:'POST',headers:request().headers,body:JSON.stringify({message:'Please summarize the retained result.'})});observe.headers.set('x-myeve-engineering-intent','observe');
  const principal=await ownerSession()(observe);
  expect(principal).toMatchObject({attributes:{myeveRetainedSummary:JSON.stringify(binding)}});
  expect((principal as any).attributes.myeveEngineeringWorkId).toBeUndefined();
  expect(mocks.summary).toHaveBeenCalledWith({ownerId:'a',threadId:'existing-thread',sessionId:'existing-session',workId:work});
  mocks.summary.mockClear();
  for(const path of ['session','session/existing-session/cancel','session/existing-session/reset'])await expect(ownerSession()(new Request('https://a.example/eve/v1/'+path,observe))).rejects.toThrow();
  const productive=new Request(observe);productive.headers.set('x-myeve-engineering-intent','continue');await expect(ownerSession()(productive)).rejects.toThrow();
  expect(mocks.summary).not.toHaveBeenCalled();
});

it.each(['inputResponses','callback','activityObserver','taskDeliveryPolicy','turnPolicy','outputSchema','continuationToken'])('summary exception rejects alternate framework field %s before issuing the marker',async field=>{
 mocks.summary.mockResolvedValue({binding:{},text:'not allowed'});
 const headers=request().headers;headers.set('x-myeve-engineering-intent','observe');
 const r=new Request('https://a.example/eve/v1/session/existing-session',{method:'POST',headers,body:JSON.stringify({message:'Summary', [field]:{value:'untrusted'}})});
 await expect(ownerSession()(r)).rejects.toThrow();expect(mocks.summary).not.toHaveBeenCalled();
});
