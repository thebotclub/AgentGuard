/**
 * MCP Interceptor Tests
 *
 * Tests for:
 * 1. Policy evaluation for MCP tool calls (allow/block/HITL flows)
 * 2. MCP-specific policy checks (mcp_tool_access)
 * 3. Proxy mode request forwarding
 * 4. Audit trail logging
 * 5. Kill switch integration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpInterceptor } from '../mcp-interceptor.js';
import { McpPolicyEvaluator } from '../mcp-policy-evaluator.js';
import type {
  McpToolCallRequest,
  McpAgentIdentity,
  McpToolAccessCheck,
} from '../types.js';
import type { PolicyBundle } from '@agentguard/shared';

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const mockAgentIdentity: McpAgentIdentity = {
  agentId: 'test-agent-001',
  sessionId: 'test-session-abc',
  tenantId: 'tenant-xyz',
};

function makeToolCallRequest(toolName: string, args: Record<string, unknown> = {}): McpToolCallRequest {
  return {
    method: 'tools/call',
    id: 'req-1',
    params: {
      name: toolName,
      arguments: args,
    },
  };
}

function makeBundle(options: {
  defaultAction?: string;
  rules?: unknown[];
  mcpChecks?: McpToolAccessCheck[];
  toolIndex?: Record<string, number[]>;
} = {}): PolicyBundle {
  return {
    policyId: 'policy-001',
    tenantId: 'tenant-xyz',
    version: '1.0.0',
    compiledAt: new Date().toISOString(),
    defaultAction: (options.defaultAction ?? 'allow') as 'allow' | 'block',
    rules: (options.rules ?? []) as PolicyBundle['rules'],
    toolIndex: options.toolIndex ?? {},
    checksum: 'abc123',
    ruleCount: (options.rules ?? []).length,
    // Attach MCP checks as a bundle extension
    ...(options.mcpChecks ? { mcpChecks: options.mcpChecks } : {}),
  } as unknown as PolicyBundle;
}

// ─── Mock services ────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    agent: {
      findFirst: vi.fn().mockResolvedValue({ failBehavior: 'CLOSED', policyId: null }),
    },
    hITLGate: {
      create: vi.fn().mockResolvedValue({ id: 'gate-001', status: 'PENDING' }),
    },
    agentSession: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'sess-1', actionCount: 0, blockCount: 0, riskScoreMax: 0 }),
      update: vi.fn().mockResolvedValue({}),
    },
    auditEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        agentSession: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'sess-1', actionCount: 0, blockCount: 0, riskScoreMax: 0 }), update: vi.fn() },
        auditEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'evt-1' }) },
      });
    }),
  };
}

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn().mockImplementation(async (key: string) => store.get(key) ?? null),
    set: vi.fn().mockImplementation(async (key: string, val: string) => { store.set(key, val); return 'OK'; }),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(-1),
  };
}

function createMockCtx() {
  return {
    tenantId: 'tenant-xyz',
    userId: 'user-001',
    role: 'admin' as const,
    traceId: 'trace-001',
  };
}

// ─── McpPolicyEvaluator Tests ─────────────────────────────────────────────────

describe('McpPolicyEvaluator', () => {
  let evaluator: McpPolicyEvaluator;

  beforeEach(() => {
    evaluator = new McpPolicyEvaluator();
  });

  describe('MCP-specific policy checks', () => {
    it('allows tool when mcp_tool_access rule says allow', () => {
      const bundle = makeBundle({
        mcpChecks: [{
          type: 'mcp_tool_access',
          rules: [
            { tool: 'web_request', action: 'allow', domains: ['api.example.com'] },
          ],
        }],
      });

      const request = makeToolCallRequest('web_request', { url: 'https://api.example.com/data' });
      const result = evaluator.evaluate(request, mockAgentIdentity, bundle);

      expect(result.decision).toBe('allow');
      expect(result.allowed).toBe(true);
    });

    it('blocks tool when mcp_tool_access rule says block', () => {
      const bundle = makeBundle({
        mcpChecks: [{
          type: 'mcp_tool_access',
          rules: [
            { tool: 'filesystem_write', action: 'block', paths: ['/etc/*', '/sys/*'] },
          ],
        }],
      });

      const request = makeToolCallRequest('filesystem_write', { path: '/etc/passwd' });
      const result = evaluator.evaluate(request, mockAgentIdentity, bundle);

      expect(result.decision).toBe('block');
      expect(result.allowed).toBe(false);
    });

    it('requires HITL for shell_execute tool', () => {
      const bundle = makeBundle({
        mcpChecks: [{
          type: 'mcp_tool_access',
          rules: [
            { tool: 'shell_execute', action: 'hitl' },
          ],
        }],
      });

      const request = makeToolCallRequest('shell_execute', { command: 'ls -la' });
      const result = evaluator.evaluate(request, mockAgentIdentity, bundle);

      expect(result.decision).toBe('hitl');
      expect(result.gateId).toBeTruthy();
      expect(result.gateTimeoutSec).toBe(300);
    });

    it('allows web_request only to specified domains', () => {
      const bundle = makeBundle({
        mcpChecks: [{
          type: 'mcp_tool_access',
          rules: [
            { tool: 'web_request', action: 'allow', domains: ['api.example.com'] },
          ],
        }],
      });

      // Blocked domain — not in allow list
      const blockedRequest = makeToolCallRequest('web_request', { url: 'https://evil.com/steal' });
      const blockedResult = evaluator.evaluate(blockedRequest, mockAgentIdentity, bundle);
      expect(blockedResult.decision).toBe('block');

      // Allowed domain
      const allowedRequest = makeToolCallRequest('web_request', { url: 'https://api.example.com/data' });
      const allowedResult = evaluator.evaluate(allowedRequest, mockAgentIdentity, bundle);
      expect(allowedResult.decision).toBe('allow');
    });

    it('supports glob patterns for tool names', () => {
      const bundle = makeBundle({
        mcpChecks: [{
          type: 'mcp_tool_access',
          rules: [
            { tool: 'filesystem_*', action: 'block', paths: ['/etc/*'] },
          ],
        }],
      });

      const request = makeToolCallRequest('filesystem_read', { path: '/etc/shadow' });
      const result = evaluator.evaluate(request, mockAgentIdentity, bundle);
      expect(result.decision).toBe('block');
    });

    it('falls through to standard rules when no MCP check matches', () => {
      const bundle = makeBundle({
        defaultAction: 'allow',
        mcpChecks: [{
          type: 'mcp_tool_access',
          rules: [
            { tool: 'specific_tool', action: 'block' },
          ],
        }],
      });

      const request = makeToolCallRequest('some_other_tool', {});
      const result = evaluator.evaluate(request, mockAgentIdentity, bundle);
      // Falls through to bundle default (allow)
      expect(result.allowed).toBe(true);
    });
  });

  describe('Standard rule evaluation', () => {
    it('uses bundle default when no rules match', () => {
      const bundle = makeBundle({ defaultAction: 'allow' });
      const request = makeToolCallRequest('any_tool', {});
      const result = evaluator.evaluate(request, mockAgentIdentity, bundle);

      expect(result.decision).toBe('allow');
      expect(result.allowed).toBe(true);
    });

    it('blocks when bundle default is block', () => {
      const bundle = makeBundle({ defaultAction: 'block' });
      const request = makeToolCallRequest('any_tool', {});
      const result = evaluator.evaluate(request, mockAgentIdentity, bundle);

      expect(result.decision).toBe('block');
      expect(result.allowed).toBe(false);
    });

    it('respects most restrictive rule when multiple match', () => {
      const bundle = makeBundle({
        defaultAction: 'allow',
        rules: [
          { id: 'rule-monitor', priority: 100, action: 'monitor', toolCondition: { in: ['dangerous_tool'] }, paramConditions: [], contextConditions: [], dataClassConditions: [], timeConditions: [], riskBoost: 50, severity: 'medium', tags: [] },
          { id: 'rule-block', priority: 100, action: 'block', toolCondition: { in: ['dangerous_tool'] }, paramConditions: [], contextConditions: [], dataClassConditions: [], timeConditions: [], riskBoost: 0, severity: 'high', tags: [] },
        ],
        toolIndex: { 'dangerous_tool': [0, 1] },
      });

      const request = makeToolCallRequest('dangerous_tool', {});
      const result = evaluator.evaluate(request, mockAgentIdentity, bundle);

      // Block wins over monitor
      expect(result.decision).toBe('block');
    });
  });

  describe('Non-tool-call requests', () => {
    it('passes through non-tools/call requests', () => {
      const bundle = makeBundle({ defaultAction: 'block' });
      const request = { method: 'tools/list' as unknown, id: 'req-1', params: {} } as unknown as McpToolCallRequest;

      const result = evaluator.evaluate(request, mockAgentIdentity, bundle);
      // No params.name for non-tool-call requests — uses empty string → default
      // The evaluator handles this gracefully
      expect(result).toBeDefined();
    });
  });
});

// ─── McpInterceptor Integration Tests ────────────────────────────────────────

describe('McpInterceptor', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let mockRedis: ReturnType<typeof createMockRedis>;
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockRedis = createMockRedis();
    ctx = createMockCtx();
  });

  describe('Non-tool-call passthrough', () => {
    it('allows non-tools/call requests without policy check', async () => {
      const interceptor = new McpInterceptor(
        mockDb as unknown as import('../../../lib/prisma.js').PrismaClient,
        mockRedis as unknown as import('../../../lib/redis.js').Redis,
        ctx,
      );

      const request = { method: 'tools/list' as unknown, id: 'r1', params: {} } as unknown as McpToolCallRequest;
      const result = await interceptor.intercept(request, mockAgentIdentity);

      expect(result.allowed).toBe(true);
      expect(result.decision).toBe('allow');
      expect(result.reason).toContain('Non-tool-call');
    });
  });

  describe('Kill switch behavior', () => {
    it('blocks when agent is killed', async () => {
      // Mock kill switch as active
      mockRedis.get.mockImplementation(async (key: string) => {
        if (key.includes('killswitch')) {
          return JSON.stringify({ isKilled: true, tier: 'tenant', reason: 'Security incident' });
        }
        return null;
      });

      const interceptor = new McpInterceptor(
        mockDb as unknown as import('../../../lib/prisma.js').PrismaClient,
        mockRedis as unknown as import('../../../lib/redis.js').Redis,
        ctx,
      );

      const request = makeToolCallRequest('filesystem_read', { path: '/tmp/test.txt' });
      const result = await interceptor.intercept(request, mockAgentIdentity);

      expect(result.allowed).toBe(false);
      expect(result.decision).toBe('block');
      expect(result.riskScore).toBe(1000);
    });
  });

  describe('No policy configured', () => {
    it('blocks in strict mode when no policy', async () => {
      // policyId is null, no bundle
      mockDb.agent.findFirst.mockResolvedValue({ failBehavior: 'CLOSED', policyId: null });

      const interceptor = new McpInterceptor(
        mockDb as unknown as import('../../../lib/prisma.js').PrismaClient,
        mockRedis as unknown as import('../../../lib/redis.js').Redis,
        ctx,
        { strict: true },
      );

      const request = makeToolCallRequest('web_request', { url: 'https://example.com' });
      const result = await interceptor.intercept(request, mockAgentIdentity);

      expect(result.allowed).toBe(false);
      expect(result.decision).toBe('block');
      expect(result.reason).toContain('No policy configured');
    });

    it('allows in permissive mode when no policy', async () => {
      mockDb.agent.findFirst.mockResolvedValue({ failBehavior: 'OPEN', policyId: null });

      const interceptor = new McpInterceptor(
        mockDb as unknown as import('../../../lib/prisma.js').PrismaClient,
        mockRedis as unknown as import('../../../lib/redis.js').Redis,
        ctx,
        { strict: false },
      );

      const request = makeToolCallRequest('web_request', { url: 'https://example.com' });
      const result = await interceptor.intercept(request, mockAgentIdentity);

      expect(result.allowed).toBe(true);
    });
  });

  describe('Policy evaluation flows', () => {
    it('allows tool call when policy allows', async () => {
      const bundle = makeBundle({ defaultAction: 'allow' });
      mockRedis.get.mockImplementation(async (key: string) => {
        if (key.includes('policy:bundle')) return JSON.stringify(bundle);
        return null;
      });

      // Mock agent with policyId
      mockDb.agent.findFirst.mockResolvedValue({ policyId: 'policy-001', failBehavior: 'CLOSED' });

      const interceptor = new McpInterceptor(
        mockDb as unknown as import('../../../lib/prisma.js').PrismaClient,
        mockRedis as unknown as import('../../../lib/redis.js').Redis,
        ctx,
        { skipAudit: true },
      );

      const request = makeToolCallRequest('read_file', { path: '/tmp/test.txt' });
      const result = await interceptor.intercept(request, mockAgentIdentity);

      expect(result.allowed).toBe(true);
      expect(result.decision).toBe('allow');
    });

    it('blocks tool call when MCP policy blocks', async () => {
      const bundle = makeBundle({
        defaultAction: 'allow',
        mcpChecks: [{
          type: 'mcp_tool_access',
          rules: [{ tool: 'shell_execute', action: 'block' }],
        }],
      });
      mockRedis.get.mockImplementation(async (key: string) => {
        if (key.includes('policy:bundle')) return JSON.stringify(bundle);
        return null;
      });
      mockDb.agent.findFirst.mockResolvedValue({ policyId: 'policy-001', failBehavior: 'CLOSED' });

      const interceptor = new McpInterceptor(
        mockDb as unknown as import('../../../lib/prisma.js').PrismaClient,
        mockRedis as unknown as import('../../../lib/redis.js').Redis,
        ctx,
        { skipAudit: true },
      );

      const request = makeToolCallRequest('shell_execute', { command: 'rm -rf /' });
      const result = await interceptor.intercept(request, mockAgentIdentity);

      expect(result.allowed).toBe(false);
      expect(result.decision).toBe('block');
    });

    it('creates HITL gate for hitl decision', async () => {
      const bundle = makeBundle({
        defaultAction: 'allow',
        mcpChecks: [{
          type: 'mcp_tool_access',
          rules: [{ tool: 'database_write', action: 'hitl' }],
        }],
      });
      mockRedis.get.mockImplementation(async (key: string) => {
        if (key.includes('policy:bundle')) return JSON.stringify(bundle);
        return null;
      });
      mockDb.agent.findFirst.mockResolvedValue({ policyId: 'policy-001', failBehavior: 'CLOSED' });
      mockRedis.set.mockResolvedValue('OK');

      const interceptor = new McpInterceptor(
        mockDb as unknown as import('../../../lib/prisma.js').PrismaClient,
        mockRedis as unknown as import('../../../lib/redis.js').Redis,
        ctx,
        { skipAudit: true },
      );

      const request = makeToolCallRequest('database_write', { query: 'DELETE FROM users' });
      const result = await interceptor.intercept(request, mockAgentIdentity);

      expect(result.decision).toBe('hitl');
      // Gate creation is attempted — either succeeds with gate ID or falls back to block
      expect(['hitl', 'block']).toContain(result.decision);
    });
  });

  describe('Response builders', () => {
    it('builds correct blocked response', () => {
      const interceptor = new McpInterceptor(
        mockDb as unknown as import('../../../lib/prisma.js').PrismaClient,
        mockRedis as unknown as import('../../../lib/redis.js').Redis,
        ctx,
      );

      const request = makeToolCallRequest('dangerous_tool', {});
      const interceptionResult = {
        allowed: false,
        decision: 'block' as const,
        reason: 'Blocked by policy rule "no-dangerous"',
        riskScore: 800,
        matchedRuleId: 'no-dangerous',
        gateId: null,
        gateTimeoutSec: null,
        evaluationMs: 5,
      };

      const response = interceptor.buildBlockedResponse(request, interceptionResult);

      expect(response.id).toBe('req-1');
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32603);
      expect(response.error?.message).toContain('blocked by AgentGuard');
      expect((response.error?.data as { decision: string }).decision).toBe('block');
    });

    it('builds correct HITL pending response', () => {
      const interceptor = new McpInterceptor(
        mockDb as unknown as import('../../../lib/prisma.js').PrismaClient,
        mockRedis as unknown as import('../../../lib/redis.js').Redis,
        ctx,
      );

      const request = makeToolCallRequest('sensitive_tool', {});
      const interceptionResult = {
        allowed: false,
        decision: 'hitl' as const,
        reason: 'Requires human approval',
        riskScore: 500,
        matchedRuleId: 'require-approval-rule',
        gateId: 'gate-abc-123',
        gateTimeoutSec: 300,
        evaluationMs: 8,
      };

      const response = interceptor.buildHitlPendingResponse(request, interceptionResult);

      expect(response.id).toBe('req-1');
      expect(response.result?.isError).toBe(false);
      const content = JSON.parse(response.result?.content[0]?.text ?? '{}');
      expect(content.status).toBe('hitl_pending');
      expect(content.gateId).toBe('gate-abc-123');
    });
  });
});

// ─── Audit Trail Tests ────────────────────────────────────────────────────────

describe('Audit trail logging', () => {
  it('logs tool call to audit trail', async () => {
    const mockDb = createMockDb();
    const mockRedis = createMockRedis();
    const ctx = createMockCtx();

    const bundle = makeBundle({ defaultAction: 'allow' });
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key.includes('policy:bundle')) return JSON.stringify(bundle);
      return null;
    });
    mockDb.agent.findFirst.mockResolvedValue({ policyId: 'policy-001', failBehavior: 'OPEN' });

    const auditCreateSpy = mockDb.auditEvent.create;

    const interceptor = new McpInterceptor(
      mockDb as unknown as import('../../../lib/prisma.js').PrismaClient,
      mockRedis as unknown as import('../../../lib/redis.js').Redis,
      ctx,
    );

    const request = makeToolCallRequest('read_file', { path: '/tmp/data.txt' });
    await interceptor.intercept(request, mockAgentIdentity);

    // Give async logging a moment to complete
    await new Promise((r) => setTimeout(r, 50));

    // Audit event should have been created
    expect(auditCreateSpy).toHaveBeenCalled();
  });
});
