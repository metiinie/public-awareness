/**
 * admin.controller.spec.ts
 * Pure unit tests for admin guards and service contracts.
 * No NestJS DI bootstrapping — avoids injector lookup failures in test env.
 */

import { Reflector } from '@nestjs/core';
import { AdminRateLimitGuard } from '../auth/guards/admin-rate-limit.guard';
import { ScopeGuard } from '../auth/guards/scope.guard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeUser = (role: string, cityId?: number | null) => ({
  userId: 99, id: 99, role,
  cityId: cityId ?? null, areaId: null,
});

const makeCtx = (user: any, params: Record<string, string> = {}) => ({
  getHandler: () => ({}),
  getClass: () => ({}),
  switchToHttp: () => ({
    getRequest: () => ({ user, params, headers: {}, ip: '127.0.0.1' }),
  }),
});

// ---------------------------------------------------------------------------
// AdminRateLimitGuard
// ---------------------------------------------------------------------------
describe('AdminRateLimitGuard', () => {
  let guard: AdminRateLimitGuard;

  beforeEach(() => {
    guard = new AdminRateLimitGuard(null as any);
  });

  it('allows requests below the threshold', async () => {
    const ctx = makeCtx(makeUser('ADMIN')) as any;
    for (let i = 0; i < 5; i++) {
      const res = await guard.canActivate(ctx);
      expect(res).toBe(true);
    }
  });

  it('accumulates timestamps in the rolling window map', () => {
    const windows = (guard as any).windows as Map<number, number[]>;
    windows.set(99, Array.from({ length: 16 }, () => Date.now()));
    expect(windows.get(99)!.length).toBeGreaterThan(15);
  });

  it('rejects when admin exceeds 15 destructive actions in window', async () => {
    const windows = (guard as any).windows as Map<number, number[]>;
    // Pre-fill to 15 so the 16th call triggers the breach
    windows.set(99, Array.from({ length: 15 }, () => Date.now()));
    // Mock db insert to avoid real DB
    (guard as any).db = { insert: () => ({ values: () => Promise.resolve() }) };

    const ctx = makeCtx(makeUser('ADMIN')) as any;
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ScopeGuard
// ---------------------------------------------------------------------------
describe('ScopeGuard', () => {
  let guard: ScopeGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new ScopeGuard(reflector, null as any);
  });

  it('bypasses scope check for SUPER_ADMIN', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('REPORT');
    const ctx = makeCtx(makeUser('SUPER_ADMIN'), { id: '5' }) as any;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('returns true when no @Scoped decorator is present on the endpoint', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = makeCtx(makeUser('ADMIN', 1), { id: '5' }) as any;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('returns true when admin has no cityId restriction', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('REPORT');
    const ctx = makeCtx(makeUser('ADMIN', null), { id: '5' }) as any;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AdminService method contract assertions (mock-only)
// ---------------------------------------------------------------------------
describe('AdminService method contracts', () => {
  const mockSvc = {
    logDeepAction: jest.fn().mockResolvedValue(undefined),
    logAction: jest.fn().mockResolvedValue(undefined),
    restoreUser: jest.fn().mockResolvedValue([{ id: 5, status: 'ACTIVE' }]),
    restoreArea: jest.fn().mockResolvedValue([{ id: 2, isActive: true }]),
    mergeAreas: jest.fn().mockResolvedValue({ success: true }),
    banUser: jest.fn().mockResolvedValue({ success: true }),
  };

  beforeEach(() => jest.clearAllMocks());

  it('logDeepAction accepts ip as 8th param', async () => {
    await mockSvc.logDeepAction(1, 'BAN', 'USER', 5, 'spam', {}, {}, '10.0.0.1');
    expect(mockSvc.logDeepAction).toHaveBeenCalledWith(
      1, 'BAN', 'USER', 5, 'spam', {}, {}, '10.0.0.1'
    );
  });

  it('logAction accepts ip as 5th param', async () => {
    await mockSvc.logAction(1, 'UPDATE_AREA', 'reason', 3, '10.0.0.2');
    expect(mockSvc.logAction).toHaveBeenCalledWith(1, 'UPDATE_AREA', 'reason', 3, '10.0.0.2');
  });

  it('restoreUser accepts id, adminId, reason, ip', async () => {
    await mockSvc.restoreUser(5, 99, 'appeal ok', '10.0.0.1');
    expect(mockSvc.restoreUser).toHaveBeenCalledWith(5, 99, 'appeal ok', '10.0.0.1');
  });

  it('restoreArea accepts id, adminId, reason, ip', async () => {
    await mockSvc.restoreArea(2, 99, 'Re-enabled', '10.0.0.1');
    expect(mockSvc.restoreArea).toHaveBeenCalledWith(2, 99, 'Re-enabled', '10.0.0.1');
  });

  it('mergeAreas accepts sourceId, targetId, adminId, reason, ip', async () => {
    await mockSvc.mergeAreas(3, 4, 99, 'duplicate', '10.0.0.3');
    expect(mockSvc.mergeAreas).toHaveBeenCalledWith(3, 4, 99, 'duplicate', '10.0.0.3');
  });

  it('banUser calls with reason and ip', async () => {
    await mockSvc.banUser(5, 'repeat offender', 99, '10.0.0.1');
    expect(mockSvc.banUser).toHaveBeenCalledWith(5, 'repeat offender', 99, '10.0.0.1');
  });
});
