import { afterEach, beforeEach, expect, it, vi } from 'vitest';
// Actual agent module + actual ingress/bootstrap/root. Providers are fake endpoints; legacy installation modules are call-counting mocks.
const probe = vi.hoisted(() => ({ gateway: 0, legacy: 0, qdev: [] as string[] }));
const legacy = () => { probe.legacy++; throw Error('legacy path must not run in a QDEV installation'); };
vi.mock('eve', () => ({ defineAgent: (value: unknown) => value, defineDynamic: (value: unknown) => value }));
vi.mock('ai', () => ({ gateway: () => ({ doGenerate: async () => { probe.gateway++; return { content: [], usage: {} }; }, doStream: async () => { probe.gateway++; return {}; } }), wrapLanguageModel: (x: any) => x.model }));
vi.mock('../lib/external-alpha/policy.ts', () => ({ externalAlphaInstallation: () => process.env.TEST_ALPHA === 'true' }));
vi.mock('../lib/external-alpha/model.ts', () => ({ externalAlphaModel: legacy }));
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
vi.mock('../lib/relay/owner/model.ts', () => ({ ownerBudgetedModel: legacy, ownerModelStepKey: () => 'turn:0' }));
vi.mock('./lib/session-settings.ts', () => ({ clientTurnSettings: () => { probe.legacy++; return {}; }, rememberedChatSettings: (x: unknown) => x, primaryChatSettings: () => ({ model: 'generic', reasoning: 'default' }),
  resolveSessionAgent: async () => { probe.legacy++; return { id: 'a', ownerId: 'owner', isPrimary: true, status: 'active' }; } }));
const prompt = (text: string) => ({ prompt: [{ role: 'user', content: [{ type: 'text', text }] }] });
const toolContinuation = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'Build it' }] }, { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 't', toolName: 'qualification_journey', input: {} }] },
  { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't', toolName: 'qualification_journey', output: { type: 'json', value: { status: 'HALTED' } } }] }] };
const principal = (id = 'owner', attributes: Record<string, unknown> = {}) => ({ principalId: id, principalType: 'user', authenticator: 'myeve-web-session', attributes: { owner: 'true', ...attributes } });
const context = (p: any = principal(), extra: Record<string, unknown> = {}) => ({ session: { id: 'session-1', auth: { current: p, initiator: p }, ...extra }, messages: [] });
const fakeModel = (stepKey: string) => ({ specificationVersion: 'v4', provider: 'myeve-qdev', modelId: 'scoped', supportedUrls: {},
  doGenerate: async () => { probe.qdev.push('generate:' + stepKey); return { content: [], usage: {} }; }, doStream: async () => { probe.qdev.push('stream:' + stepKey); return {}; } });
const state = { live: true, configured: 'owner' as string | null, owner: 'owner', provider: 'myeve-qdev' };
const source = {
  enabled: () => state.live,
  material: async (id: string) => (state.configured === id ? ({ ownerId: state.owner, conversation: { ownerId: state.owner, contextWindowTokens: 64000,
    model: ({ stepKey }: any) => ({ ...fakeModel(stepKey), provider: state.provider }) } } as any) : null),
};
/** Fresh module graph per scenario: the real agent, ingress, bootstrap and root. `real` registers an assembled host first. */
async function load(real: boolean) {
  vi.resetModules();
  const [{ default: agent }, bootstrap, root] = await Promise.all([import('./agent.ts'), import('../lib/qualification/host-bootstrap.ts'), import('../lib/qualification/root.ts')]);
  if (real) root.registerQualificationHost(bootstrap.assembleQualificationHost(source as never));
  const dispatch = async (ctx: any, options: any = prompt('Build the approved dashboard'), stream = false) => {
    const selected = (agent as any).model.events['step.started']({}, ctx);
    try { await (stream ? selected.model.doStream(options) : selected.model.doGenerate(options)); return 'CALLED'; } catch (e) { return (e as Error).message; }
  };
  return { dispatch, bootstrap, root };
}
beforeEach(() => {
  probe.gateway = 0; probe.legacy = 0; probe.qdev = []; Object.assign(state, { live: true, configured: 'owner', owner: 'owner', provider: 'myeve-qdev' });
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
