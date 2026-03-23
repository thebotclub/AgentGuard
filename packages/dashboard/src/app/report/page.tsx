'use client';

/**
 * Compliance Report — /report
 *
 * Generates a compliance report with OWASP score, policy summary, audit events,
 * and agent health. Uses browser print API (window.print()) for PDF export —
 * no extra npm packages needed, produces professional output.
 *
 * Date range selector to scope the report.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { getComplianceReport, type ComplianceReport, type OWASPControl } from '../../lib/api';
import { LoadingBox, ErrorBox } from '../ui';

// ── Score Gauge ────────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#dc2626';
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Needs Attention' : 'At Risk';

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '120px', height: '120px', borderRadius: '50%',
        border: `8px solid ${color}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 8px',
        background: color + '10',
      }}>
        <div style={{ fontSize: '32px', fontWeight: 800, color }}>{score}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/ 100</div>
      </div>
      <div style={{ fontSize: '13px', fontWeight: 600, color }}>{label}</div>
    </div>
  );
}

// ── OWASP Control Row ─────────────────────────────────────────────────────────

function OWASPRow({ control }: { control: OWASPControl }) {
  const color = control.score >= 80 ? '#16a34a' : control.score >= 60 ? '#f59e0b' : '#dc2626';
  const statusBg: Record<string, string> = {
    CONTROLLED: '#dcfce7', AT_RISK: '#fee2e2', MONITOR: '#fef3c7',
  };
  const statusColor: Record<string, string> = {
    CONTROLLED: '#15803d', AT_RISK: '#dc2626', MONITOR: '#b45309',
  };

  return (
    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <td style={{ padding: '10px 12px', fontSize: '13px' }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-secondary)' }}>{control.id}</span>
      </td>
      <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--text-bright)' }}>{control.name}</td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, height: '6px', background: 'var(--bg-card-alt)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${control.score}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.5s' }} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600, color, minWidth: '32px' }}>{control.score}</span>
        </div>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{
          background: statusBg[control.status] ?? '#f1f5f9',
          color: statusColor[control.status] ?? '#64748b',
          padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
        }}>
          {control.status.replace('_', ' ')}
        </span>
      </td>
    </tr>
  );
}

// ── Report View ────────────────────────────────────────────────────────────────

function ReportView({ report }: { report: ComplianceReport }) {
  const fromStr = format(new Date(report.dateRange.from), 'PPP');
  const toStr = format(new Date(report.dateRange.to), 'PPP');
  const generatedAt = format(new Date(report.generatedAt), 'PPP p');

  return (
    <div id="report-content">
      {/* Print styles */}
      <style>{`
        @media print {
          body { background: #fff !important; }
          #report-controls { display: none !important; }
          #report-content { padding: 0 !important; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
        @page {
          margin: 2cm;
          size: A4;
        }
      `}</style>

      {/* Report Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        color: '#fff', padding: '32px 40px', borderRadius: '12px 12px 0 0',
        marginBottom: '0',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              🛡️ AgentGuard
            </div>
            <h1 style={{ margin: '0 0 6px', fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Compliance Report
            </h1>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>
              Period: {fromStr} — {toStr}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <ScoreGauge score={report.owasp.overallScore} />
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>OWASP LLM Score</div>
          </div>
        </div>
        <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Generated: {generatedAt}
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1px', background: 'var(--border)',
        border: '1px solid var(--border)', borderTop: 'none',
      }}>
        {[
          { label: 'Total Events', value: report.auditSummary.total, color: '#3b82f6' },
          { label: 'Blocked', value: report.auditSummary.blocked, color: '#dc2626' },
          { label: 'Agents', value: report.agentHealth.total, color: '#8b5cf6' },
          { label: 'HITL Reviews', value: report.hitlSummary.total, color: '#f59e0b' },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: '16px 20px', background: 'var(--bg-card)', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* OWASP Controls */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: 'none', padding: '24px' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: 'var(--text-bright)' }}>
          OWASP LLM Top 10 — Control Assessment
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-page)' }}>
              {['Control', 'Description', 'Score', 'Status'].map((h) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.owasp.controls.map((ctrl) => <OWASPRow key={ctrl.id} control={ctrl} />)}
          </tbody>
        </table>
      </div>

      {/* Policy Summary */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: 'none', padding: '24px' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: 'var(--text-bright)' }}>
          Policy Summary
        </h2>
        {report.policies.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No policies configured.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)' }}>
                {['Policy Name', 'Active Version', 'Default Action', 'Last Updated'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.policies.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 500, color: 'var(--text-bright)' }}>{p.name}</td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{p.activeVersion ? `v${p.activeVersion}` : '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', color: p.defaultAction === 'BLOCK' ? '#dc2626' : '#16a34a' }}>{p.defaultAction}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{format(new Date(p.updatedAt), 'PP')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Agent Health */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: 'none', padding: '24px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: 'var(--text-bright)' }}>
          Agent Health Status
        </h2>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          {[
            { label: '🟢 Active', value: report.agentHealth.active },
            { label: '🔴 Killed', value: report.agentHealth.killed },
            { label: '🟡 Quarantined', value: report.agentHealth.quarantined },
          ].map((s) => (
            <div key={s.label} style={{ padding: '10px 16px', background: 'var(--bg-page)', borderRadius: '8px', fontSize: '13px' }}>
              <span style={{ fontWeight: 700 }}>{s.value}</span> {s.label}
            </div>
          ))}
        </div>
        {report.agentHealth.agents.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)' }}>
                {['Agent Name', 'Status', 'Risk Tier', 'Framework', 'Last Seen'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.agentHealth.agents.slice(0, 10).map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '8px 12px', fontSize: '13px', color: 'var(--text-bright)' }}>{a.name}</td>
                  <td style={{ padding: '8px 12px', fontSize: '12px', color: a.status === 'ACTIVE' ? '#16a34a' : '#dc2626' }}>{a.status}</td>
                  <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{a.riskTier}</td>
                  <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{a.framework ?? '—'}</td>
                  <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {a.lastSeenAt ? format(new Date(a.lastSeenAt), 'PP') : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Audit Events */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '24px' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: 'var(--text-bright)' }}>
          Recent Audit Events (last 20)
        </h2>
        {report.auditSummary.recentEvents.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No audit events in this period.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)' }}>
                {['Time', 'Agent', 'Action Type', 'Tool', 'Decision', 'Risk'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.auditSummary.recentEvents.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{format(new Date(e.occurredAt), 'PP p')}</td>
                  <td style={{ padding: '8px 12px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{e.agentId.slice(0, 8)}…</td>
                  <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>{e.actionType}</td>
                  <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>{e.toolName ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                      background: e.decision === 'BLOCK' ? '#fee2e2' : e.decision === 'ALLOW' ? '#dcfce7' : '#fef3c7',
                      color: e.decision === 'BLOCK' ? '#dc2626' : e.decision === 'ALLOW' ? '#16a34a' : '#b45309',
                    }}>{e.decision}</span>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: '12px', color: e.riskTier === 'HIGH' || e.riskTier === 'CRITICAL' ? '#dc2626' : '#64748b' }}>
                    {e.riskScore} ({e.riskTier})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '16px', fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
        AgentGuard — Runtime Security for AI Agents · Confidential · {generatedAt}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const [fromDate, setFromDate] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [generate, setGenerate] = useState(false);

  const { data: report, isLoading, error, refetch } = useQuery({
    queryKey: ['compliance-report', fromDate, toDate],
    queryFn: () => getComplianceReport({ fromDate, toDate }),
    enabled: generate,
  });

  const handleGenerate = useCallback(() => {
    setGenerate(true);
    void refetch();
  }, [refetch]);

  return (
    <div>
      {/* Controls (hidden when printing) */}
      <div id="report-controls">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px', color: 'var(--text-bright)' }}>
              📊 Compliance Report
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
              OWASP LLM compliance score, policy summary, audit events, and agent health.
            </p>
          </div>
        </div>

        {/* Date range selector */}
        <div style={{
          background: 'var(--bg-card)', borderRadius: '10px', padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '24px',
          display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap',
        }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                border: '1px solid var(--border)', borderRadius: '6px',
                padding: '8px 12px', fontSize: '13px', outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{
                border: '1px solid var(--border)', borderRadius: '6px',
                padding: '8px 12px', fontSize: '13px', outline: 'none',
              }}
            />
          </div>

          {/* Quick ranges */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {[
              { label: '7d', days: 7 },
              { label: '30d', days: 30 },
              { label: '90d', days: 90 },
            ].map((r) => (
              <button
                key={r.label}
                onClick={() => {
                  setFromDate(format(subDays(new Date(), r.days), 'yyyy-MM-dd'));
                  setToDate(format(new Date(), 'yyyy-MM-dd'));
                }}
                style={{
                  padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)',
                  background: 'var(--bg-page)', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)',
                }}
              >{r.label}</button>
            ))}
          </div>

          <button
            onClick={handleGenerate}
            disabled={isLoading}
            style={{
              padding: '9px 24px', borderRadius: '8px', border: 'none',
              background: '#3b82f6', color: '#fff', cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 600, opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? '⏳ Generating…' : '📊 Generate Report'}
          </button>

          {report && (
            <button
              onClick={() => window.print()}
              style={{
                padding: '9px 24px', borderRadius: '8px', border: '1px solid var(--border)',
                background: 'var(--bg-card)', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)',
              }}
            >
              🖨️ Export PDF
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <ErrorBox
          message={`Error generating report: ${error instanceof Error ? error.message : 'Unknown error'}`}
          onRetry={handleGenerate}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <LoadingBox message="Generating compliance report…" style={{ padding: '80px 24px' }} />
        </div>
      )}

      {/* Empty / prompt state */}
      {!generate && !report && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: '12px', padding: '60px 24px',
          textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-bright)', fontSize: '18px' }}>Generate Your Compliance Report</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '400px', margin: '0 auto 20px' }}>
            Select a date range above and click "Generate Report" to create your OWASP LLM compliance report.
          </p>
          <button
            onClick={handleGenerate}
            style={{
              padding: '12px 28px', borderRadius: '8px', border: 'none',
              background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '15px', fontWeight: 600,
            }}
          >📊 Generate Report</button>
        </div>
      )}

      {/* Report */}
      {report && !isLoading && (
        <ReportView report={report} />
      )}
    </div>
  );
}
