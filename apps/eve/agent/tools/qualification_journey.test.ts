import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ available: true, run: vi.fn() }));
vi.mock('../../lib/capability-registry.ts', () => ({ checkCapabilityAvailability: () => ({ status: mocks.available ? 'available' : 'disabled' }) }));
vi.mock('../../lib/qualification/root.ts', () => ({
  QualificationRootRefused: class extends Error { constructor(readonly code: string) { super(code); } },
  qualificationRoot: () => ({ run: mocks.run }),
}));
vi.mock('../../lib/qualification/host-bootstrap.ts', () => ({ ensureQualificationHost: () => undefined }));
import definition from './qualification_journey.ts';

const context = (over: Record<string, unknown> = {}, parent?: unknown) => ({ session: { parent, auth: { current: {
  principalId: 'owner', principalType: 'user', attributes: { owner: 'true' }, ...over,
} } } });
const discover = (ctx: ReturnType<typeof context>) => definition.events['step.started']!({}, ctx as never) as Promise<any>;
beforeEach(() => { vi.clearAllMocks(); mocks.available = true; mocks.run.mockResolvedValue({ status: 'HALTED', readiness: 'NOT_CLAIMED', authority: 'NONE' }); });
afterEach(() => vi.unstubAllEnvs());

it('is discoverable only to the authenticated human owner while the host switch is on, and takes no parameters', async () => {
  const tool = await discover(context());
  expect(tool.inputSchema.safeParse({}).success).toBe(true);
  expect(tool.inputSchema.safeParse({ ownerId: 'someone-else' }).success).toBe(false);
  mocks.available = false;
  expect(await discover(context())).toBeNull();
  mocks.available = true;
  for (const ctx of [context({ principalType: 'agent' }), context({ attributes: { owner: 'false' } }), context({ attributes: { owner: 'true', role: 'guest' } }),
    context({ attributes: { owner: 'true', myeveRoleId: 'delegate' } }), context({}, { id: 'parent' })])
    expect(await discover(ctx)).toBeNull();
});

it('executes through the root for the discovered owner only and rechecks availability and principal', async () => {
  const ctx = context(), tool = await discover(ctx);
  expect(await tool.execute({}, ctx)).toMatchObject({ readiness: 'NOT_CLAIMED', authority: 'NONE' });
  expect(mocks.run).toHaveBeenCalledExactlyOnceWith({ ownerId: 'owner', kind: 'human' });
  mocks.run.mockClear(); mocks.available = false;
  await expect(tool.execute({}, ctx)).rejects.toThrow('QDEV_ROOT_PRINCIPAL');
  mocks.available = true; ctx.session.auth.current.principalId = 'different-owner';
  await expect(tool.execute({}, ctx)).rejects.toThrow('QDEV_ROOT_PRINCIPAL');
  expect(mocks.run).not.toHaveBeenCalled();
});
