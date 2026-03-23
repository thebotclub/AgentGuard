'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getAuditEvent, verifySessionChain } from '../../../lib/api';

// ─── Field display ─────────────────────────────────────────────────────────────

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '4px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '14px',
          color: 'var(--text-bright)',
          fontFamily: mono ? 'monospace' : undefined,
          wordBreak: 'break-all',
        }}
      >
        {value ?? <span style={{ color: 'var(--text-muted)' }} aria-label="Not set">—</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: '8px',
        padding: '20px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        marginBottom: '16px',
      }}
    >
      <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 16px', color: 'var(--text-bright)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function HashChainIndicator({ sessionId }: { sessionId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['chain-verify', sessionId],
    queryFn: () => verifySessionChain(sessionId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div role="status" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
        Verifying hash chain…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ color: '#ef4444', fontSize: '13px' }}>
        ❌ Could not verify chain.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '14px 18px',
        borderRadius: '8px',
        background: data.chainValid ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        border: `1px solid ${data.chainValid ? '#86efac' : '#fca5a5'}`,
      }}
    >
      <div style={{ fontWeight: 600, color: data.chainValid ? '#15803d' : '#b91c1c', fontSize: '14px', marginBottom: '6px' }}>
        {data.chainValid ? '✅ Hash chain intact' : '❌ Chain integrity violation detected'}
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
        <strong>{data.eventCount}</strong> events verified in session{' '}
        <code style={{ background: 'var(--bg-card-alt)', padding: '1px 5px', borderRadius: '3px', fontSize: '11px' }}>
          {sessionId}
        </code>
      </div>
      {data.firstBrokenAt && (
        <div style={{ marginTop: '8px', color: '#f87171', fontSize: '12px' }}>
          First broken at position {data.firstBrokenAt.position} (event:{' '}
          <code>{data.firstBrokenAt.eventId}</code>)
          {data.firstBrokenAt.expected && (
            <>
              <br />Expected: <code>{data.firstBrokenAt.expected.slice(0, 20)}…</code>
              <br />Got: <code>{data.firstBrokenAt.actual?.slice(0, 20)}…</code>
            </>
          )}
        </div>
      )}
      <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px' }}>
        Verified at {new Date(data.verifiedAt).toLocaleString()}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AuditEventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);

  const { data: event, isLoading, isError, error } = useQuery({
    queryKey: ['audit-event', eventId],
    queryFn: () => getAuditEvent(eventId),
  });

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading event"
        style={{ textAlign: 'center', padding: '80px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
      >
        <div className="spinner" style={{ width: 28, height: 28, border: '2px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <span>Loading event…</span>
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div style={{ padding: '24px', background: 'rgba(239,68,68,0.12)', borderRadius: '8px', color: '#f87171' }}>
        ⚠️ Failed to load event: {(error as Error)?.message ?? 'Not found'}
      </div>
    );
  }

  const decisionColors: Record<string, { bg: string; color: string }> = {
    ALLOW: { bg: '#dcfce7', color: '#4ade80' },
    BLOCK: { bg: '#fee2e2', color: '#f87171' },
    MONITOR: { bg: '#dbeafe', color: '#93c5fd' },
    HITL_PENDING: { bg: '#fef3c7', color: '#fbbf24' },
    KILLED: { bg: '#fee2e2', color: '#f87171' },
  };
  const dc = decisionColors[event.policyDecision] ?? { bg: '#f1f5f9', color: 'var(--text-secondary)' };

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
        <Link href="/audit" style={{ color: '#3b82f6', textDecoration: 'none' }}>
          ← Audit Log
        </Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-bright)', fontFamily: 'monospace' }}>
            {event.id}
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
            {new Date(event.occurredAt).toLocaleString()} · {event.processingMs}ms processing
          </p>
        </div>
        <span
          style={{
            background: dc.bg,
            color: dc.color,
            padding: '6px 14px',
            borderRadius: '999px',
            fontSize: '13px',
            fontWeight: 700,
          }}
        >
          {event.policyDecision}
        </span>
      </div>

      {/* Hash Chain Section */}
      <Section title="🔗 Hash Chain Integrity">
        <HashChainIndicator sessionId={event.sessionId} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginTop: '16px',
          }}
        >
          <Field label="Event Hash" value={event.eventHash} mono />
          <Field label="Previous Hash" value={event.previousHash} mono />
        </div>
      </Section>

      {/* Core Details */}
      <Section title="📌 Core Details">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <Field label="Agent ID" value={<code style={{ fontSize: '12px' }}>{event.agentId}</code>} />
          <Field label="Session ID" value={<code style={{ fontSize: '12px' }}>{event.sessionId}</code>} />
          <Field label="Action Type" value={event.actionType} />
          <Field label="Tool Name" value={event.toolName} />
          <Field label="Tool Target" value={event.toolTarget} />
          <Field label="Processing Time" value={`${event.processingMs}ms`} />
        </div>
      </Section>

      {/* Risk & Policy */}
      <Section title="🛡️ Risk & Policy">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <Field label="Risk Score" value={
            <span style={{ fontWeight: 700, fontSize: '18px', color: event.riskScore >= 700 ? '#b91c1c' : event.riskScore >= 400 ? '#92400e' : '#15803d' }}>
              {event.riskScore}
            </span>
          } />
          <Field label="Risk Tier" value={event.riskTier} />
          <Field label="Policy Decision" value={event.policyDecision} />
          <Field label="Policy ID" value={event.policyId} mono />
          <Field label="Policy Version" value={event.policyVersion} />
          <Field label="Matched Rule" value={event.matchedRuleId} mono />
        </div>
        {event.blockReason && (
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              background: 'rgba(239,68,68,0.1)',
              borderRadius: '6px',
              borderLeft: '3px solid #ef4444',
              fontSize: '13px',
              color: '#f87171',
            }}
          >
            <strong>Block reason:</strong> {event.blockReason}
          </div>
        )}
      </Section>

      {/* Data Labels */}
      {(event.inputDataLabels.length > 0 || event.outputDataLabels.length > 0) && (
        <Section title="🏷️ Data Labels">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Input Labels
              </div>
              {event.inputDataLabels.length === 0 ? (
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>None</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {event.inputDataLabels.map((l) => (
                    <span key={l} style={{ background: 'rgba(96,165,250,0.12)', color: '#93c5fd', padding: '3px 8px', borderRadius: '4px', fontSize: '12px' }}>
                      {l}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Output Labels
              </div>
              {event.outputDataLabels.length === 0 ? (
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>None</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {event.outputDataLabels.map((l) => (
                    <span key={l} style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', padding: '3px 8px', borderRadius: '4px', fontSize: '12px' }}>
                      {l}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* Raw JSON */}
      <Section title="🔍 Raw Event Payload">
        <pre
          style={{
            margin: 0,
            fontSize: '12px',
            color: 'var(--text-bright)',
            background: 'var(--bg-page)',
            padding: '16px',
            borderRadius: '6px',
            overflow: 'auto',
            lineHeight: '1.5',
          }}
        >
          {JSON.stringify(event, null, 2)}
        </pre>
      </Section>
    </div>
  );
}
