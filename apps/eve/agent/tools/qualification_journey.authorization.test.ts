import {afterEach, beforeEach, expect, it, vi} from 'vitest';

const calls = vi.hoisted(() => ({run: vi.fn(async () => ({status: 'HALTED', readiness: 'NOT_CLAIMED', authority: 'NONE'}))}));
vi.mock('../../lib/capability-registry.ts', () => ({checkCapabilityAvailability: () => ({status: 'available'})}));
vi.mock('../../lib/qualification/host-bootstrap.ts', () => ({ensureQualificationHost: () => undefined}));
vi.mock('../../lib/qualification/root.ts', () => ({
  QualificationRootRefused: class extends Error {constructor(code: string) {super(code);}},
  qualificationRoot: () => ({run: calls.run}),
}));
vi.mock('../../lib/external-alpha/policy.ts', () => ({externalAlphaInstallation: () => process.env.TEST_QDEV_MIXED_ALPHA === 'true'}));
vi.mock('../../lib/engineering/cloud-access-qualification.ts', () => ({cloudQualificationProject: () => process.env.TEST_QDEV_MIXED_CLOUD === 'true'}));
import definition from './qualification_journey.ts';

const human = (id = 'owner') => ({principalId: id, principalType: 'user', authenticator: 'myeve-web-session', attributes: {owner: 'true'} as Record<string, unknown>});
const context = () => ({session: {auth: {current: human(), initiator: human()}}});
type Context = ReturnType<typeof context>;
const discover = (ctx: Context) => definition.events['step.started']!({}, ctx as never) as Promise<any>;
beforeEach(() => {
  calls.run.mockClear();
  for (const key of ['MYEVE_ALPHA_OWNER_BINDING', 'TEST_QDEV_MIXED_ALPHA', 'TEST_QDEV_MIXED_CLOUD']) vi.stubEnv(key, '');
});
afterEach(() => vi.unstubAllEnvs());

const invalid: [string, (ctx: Context) => void][] = [
  ['foreign current authenticator', ctx => {ctx.session.auth.current.authenticator = 'other';}],
  ['foreign initiator', ctx => {ctx.session.auth.initiator = human('someone-else');}],
  ['missing initiator', ctx => {delete (ctx.session.auth as any).initiator;}],
  ['foreign initiator authenticator', ctx => {ctx.session.auth.initiator.authenticator = 'other';}],
  ['guest initiator', ctx => {ctx.session.auth.initiator.attributes.role = 'guest';}],
  ['delegated initiator', ctx => {ctx.session.auth.initiator.attributes.myeveRoleId = 'role';}],
  ['selected Work context', ctx => {ctx.session.auth.current.attributes.myeveEngineeringWorkId = 'work';}],
  ['retained summary context', ctx => {ctx.session.auth.current.attributes.myeveRetainedSummary = {}; }],
];
for (const [name, mutate] of invalid) it(`direct/replayed journey tool rejects ${name} before root effects`, async () => {
  const tool = await discover(context()), bad = context(); mutate(bad);
  const listed = await discover(bad);
  let denied = false; try {await tool.execute({}, bad);} catch {denied = true;}
  expect({discovered: listed !== null, denied, rootCalls: calls.run.mock.calls.length}).toEqual({discovered: false, denied: true, rootCalls: 0});
});
for (const key of ['MYEVE_ALPHA_OWNER_BINDING', 'TEST_QDEV_MIXED_ALPHA', 'TEST_QDEV_MIXED_CLOUD'])
  it(`rechecks mixed installation ${key} when a discovered tool executes`, async () => {
    const ctx = context(), tool = await discover(ctx); vi.stubEnv(key, 'true');
    expect(await discover(ctx)).toBeNull();
    await expect(tool.execute({}, ctx)).rejects.toThrow('QDEV_ROOT_PRINCIPAL');
    expect(calls.run).not.toHaveBeenCalled();
  });
it('the matched web owner can still discover and execute the direct tool (control)', async () => {
  const ctx = context(), tool = await discover(ctx);
  await tool.execute({}, ctx);
  expect(calls.run).toHaveBeenCalledExactlyOnceWith({ownerId: 'owner', kind: 'human'});
});
