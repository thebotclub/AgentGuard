/**
 * BaseService — Unit Tests
 *
 * Tests:
 * - withTransaction delegates to db.$transaction with correct options
 * - assertRole passes for allowed roles, throws ForbiddenError for others
 * - tenantScope returns correct { tenantId } object
 * - tenantId / userId getters return values from ctx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseService } from '../base.js';
import { ForbiddenError } from '../../lib/errors.js';
import type { ServiceContext, UserRole } from '@agentguard/shared';

// ─── Concrete test subclass ────────────────────────────────────────────────────

class TestService extends BaseService {
  async runTransaction<T>(fn: Parameters<BaseService['withTransaction']>[0]): Promise<T> {
    return this.withTransaction(fn) as Promise<T>;
  }

  assertRolePublic(...roles: UserRole[]) {
    return this.assertRole(...roles);
  }

  tenantScopePublic() {
    return this.tenantScope();
  }

  get tenantIdPublic() {
    return this.tenantId;
  }

  get userIdPublic() {
    return this.userId;
  }
}

// ─── Mock helpers ──────────────────────────────────────────────────────────────

function makeCtx(role: UserRole = 'admin'): ServiceContext {
  return {
    tenantId: 'tenant-abc',
    userId: 'user-xyz',
    role,
    traceId: 'trace-001',
  };
}

function makeMockDb() {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  } as unknown as import('@prisma/client').PrismaClient;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('BaseService', () => {
  let db: ReturnType<typeof makeMockDb>;
  let ctx: ServiceContext;
  let svc: TestService;

  beforeEach(() => {
    db = makeMockDb();
    ctx = makeCtx('admin');
    svc = new TestService(db, ctx);
  });

  // ── withTransaction ────────────────────────────────────────────────────────

  describe('withTransaction', () => {
    it('calls db.$transaction with ReadCommitted isolation level', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      await svc.runTransaction(fn);

      expect(db.$transaction).toHaveBeenCalledWith(fn, {
        maxWait: 5_000,
        timeout: 10_000,
        isolationLevel: 'ReadCommitted',
      });
    });

    it('returns the value from the callback', async () => {
      const fn = vi.fn().mockResolvedValue(42);
      const result = await svc.runTransaction(fn);
      expect(result).toBe(42);
    });

    it('propagates errors from the callback', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('tx fail'));
      await expect(svc.runTransaction(fn)).rejects.toThrow('tx fail');
    });
  });

  // ── assertRole ─────────────────────────────────────────────────────────────

  describe('assertRole', () => {
    it('does not throw when role is in allowed list', () => {
      expect(() => svc.assertRolePublic('admin', 'owner')).not.toThrow();
    });

    it('throws ForbiddenError when role not in allowed list', () => {
      expect(() => svc.assertRolePublic('owner')).toThrow(ForbiddenError);
    });

    it('includes role name in error message', () => {
      expect(() => svc.assertRolePublic('owner')).toThrow(/admin/);
    });

    it('passes for every recognized role when included', () => {
      for (const role of ['owner', 'admin', 'analyst', 'operator', 'auditor', 'agent'] as UserRole[]) {
        const s = new TestService(db, makeCtx(role));
        expect(() => s.assertRolePublic(role)).not.toThrow();
      }
    });

    it('throws when the allowed list is empty', () => {
      expect(() => svc.assertRolePublic()).toThrow(ForbiddenError);
    });
  });

  // ── tenantScope ────────────────────────────────────────────────────────────

  describe('tenantScope', () => {
    it('returns { tenantId } matching context', () => {
      expect(svc.tenantScopePublic()).toEqual({ tenantId: 'tenant-abc' });
    });
  });

  // ── tenantId / userId getters ──────────────────────────────────────────────

  describe('getters', () => {
    it('tenantId returns context tenantId', () => {
      expect(svc.tenantIdPublic).toBe('tenant-abc');
    });

    it('userId returns context userId', () => {
      expect(svc.userIdPublic).toBe('user-xyz');
    });
  });
});
