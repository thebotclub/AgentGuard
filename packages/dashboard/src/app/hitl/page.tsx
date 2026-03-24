'use client';

/**
 * HITL Approval Queue — /hitl
 *
 * Pending tab: real-time list of gates requiring human approval.
 * History tab: resolved gates with outcomes.
 *
 * Real-time updates via SSE (EventSource → /v1/events).
 * Slack notifications are sent automatically by the API when a gate is created.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import {
  listPendingGates,
  listHistoricalGates,
  approveGate,
  rejectGate,
  type HITLGate,
} from '../../lib/api';
import { TableSkeleton, ErrorBox } from '../ui';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000/v1';

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusBadge(status: HITLGate['status']) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    PENDING:   { bg: '#fef3c7', color: '#b45309', label: '⏳ Pending' },
    APPROVED:  { bg: '#dcfce7', color: '#4ade80', label: '✅ Approved' },
    REJECTED:  { bg: '#fee2e2', color: '#dc2626', label: '❌ Rejected' },
    TIMED_OUT: { bg: '#f1f5f9', color: 'var(--text-muted)', label: '⏰ Timed Out' },
    CANCELLED: { bg: '#f1f5f9', color: 'var(--text-muted)', label: '🚫 Cancelled' },
  };
  const c = cfg[status] ?? cfg['PENDING']!;
  return (
    <span style={{
      background: c.bg,
      color: c.color,
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 600,
    }}>{c.label}</span>
  );
}

function timeUntilTimeout(timeoutAt: string) {
  const ms = new Date(timeoutAt).getTime() - Date.now();
  if (ms <= 0) return <span style={{ color: '#ef4444', fontSize: '12px' }}>Expired</span>;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const color = minutes < 5 ? '#ef4444' : minutes < 15 ? '#f59e0b' : '#64748b';
  return <span style={{ color, fontSize: '12px', fontWeight: 500 }}>{minutes}m {seconds}s</span>;
}

// ── Decision Dialog ────────────────────────────────────────────────────────────

interface DecisionDialogProps {
  gate: HITLGate;
  decision: 'approve' | 'reject';
  onClose: () => void;
  onSubmit: (note: string) => void;
  loading: boolean;
}

function DecisionDialog({ gate, decision, onClose, onSubmit, loading }: DecisionDialogProps) {
  const [note, setNote] = useState('');
  const isApprove = decision === 'approve';
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = 'hitl-dialog-heading';

  useEffect(() => {
    const firstEl = dialogRef.current?.querySelector<HTMLElement>('textarea, button');
    firstEl?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, loading]);

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={() => { if (!loading) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        style={{
          background: 'var(--bg-card)', borderRadius: '12px', padding: '28px',
          width: '480px', maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={headingId} style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: 'var(--text-bright)' }}>
          {isApprove ? '✅ Approve Action' : '❌ Reject Action'}
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
          {isApprove
            ? 'The agent will be allowed to proceed with this action.'
            : 'The agent will be blocked from executing this action.'}
        </p>

        <div style={{ background: 'var(--bg-page)', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Agent:</span><br /><strong>{gate.agentId.slice(0, 8)}…</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Tool:</span><br /><strong>{gate.toolName ?? '—'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Rule:</span><br /><strong>{gate.matchedRuleId}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Timeout:</span><br /><strong>{format(new Date(gate.timeoutAt), 'HH:mm:ss')}</strong></div>
          </div>
          {gate.toolParams && (
            <div style={{ marginTop: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Params:</span>
              <pre style={{ margin: '4px 0 0', fontSize: '11px', background: 'var(--bg-card)', padding: '8px', borderRadius: '4px', overflow: 'auto', maxHeight: '100px' }}>
                {JSON.stringify(gate.toolParams, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
          Reason (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={isApprove ? 'e.g. Reviewed and approved for production use' : 'e.g. Risk too high — requires security review'}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            border: '1px solid var(--border)', borderRadius: '6px',
            padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit',
            resize: 'vertical', outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading}
            aria-label="Cancel and close dialog"
            style={{
              padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)',
              background: 'var(--bg-card)', cursor: 'pointer', fontSize: '13px',
            }}
          >Cancel</button>
          <button
            onClick={() => onSubmit(note)}
            disabled={loading}
            style={{
              padding: '8px 20px', borderRadius: '6px', border: 'none',
              background: isApprove ? '#16a34a' : '#dc2626',
              color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '13px', fontWeight: 600,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Processing…' : isApprove ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Gate Row ───────────────────────────────────────────────────────────────────

interface GateRowProps {
  gate: HITLGate;
  onDecide: (gate: HITLGate, decision: 'approve' | 'reject') => void;
  showActions?: boolean;
}

function GateRow({ gate, onDecide, showActions = true }: GateRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <td style={{ padding: '12px 16px', fontSize: '13px' }}>
          <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
            {gate.agentId.slice(0, 12)}…
          </div>
          <div style={{ color: 'var(--text-bright)', fontWeight: 500, marginTop: '2px' }}>
            {gate.toolName ?? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>unknown tool</span>}
          </div>
        </td>
        <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          {gate.matchedRuleId}
        </td>
        <td style={{ padding: '12px 16px' }}>
          {statusBadge(gate.status)}
        </td>
        <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
          {formatDistanceToNow(new Date(gate.createdAt), { addSuffix: true })}
        </td>
        {showActions && gate.status === 'PENDING' && (
          <td style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {timeUntilTimeout(gate.timeoutAt)}
              <button
                onClick={() => onDecide(gate, 'approve')}
                style={{
                  padding: '4px 12px', borderRadius: '5px', border: 'none',
                  background: '#16a34a', color: '#fff', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600,
                }}
              >✅ Approve</button>
              <button
                onClick={() => onDecide(gate, 'reject')}
                style={{
                  padding: '4px 12px', borderRadius: '5px', border: 'none',
                  background: '#dc2626', color: '#fff', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600,
                }}
              >❌ Reject</button>
            </div>
          </td>
        )}
        {showActions && gate.status !== 'PENDING' && (
          <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
            {gate.decidedAt ? formatDistanceToNow(new Date(gate.decidedAt), { addSuffix: true }) : '—'}
            {gate.decisionNote && (
              <button
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                aria-label={expanded ? 'Hide decision note' : 'Show decision note'}
                style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '11px' }}
              >{expanded ? 'Hide' : 'Note'}</button>
            )}
          </td>
        )}
        {!showActions && (
          <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
            {gate.decidedAt ? formatDistanceToNow(new Date(gate.decidedAt), { addSuffix: true }) : timeUntilTimeout(gate.timeoutAt)}
          </td>
        )}
      </tr>
      {expanded && gate.decisionNote && (
        <tr>
          <td colSpan={5} style={{ padding: '0 16px 12px 32px', fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Note: {gate.decisionNote}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Table Wrapper ─────────────────────────────────────────────────────────────

function GateTable({ gates, onDecide, showActions, emptyMsg }: {
  gates: HITLGate[];
  onDecide: (g: HITLGate, d: 'approve' | 'reject') => void;
  showActions: boolean;
  emptyMsg: string;
}) {
  if (gates.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-card)', borderRadius: '8px', padding: '48px 24px',
        textAlign: 'center', color: 'var(--text-secondary)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
        <p style={{ margin: 0, fontSize: '14px' }}>{emptyMsg}</p>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-page)' }}>
            {['Agent / Tool', 'Matched Rule', 'Status', 'Created', showActions ? 'Action' : 'Resolved'].map((h) => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gates.map((gate) => (
            <GateRow key={gate.id} gate={gate} onDecide={onDecide} showActions={showActions} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HitlPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [historyStatus, setHistoryStatus] = useState('');
  const [dialogState, setDialogState] = useState<{ gate: HITLGate; decision: 'approve' | 'reject' } | null>(null);
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');

  const queryClient = useQueryClient();

  // ── Pending gates query ──────────────────────────────────────────────────────
  const { data: pendingData, isLoading: pendingLoading, error: pendingError } = useQuery({
    queryKey: ['hitl', 'pending'],
    queryFn: () => listPendingGates({ limit: 50 }),
    refetchInterval: 15_000,
  });

  // ── History query ────────────────────────────────────────────────────────────
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['hitl', 'history', historyStatus],
    queryFn: () => listHistoricalGates({ limit: 50, status: historyStatus || undefined }),
    enabled: activeTab === 'history',
  });

  // ── Approve mutation ─────────────────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: ({ gateId, note }: { gateId: string; note: string }) =>
      approveGate(gateId, note || undefined),
    onSuccess: () => {
      setDialogState(null);
      void queryClient.invalidateQueries({ queryKey: ['hitl'] });
    },
  });

  // ── Reject mutation ──────────────────────────────────────────────────────────
  const rejectMutation = useMutation({
    mutationFn: ({ gateId, note }: { gateId: string; note: string }) =>
      rejectGate(gateId, note || undefined),
    onSuccess: () => {
      setDialogState(null);
      void queryClient.invalidateQueries({ queryKey: ['hitl'] });
    },
  });

  const handleDecide = useCallback((gate: HITLGate, decision: 'approve' | 'reject') => {
    setDialogState({ gate, decision });
  }, []);

  const handleDialogSubmit = useCallback((note: string) => {
    if (!dialogState) return;
    if (dialogState.decision === 'approve') {
      approveMutation.mutate({ gateId: dialogState.gate.id, note });
    } else {
      rejectMutation.mutate({ gateId: dialogState.gate.id, note });
    }
  }, [dialogState, approveMutation, rejectMutation]);

  // ── SSE for real-time pending gate updates ───────────────────────────────────
  useEffect(() => {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('ag_token') ?? process.env['NEXT_PUBLIC_AGENTGUARD_JWT'] ?? '')
      : '';
    const url = `${API_URL}/events/stream?token=${encodeURIComponent(token)}`;

    let es: EventSource;
    try {
      es = new EventSource(url);
      es.onopen = () => setSseStatus('connected');
      es.onerror = () => setSseStatus('offline');
      es.addEventListener('hitl_gate_created', () => {
        void queryClient.invalidateQueries({ queryKey: ['hitl', 'pending'] });
      });
      es.addEventListener('hitl_gate_resolved', () => {
        void queryClient.invalidateQueries({ queryKey: ['hitl'] });
      });
    } catch {
      setSseStatus('offline');
    }

    return () => {
      es?.close();
    };
  }, [queryClient]);

  const pendingGates = pendingData?.data ?? [];
  const historyGates = historyData?.data ?? [];
  const isMutating = approveMutation.isPending || rejectMutation.isPending;

  const tabStyle = (tab: string) => ({
    padding: '8px 20px',
    border: 'none',
    background: activeTab === tab ? '#3b82f6' : 'transparent',
    color: activeTab === tab ? '#fff' : '#64748b',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: activeTab === tab ? 600 : 400,
    fontSize: '14px',
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px', color: 'var(--text-bright)' }}>
            👤 HITL Approval Queue
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
            Human-in-the-loop decisions — approve or reject pending agent actions.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', background: 'var(--bg-page)', borderRadius: '6px',
            fontSize: '12px', color: 'var(--text-muted)',
          }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block',
              background: sseStatus === 'connected' ? '#16a34a' : sseStatus === 'connecting' ? '#f59e0b' : '#94a3b8',
            }} />
            {sseStatus === 'connected' ? 'Live' : sseStatus === 'connecting' ? 'Connecting…' : 'Offline'}
          </div>
          <div style={{
            background: pendingGates.length > 0 ? '#fee2e2' : '#f0fdf4',
            color: pendingGates.length > 0 ? '#dc2626' : '#16a34a',
            padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
          }}>
            {pendingGates.length} pending
          </div>
        </div>
      </div>

      {/* Slack notice */}
      <div style={{
        background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)',
        borderRadius: '8px', padding: '12px 16px', marginBottom: '20px',
        fontSize: '13px', color: '#0369a1',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span>🔔</span>
        <span>
          Slack notifications are sent automatically when a gate is created (via AlertWebhook integration).
          Approve/Reject from Slack updates this queue in real-time.
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--bg-card-alt)', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
        <button style={tabStyle('pending')} onClick={() => setActiveTab('pending')}>
          Pending {pendingGates.length > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '11px', marginLeft: '6px' }}>{pendingGates.length}</span>}
        </button>
        <button style={tabStyle('history')} onClick={() => setActiveTab('history')}>
          History
        </button>
      </div>

      {/* Pending Tab */}
      {activeTab === 'pending' && (
        <>
          {pendingLoading && (
            <div style={{ background: 'var(--bg-card)', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <TableSkeleton rows={4} cols={5} />
            </div>
          )}
          {pendingError && (
            <ErrorBox
              message={`Error loading gates: ${pendingError instanceof Error ? pendingError.message : 'Unknown error'}`}
              style={{ marginBottom: 16 }}
            />
          )}
          {!pendingLoading && (
            <GateTable
              gates={pendingGates}
              onDecide={handleDecide}
              showActions
              emptyMsg="No pending approvals — queue is clear ✨"
            />
          )}
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Filter:</label>
            {['', 'APPROVED', 'REJECTED', 'TIMED_OUT'].map((s) => (
              <button
                key={s}
                onClick={() => setHistoryStatus(s)}
                aria-pressed={historyStatus === s}
                style={{
                  padding: '4px 12px', borderRadius: '5px',
                  border: '1px solid var(--border)',
                  background: historyStatus === s ? '#3b82f6' : '#fff',
                  color: historyStatus === s ? '#fff' : '#475569',
                  cursor: 'pointer', fontSize: '12px',
                }}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
          {historyLoading && (
            <div style={{ background: 'var(--bg-card)', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <TableSkeleton rows={5} cols={5} />
            </div>
          )}
          {!historyLoading && (
            <GateTable
              gates={historyGates}
              onDecide={handleDecide}
              showActions={false}
              emptyMsg="No historical records found"
            />
          )}
        </>
      )}

      {/* Decision Dialog */}
      {dialogState && (
        <DecisionDialog
          gate={dialogState.gate}
          decision={dialogState.decision}
          onClose={() => setDialogState(null)}
          onSubmit={handleDialogSubmit}
          loading={isMutating}
        />
      )}
    </div>
  );
}
