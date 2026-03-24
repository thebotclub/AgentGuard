'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAgents,
  killAgent,
  resumeAgent,
  haltAllAgents,
  type Agent,
} from '../../lib/api';
import { Spinner, ErrorBox } from '../ui';

// ─── Status indicator ─────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: '#22c55e',
    KILLED: '#ef4444',
    QUARANTINED: '#f59e0b',
    INACTIVE: '#94a3b8',
  };
  const isActive = status === 'ACTIVE';
  return (
    <span
      title={status}
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: colors[status] ?? '#94a3b8',
        marginRight: 6,
        boxShadow: isActive ? `0 0 0 2px rgba(34,197,94,0.3)` : undefined,
        animation: isActive ? 'pulse 2s infinite' : undefined,
      }}
    />
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  danger?: boolean;
}

function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, isLoading, danger }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      ref={dialogRef}
      tabIndex={-1}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '0 16px',
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: `1px solid ${danger ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
          borderRadius: 12,
          padding: 28,
          maxWidth: 440,
          width: '100%',
          outline: 'none',
        }}
      >
        <h2 id="dialog-title" style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: 'var(--text-bright)' }}>
          {title}
        </h2>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={isLoading}
            style={{
              padding: '9px 20px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              padding: '9px 20px',
              borderRadius: 8,
              border: 'none',
              background: danger ? '#ef4444' : 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {isLoading && <Spinner size={14} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Row ────────────────────────────────────────────────────────────────

function AgentRow({ agent, onKill, onResume }: {
  agent: Agent;
  onKill: (agent: Agent) => void;
  onResume: (agent: Agent) => void;
}) {
  return (
    <tr
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
    >
      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
        <StatusDot status={agent.status} />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{agent.status}</span>
      </td>
      <td style={{ padding: '14px 16px' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-bright)', fontSize: 14 }}>{agent.name}</div>
        {agent.description && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{agent.description}</div>
        )}
      </td>
      <td style={{ padding: '14px 16px' }}>
        <code style={{ fontSize: 11, background: 'var(--bg-code)', padding: '2px 5px', borderRadius: 3, color: 'var(--text-secondary)' }}>
          {agent.id.slice(0, 16)}…
        </code>
      </td>
      <td style={{ padding: '14px 16px' }}>
        <span
          style={{
            background: agent.riskTier === 'CRITICAL' ? 'rgba(239,68,68,0.2)' :
              agent.riskTier === 'HIGH' ? 'rgba(239,68,68,0.15)' :
              agent.riskTier === 'MEDIUM' ? 'rgba(251,191,36,0.15)' :
              'rgba(34,197,94,0.15)',
            color: agent.riskTier === 'CRITICAL' ? '#fca5a5' :
              agent.riskTier === 'HIGH' ? '#f87171' :
              agent.riskTier === 'MEDIUM' ? '#fbbf24' :
              '#4ade80',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {agent.riskTier}
        </span>
      </td>
      <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-muted)' }}>
        {agent.framework ?? '—'}
      </td>
      <td style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {agent.lastSeenAt ? new Date(agent.lastSeenAt).toLocaleString() : '—'}
      </td>
      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
        {agent.status === 'KILLED' || agent.status === 'QUARANTINED' ? (
          <button
            onClick={() => onResume(agent)}
            style={{
              padding: '6px 14px',
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              color: '#4ade80',
              fontWeight: 600,
            }}
          >
            ▶ Resume
          </button>
        ) : (
          <button
            onClick={() => onKill(agent)}
            style={{
              padding: '6px 14px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              color: '#f87171',
              fontWeight: 600,
            }}
          >
            ⛔ Kill
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function KillSwitchPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [killTarget, setKillTarget] = useState<Agent | null>(null);
  const [resumeTarget, setResumeTarget] = useState<Agent | null>(null);
  const [haltAllTarget, setHaltAllTarget] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['agents', statusFilter],
    queryFn: () => listAgents({ status: statusFilter || undefined, limit: 100 }),
  });

  const agents = data?.data ?? [];

  const killMutation = useMutation({
    mutationFn: ({ agentId, tier, reason }: { agentId: string; tier: 'SOFT' | 'HARD'; reason: string }) =>
      killAgent(agentId, tier, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
      setKillTarget(null);
    },
  });

  const resumeMutation = useMutation({
    mutationFn: ({ agentId, reason }: { agentId: string; reason?: string }) =>
      resumeAgent(agentId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
      setResumeTarget(null);
    },
  });

  const haltAllMutation = useMutation({
    mutationFn: ({ tier, reason }: { tier: 'SOFT' | 'HARD'; reason: string }) =>
      haltAllAgents(tier, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
      setHaltAllTarget(false);
    },
  });

  const activeCount = agents.filter(a => a.status === 'ACTIVE').length;
  const killedCount = agents.filter(a => a.status === 'KILLED').length;
  const quarantinedCount = agents.filter(a => a.status === 'QUARANTINED').length;

  return (
    <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-bright)' }}>
            ⛔ Kill Switch Controls
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
            Emergency stop controls — halt individual agents or all agents at once.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => refetch()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => setHaltAllTarget(true)}
            disabled={activeCount === 0}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#ef4444',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: activeCount === 0 ? 'not-allowed' : 'pointer',
              opacity: activeCount === 0 ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            ⛔ Halt All ({activeCount})
          </button>
        </div>
      </div>

      {isError && (
        <ErrorBox message={(error as Error)?.message ?? 'Failed to load agents'} />
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-bright)', marginBottom: 2 }}>{agents.length}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Total Agents</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#4ade80', marginBottom: 2 }}>{activeCount}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Active</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#f87171', marginBottom: 2 }}>{killedCount}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Killed</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#fbbf24', marginBottom: 2 }}>{quarantinedCount}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Quarantined</div>
        </div>
      </div>

      {/* Agent table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Table toolbar */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
            {isLoading ? 'Loading…' : `${agents.length} agent${agents.length !== 1 ? 's' : ''}`}
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
              background: 'var(--bg-input)',
              color: 'var(--text-secondary)',
            }}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="KILLED">Killed</option>
            <option value="QUARANTINED">Quarantined</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Spinner size={24} />
          </div>
        ) : agents.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No agents found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border-subtle)' }}>
                  {['Status', 'Name', 'Agent ID', 'Risk Tier', 'Framework', 'Last Seen', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.map(agent => (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    onKill={(ag) => setKillTarget(ag)}
                    onResume={(ag) => setResumeTarget(ag)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Kill dialog */}
      {killTarget && (
        <ConfirmDialog
          title={`Kill Agent: ${killTarget.name}`}
          message={
            <>
              You are about to halt <strong>{killTarget.name}</strong> (ID: {killTarget.id.slice(0, 16)}…).
              This agent will immediately stop processing requests.
              <br /><br />
              Choose the halt tier:
              <ul style={{ margin: '8px 0', paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 13 }}>
                <li><strong>SOFT</strong> — allows current tasks to finish gracefully</li>
                <li><strong>HARD</strong> — terminates immediately without cleanup</li>
              </ul>
            </>
          }
          confirmLabel="Confirm Kill"
          onConfirm={() => killMutation.mutate({ agentId: killTarget.id, tier: 'SOFT', reason: 'Manual kill from kill switch dashboard' })}
          onCancel={() => setKillTarget(null)}
          isLoading={killMutation.isPending}
          danger
        />
      )}

      {/* Resume dialog */}
      {resumeTarget && (
        <ConfirmDialog
          title={`Resume Agent: ${resumeTarget.name}`}
          message={
            <>
              Resume <strong>{resumeTarget.name}</strong>? It will begin accepting requests again.
            </>
          }
          confirmLabel="Resume Agent"
          onConfirm={() => resumeMutation.mutate({ agentId: resumeTarget.id, reason: 'Manual resume from kill switch dashboard' })}
          onCancel={() => setResumeTarget(null)}
          isLoading={resumeMutation.isPending}
        />
      )}

      {/* Halt all dialog */}
      {haltAllTarget && (
        <ConfirmDialog
          title="⚠️ Halt All Active Agents"
          message={
            <>
              This will immediately halt <strong>{activeCount} active agent{activeCount !== 1 ? 's' : ''}</strong>.
              All active evaluations will be terminated.
              <br /><br />
              This is an emergency stop action. Use with caution.
            </>
          }
          confirmLabel={`Halt All ${activeCount} Agents`}
          onConfirm={() => haltAllMutation.mutate({ tier: 'SOFT', reason: 'Global halt all from kill switch dashboard' })}
          onCancel={() => setHaltAllTarget(false)}
          isLoading={haltAllMutation.isPending}
          danger
        />
      )}
    </div>
  );
}
