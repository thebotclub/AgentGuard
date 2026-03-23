'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAgents,
  killAgent,
  resumeAgent,
  getKillSwitchStatus,
  type Agent,
} from '../../lib/api';
import { TableSkeleton, ErrorBox, EmptyBox } from '../ui';

// ─── Kill switch status indicator ─────────────────────────────────────────────

function AgentStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: '#10b981',
    KILLED: '#ef4444',
    QUARANTINED: '#f59e0b',
    INACTIVE: '#94a3b8',
  };
  return (
    <span
      title={status}
      style={{
        display: 'inline-block',
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: colors[status] ?? '#94a3b8',
        marginRight: '6px',
        boxShadow: status === 'ACTIVE' ? `0 0 0 2px #d1fae5` : undefined,
      }}
    />
  );
}

function RiskTierBadge({ tier }: { tier: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    LOW: { bg: '#dcfce7', color: '#4ade80' },
    MEDIUM: { bg: '#fef3c7', color: '#fbbf24' },
    HIGH: { bg: '#fee2e2', color: '#f87171' },
    CRITICAL: { bg: 'rgba(239,68,68,0.3)', color: '#fca5a5' },
  };
  const c = colors[tier] ?? { bg: '#f1f5f9', color: 'var(--text-secondary)' };
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
      }}
    >
      {tier}
    </span>
  );
}

// ─── Kill Switch Dialog ────────────────────────────────────────────────────────

interface KillDialogProps {
  agent: Agent;
  onConfirm: (tier: 'SOFT' | 'HARD', reason: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

function KillDialog({ agent, onConfirm, onCancel, isLoading }: KillDialogProps) {
  const [tier, setTier] = useState<'SOFT' | 'HARD'>('SOFT');
  const [reason, setReason] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = 'kill-dialog-heading';

  // Focus the dialog on mount; restore focus on unmount
  useEffect(() => {
    const firstBtn = dialogRef.current?.querySelector<HTMLElement>('button, [tabindex="0"]');
    firstBtn?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '28px',
          width: '420px',
          maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={headingId} style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: 'var(--text-bright)' }}>
          🔴 Kill Switch — Confirm
        </h2>
        <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: '14px' }}>
          You are about to halt agent{' '}
          <strong style={{ color: 'var(--text-bright)' }}>{agent.name}</strong>.
          {' '}This will immediately reject all pending and future actions.
        </p>

        {/* Tier selection */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Kill Tier
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['SOFT', 'HARD'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                style={{
                  flex: 1,
                  padding: '10px',
                  border: `2px solid ${tier === t ? (t === 'HARD' ? '#ef4444' : '#f59e0b') : '#e2e8f0'}`,
                  borderRadius: '8px',
                  background: tier === t ? (t === 'HARD' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)') : 'var(--bg-input)',
                  cursor: 'pointer',
                  fontWeight: tier === t ? 600 : 400,
                  color: tier === t ? (t === 'HARD' ? '#b91c1c' : '#92400e') : '#374151',
                  fontSize: '14px',
                  textAlign: 'center',
                }}
              >
                {t === 'SOFT' ? '🟡 SOFT' : '🔴 HARD'}
                <div style={{ fontSize: '11px', fontWeight: 400, marginTop: '3px', color: 'var(--text-muted)' }}>
                  {t === 'SOFT' ? 'Graceful shutdown' : 'Immediate termination'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
            Reason (optional)
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you killing this agent?"
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '13px',
              resize: 'vertical',
              color: 'var(--text-bright)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={isLoading}
            style={{
              padding: '8px 18px',
              background: 'var(--bg-card-alt)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(tier, reason)}
            disabled={isLoading}
            style={{
              padding: '8px 18px',
              background: tier === 'HARD' ? '#ef4444' : '#f59e0b',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              color: '#fff',
              fontWeight: 600,
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? 'Killing…' : `Confirm ${tier} Kill`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Resume Dialog ─────────────────────────────────────────────────────────────

function ResumeDialog({ agent, onConfirm, onCancel, isLoading }: { agent: Agent; onConfirm: (reason: string) => void; onCancel: () => void; isLoading: boolean }) {
  const [reason, setReason] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = 'resume-dialog-heading';

  useEffect(() => {
    const firstBtn = dialogRef.current?.querySelector<HTMLElement>('button, input');
    firstBtn?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '28px',
          width: '380px',
          maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={headingId} style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: 'var(--text-bright)' }}>
          ✅ Resume Agent
        </h2>
        <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: '14px' }}>
          Resume agent <strong style={{ color: 'var(--text-bright)' }}>{agent.name}</strong> — it will start accepting actions again.
        </p>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
            Reason (optional)
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for resuming…"
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--text-bright)',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 18px', background: 'var(--bg-card-alt)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={isLoading}
            style={{ padding: '8px 18px', background: '#10b981', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer', color: '#fff', fontWeight: 600, opacity: isLoading ? 0.7 : 1 }}
          >
            {isLoading ? 'Resuming…' : 'Resume Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Row ────────────────────────────────────────────────────────────────

function AgentRow({ agent }: { agent: Agent }) {
  const [killDialog, setKillDialog] = useState(false);
  const [resumeDialog, setResumeDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: killStatus } = useQuery({
    queryKey: ['kill-status', agent.id],
    queryFn: () => getKillSwitchStatus(agent.id),
    refetchInterval: 30_000,
  });

  const isKilled = killStatus?.isKilled ?? agent.status === 'KILLED';

  const killMutation = useMutation({
    mutationFn: ({ tier, reason }: { tier: 'SOFT' | 'HARD'; reason: string }) =>
      killAgent(agent.id, tier, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
      void queryClient.invalidateQueries({ queryKey: ['kill-status', agent.id] });
      setKillDialog(false);
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (reason: string) => resumeAgent(agent.id, reason || undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
      void queryClient.invalidateQueries({ queryKey: ['kill-status', agent.id] });
      setResumeDialog(false);
    },
  });

  return (
    <>
      <tr
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
      >
        {/* Status indicator */}
        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
          <AgentStatusDot status={agent.status} />
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>{agent.status}</span>
        </td>

        {/* Name */}
        <td style={{ padding: '14px 16px' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-bright)', fontSize: '14px' }}>{agent.name}</div>
          {agent.description && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{agent.description}</div>
          )}
        </td>

        {/* ID */}
        <td style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: '11px', background: 'var(--bg-card-alt)', padding: '2px 5px', borderRadius: '3px', color: 'var(--text-secondary)' }}>
            {agent.id.slice(0, 16)}…
          </code>
        </td>

        {/* Risk tier */}
        <td style={{ padding: '14px 16px' }}>
          <RiskTierBadge tier={agent.riskTier} />
        </td>

        {/* Framework */}
        <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
          {agent.framework ?? '—'}
        </td>

        {/* Last seen */}
        <td style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {agent.lastSeenAt ? new Date(agent.lastSeenAt).toLocaleString() : <span style={{ color: '#94a3b8' }} aria-label="Never seen">—</span>}
        </td>

        {/* Kill switch controls */}
        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
          {isKilled || agent.status === 'KILLED' ? (
            <button
              onClick={() => setResumeDialog(true)}
              aria-label={`Resume agent ${agent.name}`}
              style={{
                padding: '6px 12px',
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                color: '#4ade80',
                fontWeight: 600,
              }}
            >
              ▶ Resume
            </button>
          ) : (
            <button
              onClick={() => setKillDialog(true)}
              aria-label={`Kill agent ${agent.name}`}
              style={{
                padding: '6px 12px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                color: '#f87171',
                fontWeight: 600,
              }}
            >
              🔴 Kill
            </button>
          )}
        </td>
      </tr>

      {/* Kill error */}
      {killMutation.isError && (
        <tr>
          <td colSpan={7} style={{ padding: '8px 16px', background: 'rgba(239,68,68,0.12)', color: '#f87171', fontSize: '13px' }}>
            ⚠️ Kill failed: {(killMutation.error as Error).message}
          </td>
        </tr>
      )}

      {/* Dialogs */}
      {killDialog && (
        <KillDialog
          agent={agent}
          onConfirm={(tier, reason) => killMutation.mutate({ tier, reason })}
          onCancel={() => setKillDialog(false)}
          isLoading={killMutation.isPending}
        />
      )}
      {resumeDialog && (
        <ResumeDialog
          agent={agent}
          onConfirm={(reason) => resumeMutation.mutate(reason)}
          onCancel={() => setResumeDialog(false)}
          isLoading={resumeMutation.isPending}
        />
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [prevCursors, setPrevCursors] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['agents', statusFilter, cursor],
    queryFn: () => listAgents({ status: statusFilter || undefined, limit: 25, cursor }),
  });

  const agents = data?.data ?? [];

  const haltAll = useMutation({
    mutationFn: async () => {
      const { killAgent: killAllFn } = await import('../../lib/api');
      // Since there's no "halt-all" in the API client, loop through agents
      for (const agent of agents.filter(a => a.status === 'ACTIVE')) {
        await killAllFn(agent.id, 'SOFT', 'Global halt from dashboard');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-bright)' }}>
            🤖 Agents
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
            Monitor agent status and manage kill switches.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCursor(undefined); setPrevCursors([]); }}
            style={{
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '13px',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
            }}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="KILLED">Killed</option>
            <option value="QUARANTINED">Quarantined</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <button
            onClick={() => refetch()}
            aria-label="Refresh agents list"
            style={{ padding: '6px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            ↺ Refresh
          </button>
          <button
            onClick={() => {
              if (confirm(`Halt ALL ${agents.filter(a => a.status === 'ACTIVE').length} active agents? This cannot be undone immediately.`)) {
                haltAll.mutate();
              }
            }}
            style={{
              padding: '6px 14px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              color: '#f87171',
              fontWeight: 600,
            }}
          >
            🔴 Halt All
          </button>
        </div>
      </div>

      {/* Error */}
      {isError && (
        <ErrorBox
          message={(error as Error).message}
          onRetry={() => refetch()}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {isLoading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : agents.length === 0 ? (
          <EmptyBox
            icon="🤖"
            title={statusFilter ? 'No agents match this filter' : 'No agents configured yet'}
            description={
              statusFilter
                ? 'Try clearing the status filter to see all agents.'
                : 'Register your first agent via the API or use the onboarding wizard to get started.'
            }
            action={
              statusFilter ? (
                <button
                  onClick={() => setStatusFilter('')}
                  style={{ padding: '8px 20px', background: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
                >
                  Clear filter
                </button>
              ) : undefined
            }
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', borderBottom: '1px solid var(--border-subtle)' }}>
                {['Status', 'Name', 'ID', 'Risk', 'Framework', 'Last Seen', 'Action'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && agents.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {agents.length} agents shown
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={prevCursors.length === 0}
              onClick={() => {
                const prev = [...prevCursors];
                const c = prev.pop();
                setPrevCursors(prev);
                setCursor(c || undefined);
              }}
              style={{ padding: '6px 14px', background: prevCursors.length === 0 ? 'var(--bg-card-alt)' : 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', cursor: prevCursors.length === 0 ? 'not-allowed' : 'pointer', color: prevCursors.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)' }}
            >
              ← Prev
            </button>
            <button
              disabled={!data?.pagination.hasMore}
              onClick={() => {
                setPrevCursors((prev) => [...prev, cursor ?? '']);
                setCursor(data?.pagination.cursor ?? undefined);
              }}
              style={{ padding: '6px 14px', background: !data?.pagination.hasMore ? 'var(--bg-card-alt)' : 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', cursor: !data?.pagination.hasMore ? 'not-allowed' : 'pointer', color: !data?.pagination.hasMore ? 'var(--text-muted)' : 'var(--text-primary)' }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
