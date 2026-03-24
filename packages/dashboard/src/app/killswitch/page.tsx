'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getAgents,
  deactivateAgent,
  getKillSwitchStatus,
  setKillSwitch,
  type Agent,
  type KillSwitchStatus,
} from '@/lib/api';
import ApiKeySetup from '@/components/ApiKeySetup';

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
  },
  container: { maxWidth: 1200, margin: '0 auto', padding: '24px' },
  card: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  },
  cardTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#f1f5f9' },
  killSwitchBtn: (active: boolean) => ({
    padding: '14px 32px',
    borderRadius: 10,
    border: 'none',
    background: active ? '#ef4444' : '#22c55e',
    color: '#fff',
    fontWeight: 700,
    fontSize: 18,
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: active ? '0 0 24px #ef444488' : '0 0 24px #22c55e44',
    letterSpacing: '0.02em',
  }),
  statusBadge: (active: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 14px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 700,
    background: active ? '#7f1d1d' : '#14532d',
    color: active ? '#fca5a5' : '#86efac',
    border: `1px solid ${active ? '#ef4444' : '#22c55e'}`,
  }),
  dot: (color: string) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color,
    display: 'inline-block',
    flexShrink: 0,
  }),
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th: {
    textAlign: 'left' as const,
    padding: '10px 14px',
    background: '#0f172a',
    color: '#64748b',
    fontWeight: 600,
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: '1px solid #334155',
  },
  td: {
    padding: '12px 14px',
    borderBottom: '1px solid #1e293b',
    verticalAlign: 'middle' as const,
  },
  btnKill: {
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    background: '#7f1d1d',
    color: '#fca5a5',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  btnDisabled: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#475569',
    fontWeight: 500,
    fontSize: 13,
    cursor: 'not-allowed',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  error: {
    padding: 16,
    background: '#7f1d1d',
    border: '1px solid #ef4444',
    borderRadius: 8,
    color: '#fca5a5',
    marginBottom: 16,
    fontSize: 14,
  },
  success: {
    padding: 16,
    background: '#14532d',
    border: '1px solid #22c55e',
    borderRadius: 8,
    color: '#86efac',
    marginBottom: 16,
    fontSize: 14,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 10,
    padding: 20,
    textAlign: 'center' as const,
  },
  statValue: { fontSize: 32, fontWeight: 800, margin: '0 0 4px' },
  statLabel: { color: '#64748b', fontSize: 13 },
};

function agentStatusColor(agent: Agent): string {
  if (!agent.active) return '#ef4444';
  return '#22c55e';
}

function agentStatusLabel(agent: Agent): string {
  if (!agent.active) return 'BLOCKED';
  return 'ACTIVE';
}

export default function KillSwitchPage() {
  const [ready, setReady] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [ksStatus, setKsStatus] = useState<KillSwitchStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmingGlobal, setConfirmingGlobal] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const [agentsData, ksData] = await Promise.all([
        getAgents(),
        getKillSwitchStatus(),
      ]);
      setAgents(agentsData.agents ?? []);
      setKsStatus(ksData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useEffect(() => {
    load();
  }, [load]);

  const handleKillAgent = async (agentId: string) => {
    if (confirming !== agentId) {
      setConfirming(agentId);
      return;
    }
    setConfirming(null);
    try {
      await deactivateAgent(agentId);
      showToast(`✅ Agent ${agentId} has been blocked.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleToggleGlobalKillSwitch = async () => {
    const currentlyActive = ksStatus?.tenant?.active ?? ksStatus?.active ?? false;
    if (!confirmingGlobal && !currentlyActive) {
      setConfirmingGlobal(true);
      return;
    }
    setConfirmingGlobal(false);
    try {
      const result = await setKillSwitch(!currentlyActive);
      setKsStatus(result);
      showToast(
        !currentlyActive
          ? '🔴 Kill switch ACTIVATED — all evaluations blocked!'
          : '✅ Kill switch deactivated — normal operation resumed.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const tenantKsActive = ksStatus?.tenant?.active ?? ksStatus?.active ?? false;
  const globalKsActive = ksStatus?.global?.active ?? false;

  const activeCount = agents.filter((a) => a.active).length;
  const blockedCount = agents.filter((a) => !a.active).length;

  return (
    <div style={S.page}>
      <ApiKeySetup onReady={() => setReady(true)} />

      <header style={S.header}>
        <h1 style={S.title}>🛡 AgentGuard — Kill Switch</h1>
        <nav style={S.nav}>
          <a href="/" style={S.navLink}>Overview</a>
          <a href="/audit" style={S.navLink}>Audit Log</a>
          <a href="/killswitch" style={{ ...S.navLink, background: '#1e293b', color: '#f1f5f9' }}>
            Kill Switch
          </a>
        </nav>
      </header>

      <div style={S.container}>
        {error && <div style={S.error}>⚠️ {error}</div>}
        {toast && <div style={S.success}>{toast}</div>}

        {/* Stats */}
        <div style={S.grid}>
          <div style={S.statCard}>
            <div style={{ ...S.statValue, color: '#f1f5f9' }}>{agents.length}</div>
            <div style={S.statLabel}>Total Agents</div>
          </div>
          <div style={S.statCard}>
            <div style={{ ...S.statValue, color: '#22c55e' }}>{activeCount}</div>
            <div style={S.statLabel}>Active</div>
          </div>
          <div style={S.statCard}>
            <div style={{ ...S.statValue, color: '#ef4444' }}>{blockedCount}</div>
            <div style={S.statLabel}>Blocked</div>
          </div>
          <div style={S.statCard}>
            <div
              style={{
                ...S.statValue,
                color: tenantKsActive ? '#ef4444' : '#22c55e',
                fontSize: 18,
                paddingTop: 6,
              }}
            >
              {tenantKsActive ? '🔴 KILL ACTIVE' : '🟢 NORMAL'}
            </div>
            <div style={S.statLabel}>Tenant Kill Switch</div>
          </div>
        </div>

        {/* Global Kill Switch Card */}
        <div
          style={{
            ...S.card,
            border: tenantKsActive ? '2px solid #ef4444' : '1px solid #334155',
            background: tenantKsActive ? '#1a0a0a' : '#1e293b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h2 style={{ ...S.cardTitle, fontSize: 18, marginBottom: 8 }}>
                ⚡ Tenant Kill Switch
              </h2>
              <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 12px' }}>
                Instantly block ALL evaluations for your tenant. This is irreversible until you turn it off.
              </p>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <span style={S.statusBadge(tenantKsActive)}>
                    <span style={S.dot(tenantKsActive ? '#ef4444' : '#22c55e')} />
                    Tenant: {tenantKsActive ? 'KILL ACTIVE' : 'Normal'}
                  </span>
                </div>
                {ksStatus?.global && (
                  <div>
                    <span style={S.statusBadge(globalKsActive)}>
                      <span style={S.dot(globalKsActive ? '#ef4444' : '#22c55e')} />
                      Global: {globalKsActive ? 'KILL ACTIVE' : 'Normal'}
                    </span>
                  </div>
                )}
                {ksStatus?.tenant?.activatedAt && tenantKsActive && (
                  <span style={{ color: '#94a3b8', fontSize: 12, alignSelf: 'center' }}>
                    Activated: {new Date(ksStatus.tenant.activatedAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              {confirmingGlobal && !tenantKsActive && (
                <div
                  style={{
                    background: '#7f1d1d',
                    border: '1px solid #ef4444',
                    borderRadius: 8,
                    padding: '12px 16px',
                    color: '#fca5a5',
                    fontSize: 13,
                    marginBottom: 8,
                    maxWidth: 300,
                  }}
                >
                  ⚠️ This will BLOCK all agent evaluations immediately. Are you sure?
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      style={{ ...S.btnKill, padding: '6px 20px' }}
                      onClick={handleToggleGlobalKillSwitch}
                    >
                      Confirm KILL
                    </button>
                    <button
                      style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
                      onClick={() => setConfirmingGlobal(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {!confirmingGlobal && (
                <button
                  style={S.killSwitchBtn(tenantKsActive)}
                  onClick={handleToggleGlobalKillSwitch}
                >
                  {tenantKsActive ? '✅ Deactivate Kill Switch' : '⛔ Activate Kill Switch'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Agent List */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ ...S.cardTitle, marginBottom: 0 }}>Registered Agents</h2>
            <button
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid #334155',
                background: 'transparent',
                color: '#94a3b8',
                fontSize: 13,
                cursor: 'pointer',
              }}
              onClick={load}
            >
              ↻ Refresh
            </button>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>
              Loading agents...
            </div>
          )}

          {!loading && agents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>
              No agents registered yet. Create agents via the API.
            </div>
          )}

          {!loading && agents.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Status</th>
                    <th style={S.th}>Name</th>
                    <th style={S.th}>ID</th>
                    <th style={S.th}>Policy Scope</th>
                    <th style={S.th}>Created</th>
                    <th style={S.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent, i) => (
                    <tr key={agent.id} style={{ background: i % 2 === 0 ? '#0f172a' : '#111827' }}>
                      <td style={S.td}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            color: agentStatusColor(agent),
                          }}
                        >
                          <span
                            style={{
                              ...S.dot(agentStatusColor(agent)),
                              boxShadow: `0 0 6px ${agentStatusColor(agent)}`,
                            }}
                          />
                          {agentStatusLabel(agent)}
                        </span>
                      </td>
                      <td style={{ ...S.td, fontWeight: 600 }}>{agent.name}</td>
                      <td
                        style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}
                        title={agent.id}
                      >
                        {agent.id.slice(0, 12)}…
                      </td>
                      <td style={{ ...S.td, fontSize: 12, color: '#94a3b8' }}>
                        {agent.policyScope?.length > 0
                          ? agent.policyScope.join(', ')
                          : <span style={{ color: '#475569' }}>All policies</span>}
                      </td>
                      <td style={{ ...S.td, color: '#64748b', fontSize: 12 }}>
                        {new Date(agent.createdAt).toLocaleDateString()}
                      </td>
                      <td style={S.td}>
                        {!agent.active ? (
                          <span style={S.btnDisabled}>Blocked</span>
                        ) : confirming === agent.id ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              style={S.btnKill}
                              onClick={() => handleKillAgent(agent.id)}
                            >
                              Confirm Kill
                            </button>
                            <button
                              style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: '1px solid #334155',
                                background: 'transparent',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontSize: 12,
                              }}
                              onClick={() => setConfirming(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            style={S.btnKill}
                            onClick={() => handleKillAgent(agent.id)}
                          >
                            ⛔ Kill Agent
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
