import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ available: true, observe: vi.fn(), get: vi.fn() }));
vi.mock('../../lib/capability-registry.ts', () => ({ checkCapabilityAvailability: () => ({ status: mocks.available ? 'available' : 'disabled' }) }));
vi.mock('../../lib/engineering/store.ts', () => ({ WorkStore: class {} }));
vi.mock('../../lib/engineering/worker-projection.ts', () => ({ EngineeringWorkerProjectionStore: class { get = mocks.get; } }));
vi.mock('../../lib/engineering/coding-sessions.ts', () => ({ FactoryCodingSessionAdapter: class { observe = mocks.observe; } }));
import definition from './engineering_work.ts';

const workId = '11111111-1111-4111-8111-111111111111';
const context = () => ({ session: { id: 'synthetic-chat', auth: { current: {
  principalId: 'owner', principalType: 'user', attributes: { owner: 'true' },
} } } });
const discover = (ctx: ReturnType<typeof context>) => definition.events['step.started']!({}, ctx as never) as Promise<any>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.available = true;
  vi.stubEnv('MYEVE_ENGINEERING_MODE', 'dogfood'); vi.stubEnv('VERCEL_ENV', 'preview');
  mocks.get.mockResolvedValue({ work: { id: workId } });
  mocks.observe.mockResolvedValue({ observationOnly: true, sessions: [], verification: { status: 'NOT_RUN' } });
});
afterEach(() => vi.unstubAllEnvs());

it('exposes canonical session observation through the existing Sofie read tool', async () => {
  const ctx = context(), tool = await discover(ctx);
  expect(tool.inputSchema.safeParse({ operation: 'sessions', workId }).success).toBe(true);
  expect(tool.inputSchema.safeParse({ operation: 'sessions', workId, expectedVersion: 1 }).success).toBe(false);
  expect(await tool.execute({ operation: 'sessions', workId }, ctx)).toEqual({ observationOnly: true, sessions: [], verification: { status: 'NOT_RUN' } });
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(workId);
  expect(mocks.observe).toHaveBeenCalledExactlyOnceWith(workId, { work: { id: workId } });
});

it('rechecks capability and owner after discovery before reading a session', async () => {
  const ctx = context(), tool = await discover(ctx);
  mocks.available = false;
  await expect(tool.execute({ operation: 'sessions', workId }, ctx)).rejects.toThrow('authority');
  mocks.available = true; ctx.session.auth.current.principalId = 'different-owner';
  await expect(tool.execute({ operation: 'sessions', workId }, ctx)).rejects.toThrow('authority');
  expect(mocks.observe).not.toHaveBeenCalled();
});

it('does not expose the internal read tool in production or to guest/delegated callers', async () => {
  vi.stubEnv('VERCEL_ENV', 'production'); expect(await discover(context())).toBeNull();
  vi.stubEnv('VERCEL_ENV', 'preview');
  for (const attribute of ['role', 'myeveRoleId']) {
    const ctx = context(); Object.assign(ctx.session.auth.current.attributes, { [attribute]: attribute === 'role' ? 'guest' : 'delegate' });
    expect(await discover(ctx)).toBeNull();
  }
});
