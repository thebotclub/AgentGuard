'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getAuditEvents,
  downloadAuditExport,
  type AuditEvent,
} from '@/lib/api';
import ApiKeySetup from '@/components/ApiKeySetup';

const PAGE_SIZE = 50;

// ── Styles ─────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#f1f5f9',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '0 0 60px',
  } as React.CSSProperties,
  header: {
    background: '#1e293b',
    borderBottom: '1px solid #334155',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' },
  nav: { display: 'flex', gap: 12, alignItems: 'center' },
  navLink: {
    color: '#94a3b8',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    padding: '6px 12px',
    borderRadius: 6,
    transition: 'background 0.15s',
  },
  container: { maxWidth: 1400, margin: '0 auto', padding: '24px' },
  filters: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 20,
    background: '#1e293b',
    padding: 16,
    borderRadius: 10,
    border: '1px solid #334155',
  },
  input: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#f1f5f9',
    fontSize: 14,
    minWidth: 160,
  } as React.CSSProperties,
  label: { color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' },
  filterGroup: { display: 'flex', flexDirection: 'column' as const },
  btnPrimary: {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    background: '#6366f1',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    fontWeight: 500,
    fontSize: 14,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnDanger: {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    background: '#ef4444',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  } as React.CSSProperties,
  tableWrap: {
    overflowX: 'auto' as const,
    border: '1px solid #334155',
    borderRadius: 10,
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: {
    textAlign: 'left' as const,
    padding: '12px 14px',
    background: '#1e293b',
    color: '#64748b',
    fontWeight: 600,
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: '1px solid #334155',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '10px 14px',
    borderBottom: '1px solid #1e293b',
    verticalAlign: 'top' as const,
    maxWidth: 300,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  trEven: { background: '#0f172a' },
  trOdd: { background: '#111827' },
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    background: color + '22',
    color: color,
    border: `1px solid ${color}44`,
  }),
  pager: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    justifyContent: 'center',
  },
  error: {
    padding: 16,
    background: '#7f1d1d',
    border: '1px solid #ef4444',
    borderRadius: 8,
    color: '#fca5a5',
    marginBottom: 16,
    fontSize: 14,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '60px 0',
    color: '#475569',
  },
};

function resultBadge(result: string) {
  const r = result?.toLowerCase();
  if (r === 'allow' || r === 'allowed') return S.badge('#22c55e');
  if (r === 'block' || r === 'blocked') return S.badge('#ef4444');
  if (r === 'warn') return S.badge('#f59e0b');
  return S.badge('#64748b');
}

export default function AuditPage() {
  const [ready, setReady] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterAgent, setFilterAgent] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditEvents(PAGE_SIZE, page * PAGE_SIZE);
      setTotal(data.total);
      setEvents(data.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ready, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Client-side filter on loaded events
  const filtered = events.filter((e) => {
    if (filterAgent && !e.agent_id?.toLowerCase().includes(filterAgent.toLowerCase())) return false;
    if (filterAction && !e.action?.toLowerCase().includes(filterAction.toLowerCase()) &&
        !e.tool?.toLowerCase().includes(filterAction.toLowerCase())) return false;
    if (filterResult && e.result?.toLowerCase() !== filterResult.toLowerCase()) return false;
    if (filterFrom) {
      const from = new Date(filterFrom);
      if (new Date(e.created_at) < from) return false;
    }
    if (filterTo) {
      const to = new Date(filterTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(e.created_at) > to) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      await downloadAuditExport(
        format,
        filterFrom ? new Date(filterFrom).toISOString() : undefined,
        filterTo ? new Date(filterTo + 'T23:59:59').toISOString() : undefined,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const clearFilters = () => {
    setFilterAgent('');
    setFilterAction('');
    setFilterResult('');
    setFilterFrom('');
    setFilterTo('');
  };

  return (
    <div style={S.page}>
      <ApiKeySetup onReady={() => setReady(true)} />

      <header style={S.header}>
        <h1 style={S.title}>🛡 AgentGuard — Audit Log</h1>
        <nav style={S.nav}>
          <a href="/" style={S.navLink}>Overview</a>
          <a href="/audit" style={{ ...S.navLink, background: '#1e293b', color: '#f1f5f9' }}>
            Audit Log
          </a>
          <a href="/killswitch" style={S.navLink}>Kill Switch</a>
        </nav>
      </header>

      <div style={S.container}>
        {error && <div style={S.error}>⚠️ {error}</div>}

        {/* Filters */}
        <div style={S.filters}>
          <div style={S.filterGroup}>
            <label style={S.label}>Agent ID</label>
            <input
              style={S.input}
              placeholder="Filter by agent..."
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
            />
          </div>
          <div style={S.filterGroup}>
            <label style={S.label}>Action / Tool</label>
            <input
              style={S.input}
              placeholder="Filter by action..."
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            />
          </div>
          <div style={S.filterGroup}>
            <label style={S.label}>Decision</label>
            <select
              style={{ ...S.input, paddingRight: 28 }}
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value)}
            >
              <option value="">All decisions</option>
              <option value="allow">Allow</option>
              <option value="block">Block</option>
              <option value="warn">Warn</option>
            </select>
          </div>
          <div style={S.filterGroup}>
            <label style={S.label}>From Date</label>
            <input
              type="date"
              style={S.input}
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
          </div>
          <div style={S.filterGroup}>
            <label style={S.label}>To Date</label>
            <input
              type="date"
              style={S.input}
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button style={S.btnSecondary} onClick={clearFilters}>
              Clear
            </button>
            <button style={S.btnPrimary} onClick={load}>
              Refresh
            </button>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button style={S.btnSecondary} onClick={() => handleExport('csv')}>
              ⬇ CSV
            </button>
            <button style={S.btnSecondary} onClick={() => handleExport('json')}>
              ⬇ JSON
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ marginBottom: 12, color: '#64748b', fontSize: 13 }}>
          {loading
            ? 'Loading...'
            : `Showing ${filtered.length} of ${total} events (page ${page + 1}/${totalPages})`}
        </div>

        {/* Table */}
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Timestamp</th>
                <th style={S.th}>Agent ID</th>
                <th style={S.th}>Tool / Action</th>
                <th style={S.th}>Decision</th>
                <th style={S.th}>Risk</th>
                <th style={S.th}>Reason</th>
                <th style={S.th}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#64748b', padding: '40px 0' }}>
                    Loading events...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...S.td, ...S.emptyState }}>
                    No events found. Adjust filters or check your API key.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((e, i) => (
                  <tr key={e.id} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                    <td style={{ ...S.td, color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>
                      {e.agent_id ?? <span style={{ color: '#475569' }}>—</span>}
                    </td>
                    <td style={{ ...S.td, fontWeight: 500 }}>
                      {e.tool}
                      {e.action && (
                        <span style={{ color: '#64748b', marginLeft: 6, fontSize: 12 }}>
                          ({e.action})
                        </span>
                      )}
                    </td>
                    <td style={S.td}>
                      <span style={resultBadge(e.result)}>{e.result?.toUpperCase()}</span>
                    </td>
                    <td style={{ ...S.td, textAlign: 'right' as const }}>
                      {e.risk_score != null ? (
                        <span
                          style={{
                            color: e.risk_score > 70 ? '#ef4444' : e.risk_score > 40 ? '#f59e0b' : '#22c55e',
                            fontWeight: 600,
                          }}
                        >
                          {e.risk_score}
                        </span>
                      ) : (
                        <span style={{ color: '#475569' }}>—</span>
                      )}
                    </td>
                    <td
                      style={{ ...S.td, color: '#94a3b8', fontSize: 12, maxWidth: 250 }}
                      title={e.reason ?? ''}
                    >
                      {e.reason ?? <span style={{ color: '#475569' }}>—</span>}
                    </td>
                    <td style={{ ...S.td, color: '#64748b', fontSize: 12, textAlign: 'right' as const }}>
                      {e.duration_ms != null ? `${e.duration_ms}ms` : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={S.pager}>
          <button
            style={{ ...S.btnSecondary, opacity: page === 0 ? 0.4 : 1 }}
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Prev
          </button>
          <span style={{ color: '#64748b', fontSize: 14 }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            style={{ ...S.btnSecondary, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
