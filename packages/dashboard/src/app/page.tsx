'use client';

import { useState, useEffect, useCallback } from 'react';
import { getApiKey, getKillSwitchStatus, getAgents, getAuditEvents, type KillSwitchStatus } from '@/lib/api';
import ApiKeySetup from '@/components/ApiKeySetup';

const S = {
  page: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#f1f5f9',
    fontFamily: 'system-ui, -apple-system, sans-serif',
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
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 10 },
  nav: { display: 'flex', gap: 8, alignItems: 'center' },
  navLink: {
    color: '#94a3b8',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid #334155',
  },
  container: { maxWidth: 1200, margin: '0 auto', padding: '32px 24px' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
    marginBottom: 32,
  },
  statCard: (accent: string) => ({
    background: '#1e293b',
    border: `1px solid ${accent}44`,
    borderRadius: 12,
    padding: '20px 24px',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  }),
  statValue: { fontSize: 36, fontWeight: 800, margin: '0 0 4px' },
  statLabel: { color: '#64748b', fontSize: 14 },
  navCard: {
    display: 'block',
    padding: 24,
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 12,
    textDecoration: 'none',
    color: 'inherit',
    transition: 'border-color 0.2s, transform 0.1s',
  },
};

export default function HomePage() {
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState({
    totalEvents: 0,
    totalAgents: 0,
    activeAgents: 0,
    killSwitchActive: false,
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [auditRes, agentsRes, ksRes] = await Promise.allSettled([
        getAuditEvents(1, 0),
        getAgents(),
        getKillSwitchStatus(),
      ]);

      const total = auditRes.status === 'fulfilled' ? auditRes.value.total : 0;
      const agents = agentsRes.status === 'fulfilled' ? agentsRes.value.agents : [];
      const ks = ksRes.status === 'fulfilled' ? ksRes.value : null;

      setStats({
        totalEvents: total,
        totalAgents: agents.length,
        activeAgents: agents.filter((a) => a.active).length,
        killSwitchActive: ks?.tenant?.active ?? ks?.active ?? false,
      });
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useEffect(() => {
    load();
  }, [load]);

  const apiKey = ready ? getApiKey() : null;

  return (
    <div style={S.page}>
      <ApiKeySetup onReady={() => setReady(true)} />

      <header style={S.header}>
        <h1 style={S.title}>
          <span>🛡</span>
          <span>AgentGuard</span>
          <span style={{ color: '#475569', fontWeight: 400, fontSize: 14 }}>Dashboard</span>
        </h1>
        <nav style={S.nav}>
          <a href="/audit" style={S.navLink}>Audit Log</a>
          <a href="/killswitch" style={S.navLink}>Kill Switch</a>
          {apiKey && (
            <button
              onClick={() => { localStorage.removeItem('ag_api_key'); window.location.reload(); }}
              style={{ ...S.navLink, border: '1px solid #334155', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
            >
              Sign out
            </button>
          )}
        </nav>
      </header>

      <div style={S.container}>
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>Overview</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: 15 }}>
            Real-time security posture for your AI agent fleet.
          </p>
        </div>

        {/* Stats */}
        <div style={S.grid}>
          <div style={S.statCard('#6366f1')}>
            <div style={{ ...S.statValue, color: '#818cf8' }}>{loading ? '…' : stats.totalEvents}</div>
            <div style={S.statLabel}>Total Audit Events</div>
          </div>
          <div style={S.statCard('#22c55e')}>
            <div style={{ ...S.statValue, color: '#4ade80' }}>{loading ? '…' : stats.activeAgents}</div>
            <div style={S.statLabel}>Active Agents</div>
          </div>
          <div style={S.statCard('#f59e0b')}>
            <div style={{ ...S.statValue, color: '#fbbf24' }}>{loading ? '…' : stats.totalAgents}</div>
            <div style={S.statLabel}>Total Agents</div>
          </div>
          <div style={S.statCard(stats.killSwitchActive ? '#ef4444' : '#22c55e')}>
            <div style={{ ...S.statValue, color: stats.killSwitchActive ? '#f87171' : '#4ade80', fontSize: 20, paddingTop: 6 }}>
              {loading ? '…' : (stats.killSwitchActive ? '🔴 ACTIVE' : '🟢 Normal')}
            </div>
            <div style={S.statLabel}>Kill Switch</div>
          </div>
        </div>

        {/* Kill switch warning */}
        {stats.killSwitchActive && (
          <div style={{
            background: '#7f1d1d',
            border: '2px solid #ef4444',
            borderRadius: 10,
            padding: '16px 20px',
            marginBottom: 24,
            color: '#fca5a5',
            fontWeight: 600,
          }}>
            ⚠️ KILL SWITCH IS ACTIVE — All agent evaluations are currently BLOCKED.
            <a href="/killswitch" style={{ color: '#fca5a5', marginLeft: 8, textDecoration: 'underline' }}>
              Manage →
            </a>
          </div>
        )}

        {/* Navigation Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <a href="/audit" style={S.navCard}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Audit Log Viewer</h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>
              Browse, filter, and export the tamper-evident audit trail.
              Filter by agent, action type, decision, or date range.
            </p>
          </a>
          <a href="/killswitch" style={S.navCard}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⛔</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Kill Switch Controls</h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>
              View all registered agents, check their status, and instantly
              block an agent or activate the tenant-wide kill switch.
            </p>
          </a>
        </div>

        <div style={{ marginTop: 40, color: '#334155', fontSize: 12, textAlign: 'center' }}>
          AgentGuard Dashboard • {apiKey ? `Key: ${apiKey.slice(0, 12)}…` : 'No key set'}
        </div>
      </div>
    </div>
  );
}
