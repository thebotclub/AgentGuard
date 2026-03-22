'use client';

import Link from 'next/link';

const FEATURE_CARDS = [
  {
    title: '📋 Audit Log',
    description: 'Tamper-evident audit trail with hash chain verification. Filter by agent, action, severity.',
    href: '/audit',
    color: '#3b82f6',
  },
  {
    title: '🤖 Agents',
    description: 'Monitor and manage your AI agents. One-click kill switch with confirmation.',
    href: '/agents',
    color: '#10b981',
  },
  {
    title: '📜 Policies',
    description: 'Define and deploy security policies via YAML DSL. Version history, dry-run testing.',
    href: '/policies',
    color: '#8b5cf6',
  },
  {
    title: '👤 HITL Queue',
    description: 'Review and approve pending human-in-the-loop decisions in real-time.',
    href: '/hitl',
    color: '#f59e0b',
  },
  {
    title: '📊 Compliance Report',
    description: 'Generate OWASP LLM compliance reports with policy summary and audit events. Export to PDF.',
    href: '/report',
    color: '#06b6d4',
  },
  {
    title: '🔔 Alerts',
    description: 'SIEM integrations, webhooks, and anomaly notifications.',
    href: '/alerts',
    color: '#ef4444',
  },
];

export default function DashboardPage() {
  return (
    <div>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 8px', color: '#0f172a' }}>
          AgentGuard Dashboard
        </h1>
        <p style={{ color: '#64748b', margin: 0, fontSize: '16px' }}>
          Runtime security platform for AI agents — monitor, control, and audit in real-time.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
          marginBottom: '40px',
        }}
      >
        {FEATURE_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            style={{
              display: 'block',
              padding: '24px',
              background: '#fff',
              border: `2px solid transparent`,
              borderRadius: '12px',
              textDecoration: 'none',
              color: 'inherit',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              transition: 'all 0.2s',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = card.color;
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 4px 12px rgba(0,0,0,0.1)`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'transparent';
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
            }}
          >
            <h3
              style={{
                margin: '0 0 8px',
                fontSize: '16px',
                fontWeight: 600,
                color: '#0f172a',
              }}
            >
              {card.title}
            </h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px', lineHeight: '1.5' }}>
              {card.description}
            </p>
          </Link>
        ))}
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 12px', color: '#0f172a' }}>
          Getting Started
        </h2>
        <ol style={{ margin: 0, paddingLeft: '20px', color: '#475569', lineHeight: '1.8', fontSize: '14px' }}>
          <li>Set <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>NEXT_PUBLIC_API_URL</code> to your AgentGuard API endpoint</li>
          <li>Set <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>NEXT_PUBLIC_AGENTGUARD_JWT</code> or save your JWT via localStorage <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>ag_token</code></li>
          <li>Navigate to <Link href="/audit" style={{ color: '#3b82f6' }}>Audit Log</Link> to see live events</li>
          <li>Navigate to <Link href="/agents" style={{ color: '#3b82f6' }}>Agents</Link> to manage agent kill switches</li>
          <li>
            <strong>New to AgentGuard?</strong>{' '}
            <Link href="/onboarding" style={{ color: '#8b5cf6', fontWeight: 600 }}>🚀 Run the 5-minute setup wizard</Link>
          </li>
        </ol>
      </div>
    </div>
  );
}
