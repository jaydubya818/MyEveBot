import { emptySessionView, foldEvents } from "eve/events";
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JOURNEY_TOOL, ownerMessageFingerprint, ownerMessageRoute, type QdevTurnRecord } from '../lib/qualification/turn-route.ts';
// Actual agent module + actual ingress/bootstrap/root. Providers are fake endpoints; legacy installation modules are call-counting mocks.
const probe = vi.hoisted(() => ({ gateway: 0, legacy: 0, qdev: [] as string[], admit: vi.fn(), active: vi.fn(), sent: [] as any[], alpha: null as null | ((input: any) => any), recorded: null as any }));
vi.mock('./lib/qdev-turn.ts', () => ({ recordedQdevTurn: () => probe.recorded, qdevChatTurn: () => probe.recorded?.route === 'CHAT', recordQdevTurn: (r: unknown) => { probe.recorded = r; } }));
const legacy = () => { probe.legacy++; throw Error('legacy path must not run in a QDEV installation'); };
vi.mock('eve', () => ({ defineAgent: (value: unknown) => value, defineDynamic: (value: unknown) => value }));
vi.mock('ai', () => ({ gateway: () => ({ specificationVersion: 'v4', provider: 'gateway', modelId: 'generic', doGenerate: async (options: any) => { probe.gateway++; probe.sent.push(options); return { content: [], usage: {} }; }, doStream: async (options: any) => { probe.gateway++; probe.sent.push(options); return {}; } }), wrapLanguageModel: (x: any) => x.model }));
vi.mock('../lib/external-alpha/policy.ts', () => ({ externalAlphaInstallation: () => process.env.TEST_ALPHA === 'true', externalAlphaPolicy: () => ({ ownerId: 'owner' }) }));
vi.mock('../lib/qualification/hosted-profile.ts', async (original) => ({
  ...await original<typeof import('../lib/qualification/hosted-profile.ts')>(),
  hostedTesterProfile: () => process.env.MYEVE_EXTERNAL_ALPHA_HOSTED_BETA === 'true' ? { ownerId: 'owner' } : null,
}));
vi.mock('../lib/external-alpha/allowance.ts', () => ({
  ExternalAlphaAllowance: class {
    admit = probe.admit;
    assertActive = probe.active;
  },
}));
vi.mock('./lib/receipts-db.ts', () => ({ db: () => ({}) }));
vi.mock('../lib/external-alpha/model.ts', () => ({ externalAlphaModel: (input: any) => probe.alpha ? probe.alpha(input) : legacy() }));
vi.mock('../lib/engineering/alpha-selected-work.ts', () => ({ selectedAlphaWork: legacy }));
vi.mock('./lib/retained-work-summary.ts', () => ({ retainedSummaryBinding: legacy, retainedWorkSummaryModel: legacy }));
vi.mock('../lib/engineering/cloud-conversation-model.ts', () => ({ cloudConversationModel: legacy }));
vi.mock('../lib/engineering/cloud-access-qualification.ts', () => ({ cloudQualificationProject: () => false }));
vi.mock('../lib/engineering/deployment-mode.ts', () => ({ hostedFactoryQueue: () => false }));
vi.mock('./lib/partner-model.ts', () => ({ partnerPrivateModel: legacy }));
vi.mock('../lib/private-owner-boundary.ts', () => ({ isPartnerPrincipal: () => { probe.legacy++; return false; } }));
vi.mock('../lib/business-scopes.ts', () => ({ BusinessScopes: class { constructor() { legacy(); } } }));
vi.mock('../lib/engineering/conversation-model.ts', () => ({ engineeringConversationModel: legacy }));
vi.mock('../lib/engineering/store.ts', () => ({ WorkStore: class { constructor() { legacy(); } } }));
vi.mock('../lib/relay/owner/runtime.ts', () => ({ ownerRuntimeFromAuth: () => { probe.legacy++; return null; } }));
vi.mock('../lib/relay/owner/model.ts', () => ({ ownerBudgetedModel: legacy, ownerModelStepKey: (event: { step?: string }) => event.step ?? 'turn:0' }));
vi.mock('./lib/session-settings.ts', () => ({ clientTurnSettings: () => { probe.legacy++; return {}; }, rememberedChatSettings: (x: unknown) => x, primaryChatSettings: () => ({ model: 'generic', reasoning: 'default' }),
  resolveSessionAgent: async () => { probe.legacy++; return { id: 'a', ownerId: 'owner', isPrimary: true, status: 'active' }; } }));
const prompt = (text: string) => ({ prompt: [{ role: 'user', content: [{ type: 'text', text }] }] });
const toolContinuation = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'Build it' }] }, { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 't', toolName: 'qualification_journey', input: {} }] },
  { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't', toolName: 'qualification_journey', output: { type: 'json', value: { status: 'HALTED' } } }] }] };
const principal = (id = 'owner', attributes: Record<string, unknown> = {}) => ({ principalId: id, principalType: 'user', authenticator: 'myeve-web-session', attributes: { owner: 'true', ...attributes } });
const context = (p: any = principal(), extra: Record<string, unknown> = {}) => ({ session: { id: 'session-1', auth: { current: p, initiator: p }, ...extra }, messages: [] });
const fakeModel = (stepKey: string) => ({ specificationVersion: 'v4', provider: 'myeve-qdev', modelId: 'scoped', supportedUrls: {},
  doGenerate: async () => { probe.qdev.push('generate:' + stepKey); return { content: [], usage: {} }; }, doStream: async () => { probe.qdev.push('stream:' + stepKey); return {}; } });
const state = { live: true, configured: 'owner' as string | null, owner: 'owner', provider: 'myeve-qdev', routing: false };
const source = {
  enabled: () => state.live,
  material: async (id: string) => (state.configured === id ? ({ ownerId: state.owner, conversation: { ownerId: state.owner, contextWindowTokens: 64000,
    ...(state.routing ? { route: ownerMessageRoute } : {}),
    model: ({ stepKey }: any) => ({ ...fakeModel(stepKey), provider: state.provider }) } } as any) : null),
};
/** Fresh module graph per scenario: the real agent, ingress, bootstrap and root. `real` registers an assembled host first. */
async function load(real: boolean) {
  vi.resetModules();
  const [{ resolveSofieModel }, bootstrap, root] = await Promise.all([import('./agent.ts'), import('../lib/qualification/host-bootstrap.ts'), import('../lib/qualification/root.ts')]);
  if (real) root.registerQualificationHost(bootstrap.assembleQualificationHost(source as never));
  const dispatch = async (ctx: any, options: any = prompt('Build the approved dashboard'), stream = false, step?: string) => {
    const sequence = Number(step?.split(':').at(-1) ?? 0);
    const view = foldEvents(emptySessionView(), [
      { type: 'session.started', data: { sessionId: ctx.session.id } },
      { type: 'turn.started', scope: { turnId: 'turn' }, data: { turnId: 'turn' } },
      ...Array.from({ length: sequence }, (_, i) => ({ type: 'model.requested', scope: { turnId: 'turn', runId: 'run-' + i }, data: { runId: 'run-' + i, owner: { turnId: 'turn' } } })),
    ].map((event, line) => ({ ...event, meta: { position: { line, index: 0 }, at: "2026-11-22T00:00:00.000Z" } })));
    const selected = resolveSofieModel({ ...ctx, view, turn: { id: 'turn' }, messages: async () => ctx.messages });
    try { await (stream ? selected.model.doStream(options) : selected.model.doGenerate(options)); return 'CALLED'; } catch (e) { return (e as Error).message; }
  };
  return { dispatch, bootstrap, root };
}
beforeEach(() => {
  probe.gateway = 0; probe.legacy = 0; probe.qdev = []; probe.sent = []; probe.alpha = null; probe.recorded = null; Object.assign(state, { live: true, configured: 'owner', owner: 'owner', provider: 'myeve-qdev', routing: false });
  probe.admit.mockReset().mockResolvedValue({ id: 'allowance' });
  probe.active.mockReset().mockResolvedValue(undefined);
  vi.stubEnv('MYEVE_EXTERNAL_ALPHA_HOSTED_BETA', '');
  vi.stubEnv('MYEVE_QDEV_ENABLED', 'true'); vi.stubEnv('MYEVE_ALPHA_OWNER_BINDING', ''); vi.stubEnv('TEST_ALPHA', '');
});
afterEach(() => vi.unstubAllEnvs());
const quiet = () => expect(probe).toMatchObject({ gateway: 0, legacy: 0 });

it('unconfigured QDEV installation: the production bootstrap leaves every transport disabled — zero provider and zero legacy calls', async () => {
  const { dispatch, bootstrap, root } = await load(false);
  expect(await dispatch(context())).toBe('QDEV_INGRESS_UNCONFIGURED');
  expect(await dispatch(context(), prompt('x'), true)).toBe('QDEV_INGRESS_UNCONFIGURED');
  expect(probe.qdev).toEqual([]); quiet();
  bootstrap.ensureQualificationHost();                                       // idempotent; a second real registration is refused
  expect(() => root.registerQualificationHost(bootstrap.assembleQualificationHost(source as never))).toThrow('QDEV_ROOT_ALREADY_REGISTERED');
});
it('flag off: the generic path is unchanged (control)', async () => {
  vi.stubEnv('MYEVE_QDEV_ENABLED', '');
  const { dispatch } = await load(false);
  expect(await dispatch(context())).toBe('CALLED');
  expect(probe.gateway).toBe(1); expect(probe.qdev).toEqual([]);
});
it('configured owner: first request and post-tool continuation reach only the QDEV model, never the Gateway or a legacy path', async () => {
  const { dispatch } = await load(true);
  expect(await dispatch(context())).toBe('CALLED');
  expect(await dispatch(context(), toolContinuation)).toBe('CALLED');
  expect(await dispatch(context(), prompt('summarize'), true)).toBe('CALLED');
  expect(probe.qdev).toEqual(['generate:session-1:turn:0', 'generate:session-1:turn:0', 'stream:session-1:turn:0']);
  quiet();
});
it('Q2 (unenrolled), foreign binding, expired and revoked each get zero provider calls — including the continuation after a tool call', async () => {
  const { dispatch } = await load(true);
  expect(await dispatch(context(principal('q2')))).toBe('QDEV_INGRESS_UNCONFIGURED');
  state.owner = 'someone-else';
  expect(await dispatch(context())).toBe('QDEV_INGRESS_UNCONFIGURED');       // material bound to a different owner
  state.owner = 'owner';
  expect(await dispatch(context())).toBe('CALLED');                          // control: owner works
  const before = probe.qdev.length;
  state.configured = null;                                                   // revoked / expired between the tool call and its continuation
  expect(await dispatch(context(), toolContinuation)).toBe('QDEV_INGRESS_UNCONFIGURED');
  state.configured = 'owner'; state.live = false;                            // host switched off
  expect(await dispatch(context(), toolContinuation, true)).toBe('QDEV_INGRESS_DISABLED');
  expect(probe.qdev.length).toBe(before); quiet();
});
it('delegation, guests, roles, mixed identities, retained-summary/selected-Work attributes and mixed installation modes are refused before any provider', async () => {
  const { dispatch } = await load(true);
  const mismatched = { session: { id: 's', auth: { current: principal(), initiator: principal('other') } }, messages: [] };
  for (const ctx of [context(principal(), { parent: { id: 'p' } }), context(principal('owner', { role: 'guest' })), context(principal('owner', { myeveRoleId: 'r' })),
    context({ ...principal(), principalType: 'agent' }), context({ ...principal(), authenticator: 'other' }), context(principal('owner', { myeveRetainedSummary: {} })),
    context(principal('owner', { myeveEngineeringWorkId: 'w' })), mismatched])
    expect(await dispatch(ctx)).toBe('QDEV_INGRESS_PRINCIPAL');
  vi.stubEnv('MYEVE_ALPHA_OWNER_BINDING', 'binding');
  expect(await dispatch(context())).toBe('QDEV_INGRESS_MIXED_INSTALLATION');
  vi.stubEnv('MYEVE_ALPHA_OWNER_BINDING', ''); vi.stubEnv('TEST_ALPHA', 'true');
  expect(await dispatch(context())).toBe('QDEV_INGRESS_MIXED_INSTALLATION');
  expect(probe.qdev).toEqual([]); quiet();
});
it('a host that returns a non-QDEV model is refused: the generic Gateway can never be selected', async () => {
  state.provider = 'gateway';
  const { dispatch } = await load(true);
  expect(await dispatch(context())).toBe('QDEV_INGRESS_MODEL');
  expect(probe.qdev).toEqual([]); quiet();
});

it('an opted-in hosted tester reaches the QDEV model and preserves chat admission', async () => {
  vi.stubEnv('TEST_ALPHA', 'true');
  vi.stubEnv('EVE_PROJECT_NAME', 'myeve-alpha-tester-1');
  vi.stubEnv('MYEVE_EXTERNAL_ALPHA_HOSTED_BETA', 'true');
  vi.stubEnv('MYEVE_HOSTED_PROFILE', JSON.stringify({ role: 'TESTER', ownerId: 'owner', installationId: 'tester-1' }));
  const { dispatch } = await load(true);
  expect(await dispatch(context())).toBe('CALLED');
  expect(probe.qdev).toEqual(['generate:session-1:turn:0']);
  expect(probe.admit).toHaveBeenCalledWith({ kind: 'CHAT', bindingId: 'session-1:turn', requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(probe.active).toHaveBeenCalledWith('allowance');
  probe.admit.mockRejectedValueOnce(Error('EXTERNAL_ALPHA_SHARED_EXHAUSTED'));
  expect(await dispatch(context())).toBe('EXTERNAL_ALPHA_SHARED_EXHAUSTED');
  expect(await dispatch(context(principal('foreign')))).toBe('QDEV_INGRESS_PRINCIPAL');
  expect(probe.qdev).toHaveLength(1);
  expect(await dispatch(context(), toolContinuation, false, 'turn:1')).toBe('CALLED');
  expect(probe.admit).toHaveBeenCalledTimes(2);
  quiet();
});

// ---- Owner-request installation: plain chat must never reach the plan deriver (production P0, 2026-11-17) ----
const PLAN = '5371fffa714d' + '0'.repeat(52);
const u = (text: string) => ({ role: 'user', content: [{ type: 'text', text }] });
const a = (text: string) => ({ role: 'assistant', content: [{ type: 'text', text }] });
const proposal = a(`Nothing has started.\n\n[plan ${PLAN}]\n\nTo start exactly this plan, reply: confirm ${PLAN.slice(0, 12)}`);
const journeyCall = { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'qdev-1', toolName: JOURNEY_TOOL, input: '{}' }] };
const journeyResult = { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'qdev-1', toolName: JOURNEY_TOOL, output: { type: 'json', value: { status: 'HALTED' } } }] };
const planned = [u('Build me a React dashboard'), proposal];
const built = [...planned, u(`confirm ${PLAN.slice(0, 12)}`), journeyCall, journeyResult, a('The confirmed request stopped at stage 3.')];
const tools = [{ type: 'function', name: JOURNEY_TOOL }, { type: 'function', name: 'memory_search' }];
const turn = (...messages: unknown[]) => ({ prompt: messages, tools });
/** What the message hook records for an owner message (agent/hooks/owner-chat-run.ts). */
const received = (text: string): QdevTurnRecord => (probe.recorded = { route: ownerMessageRoute(text), fingerprint: ownerMessageFingerprint(text), turnId: "turn" });

it.each(['hello - what model is this?', 'hello', 'what model is this?', 'what do you remember about me?', 'remember that I prefer green tea', 'how do I build an app?', 'thanks', 'yes', 'status'])(
  'owner-request installation: %j in a new conversation gets the normal chat model, never the plan deriver', async (text) => {
    state.routing = true;
    const { dispatch } = await load(true);
    received(text);
    expect(await dispatch(context(), turn(u(text)))).toBe('CALLED');
    expect(await dispatch(context(), turn(u(text)), true)).toBe('CALLED');
    expect(probe.qdev).toEqual([]); expect(probe.gateway).toBe(2);
    for (const sent of probe.sent) {                                           // the journey tool is never offered to the chat model
      expect(sent.tools).toEqual([{ type: 'function', name: 'memory_search' }]);
      expect(JSON.stringify(sent.prompt)).not.toContain(JOURNEY_TOOL);
    }
  });
it.each(['hello', 'what model is this?', 'what do you remember about me?', 'why did you make a plan?', 'is it done?', 'go ahead'])(
  'owner-request installation: follow-up %j in a thread that previously had a plan (and a build) gets the chat model, with journey calls removed from its history', async (text) => {
    state.routing = true;
    const { dispatch } = await load(true);
    received(text);
    expect(await dispatch(context(), turn(...planned, u(text)))).toBe('CALLED');
    expect(await dispatch(context(), turn(...built, u(text)), true)).toBe('CALLED');
    expect(probe.qdev).toEqual([]); expect(probe.gateway).toBe(2);
    for (const sent of probe.sent) expect(JSON.stringify([sent.prompt, sent.tools])).not.toContain(JOURNEY_TOOL);
  });
it('owner-request installation: an explicit build request, its confirmation and the journey continuation reach only the QDEV model', async () => {
  state.routing = true;
  const { dispatch } = await load(true);
  received('Build me a React dashboard');
  expect(await dispatch(context(), turn(u('Build me a React dashboard')))).toBe('CALLED');
  received(`confirm ${PLAN.slice(0, 12)}`);
  expect(await dispatch(context(), turn(...planned, u(`confirm ${PLAN.slice(0, 12)}`)))).toBe('CALLED');
  expect(await dispatch(context(), turn(...planned, u(`confirm ${PLAN.slice(0, 12)}`), journeyCall, journeyResult), true)).toBe('CALLED');
  // A journey call awaiting readback is never handed to a paid model, even if a later chat message was recorded meanwhile or a framework note trails it.
  received('hello');
  expect(await dispatch(context(), turn(...planned, u(`confirm ${PLAN.slice(0, 12)}`), journeyCall, journeyResult, u('hello')))).toBe('CALLED');
  expect(await dispatch(context(), turn(u('hello'), journeyCall, journeyResult))).toBe('CALLED');
  expect(probe.qdev).toHaveLength(5); quiet();
});
it('owner-request installation: without a positive CHAT record for the message in the prompt, the turn stays on the free QDEV model', async () => {
  state.routing = true;
  const { dispatch } = await load(true);
  const hello = turn(u('hello - what model is this?'));
  expect(await dispatch(context(), hello)).toBe('CALLED');                      // nothing recorded (the message hook did not run)
  received('some earlier message');
  expect(await dispatch(context(), hello)).toBe('CALLED');                      // stale record for a different message
  probe.recorded = { route: 'CHAT', fingerprint: ownerMessageFingerprint('Build me a React dashboard') };
  expect(await dispatch(context(), turn(u('Build me a React dashboard')))).toBe('CALLED'); // a forged CHAT record cannot move a build request
  expect(probe.qdev).toHaveLength(3); quiet();
});
it('owner-request installation: chat needs the same admission as the journey — unconfigured, revoked, disabled, foreign and delegated requests get zero provider calls', async () => {
  state.routing = true;
  const { dispatch } = await load(true);
  const hello = turn(u('hello - what model is this?'));
  received('hello - what model is this?');
  expect(await dispatch(context(principal('q2')), hello)).toBe('QDEV_INGRESS_UNCONFIGURED');
  expect(await dispatch(context(principal('owner', { role: 'guest' })), hello)).toBe('QDEV_INGRESS_PRINCIPAL');
  expect(await dispatch(context(principal(), { parent: { id: 'p' } }), hello)).toBe('QDEV_INGRESS_PRINCIPAL');
  state.configured = null;
  expect(await dispatch(context(), hello)).toBe('QDEV_INGRESS_UNCONFIGURED');
  state.configured = 'owner'; state.live = false;
  expect(await dispatch(context(), hello, true)).toBe('QDEV_INGRESS_DISABLED');
  state.live = true; vi.stubEnv('MYEVE_ALPHA_OWNER_BINDING', 'binding');
  expect(await dispatch(context(), hello)).toBe('QDEV_INGRESS_MIXED_INSTALLATION');
  expect(probe.qdev).toEqual([]); quiet();
});
it('a frozen installation (no chat routing) keeps every turn on the QDEV model, whatever was recorded', async () => {
  const { dispatch } = await load(true);
  received('hello - what model is this?');
  expect(await dispatch(context(), turn(u('hello - what model is this?')))).toBe('CALLED');
  expect(probe.qdev).toHaveLength(1); quiet();
});
it('a prompt that cannot be read falls back to the QDEV model, not to a paid model', async () => {
  state.routing = true;
  const { dispatch } = await load(true);
  received('hello');
  expect(await dispatch(context(), { tools, prompt: new Proxy([], { get() { throw Error('boom'); } }) })).toBe('CALLED');
  expect(probe.qdev).toHaveLength(1); quiet();
});
it('hosted tester: a chat turn uses only the budgeted external-alpha model (its own admission), a journey turn keeps the QDEV chat admission', async () => {
  vi.stubEnv('TEST_ALPHA', 'true'); vi.stubEnv('EVE_PROJECT_NAME', 'myeve-alpha-tester-1'); vi.stubEnv('MYEVE_EXTERNAL_ALPHA_HOSTED_BETA', 'true');
  vi.stubEnv('MYEVE_HOSTED_PROFILE', JSON.stringify({ role: 'TESTER', ownerId: 'owner', installationId: 'tester-1' }));
  state.routing = true;
  let alpha = 0;
  probe.alpha = () => ({ specificationVersion: 'v4', provider: 'myeve-external-alpha', modelId: 'budgeted', doGenerate: async (options: any) => { alpha++; probe.sent.push(options); return { content: [], usage: {} }; }, doStream: async () => ({}) });
  const { dispatch } = await load(true);
  received('hello - what model is this?');
  expect(await dispatch(context(), turn(u('hello - what model is this?')))).toBe('CALLED');
  expect(alpha).toBe(1); expect(probe.admit).not.toHaveBeenCalled();            // no QDEV-side double admission for chat
  expect(probe.sent[0].tools).toEqual([{ type: 'function', name: 'memory_search' }]);
  received('Build me a React dashboard');
  expect(await dispatch(context(), turn(u('Build me a React dashboard')))).toBe('CALLED');
  expect(probe.admit).toHaveBeenCalledTimes(1); expect(probe.qdev).toHaveLength(1);
  probe.alpha = () => ({ specificationVersion: 'v4', provider: 'gateway', modelId: 'unbudgeted', doGenerate: async () => { alpha++; return {}; }, doStream: async () => ({}) });
  received('hello');
  expect(await dispatch(context(), turn(u('hello')))).toBe('EXTERNAL_ALPHA_PAID_PATH_DENIED:agent-model-selection');
  expect(alpha).toBe(1); expect(probe.gateway).toBe(0);
});

it('qdevMessageRoute: CHAT only for the admitted owner of a chat-serving installation; every refusal records JOURNEY', async () => {
  state.routing = true;
  await load(true);
  const { qdevMessageRoute } = await import('../lib/qualification/ingress.ts');
  const session = (p: any = principal(), extra: Record<string, unknown> = {}) => ({ id: 'session-1', auth: { current: p, initiator: p }, ...extra });
  expect(await qdevMessageRoute(session(), 'hello - what model is this?')).toEqual({ route: 'CHAT', fingerprint: ownerMessageFingerprint('hello - what model is this?') });
  expect((await qdevMessageRoute(session(), 'Build me a React dashboard')).route).toBe('JOURNEY');
  expect((await qdevMessageRoute(session(), `confirm ${PLAN.slice(0, 12)}`)).route).toBe('JOURNEY');
  expect((await qdevMessageRoute(session(), undefined)).route).toBe('CHAT');
  expect((await qdevMessageRoute(session(principal('q2')), 'hello')).route).toBe('JOURNEY');                    // not the configured owner
  expect((await qdevMessageRoute(session(principal('owner', { role: 'guest' })), 'hello')).route).toBe('JOURNEY');
  expect((await qdevMessageRoute(session(principal(), { parent: { id: 'p' } }), 'hello')).route).toBe('JOURNEY');
  state.live = false;
  expect((await qdevMessageRoute(session(), 'hello')).route).toBe('JOURNEY');
  state.live = true; state.routing = false;
  expect((await qdevMessageRoute(session(), 'hello')).route).toBe('JOURNEY');                                    // frozen installation
  quiet();
});
