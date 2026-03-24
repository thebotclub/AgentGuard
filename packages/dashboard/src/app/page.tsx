'use client';

import Link from 'next/link';

const FEATURE_CARDS = [
  {
    emoji: '📋',
    heading: 'Audit Log',
    description: 'Tamper-evident audit trail with hash chain verification. Filter by agent, action, severity.',
    href: '/audit',
    accentColor: '#6366f1',
  },
  {
    emoji: '🤖',
    heading: 'Agents',
    description: 'Monitor and manage your AI agents. One-click kill switch with confirmation.',
    href: '/agents',
    accentColor: '#10b981',
  },
  {
    emoji: '📜',
    heading: 'Policies',
    description: 'Define and deploy security policies via YAML DSL. Version history, dry-run testing.',
    href: '/policies',
    accentColor: '#8b5cf6',
  },
  {
    emoji: '👤',
    heading: 'HITL Queue',
    description: 'Review and approve pending human-in-the-loop decisions in real-time.',
    href: '/hitl',
    accentColor: '#f59e0b',
  },
  {
    emoji: '📊',
    heading: 'Compliance Report',
    description: 'Generate OWASP LLM compliance reports with policy summary and audit events. Export to PDF.',
    href: '/report',
    accentColor: '#06b6d4',
  },
  {
    emoji: '🔔',
    heading: 'Alerts',
    description: 'SIEM integrations, webhooks, and anomaly notifications.',
    href: '/alerts',
    accentColor: '#ef4444',
  },
];

export default function DashboardPage() {
  return (
    <div>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-bright)' }}>
          AgentGuard Dashboard
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '16px' }}>
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
              background: 'var(--bg-card)',
              border: '2px solid var(--border)',
              borderRadius: '12px',
              textDecoration: 'none',
              color: 'inherit',
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.2s',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = card.accentColor;
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 4px 20px rgba(0,0,0,0.4)`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)';
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'var(--shadow-sm)';
            }}
          >
            <h3
              style={{
                margin: '0 0 8px',
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-bright)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span aria-hidden="true">{card.emoji}</span>
              {card.heading}
            </h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5' }}>
              {card.description}
            </p>
          </Link>
        ))}
      </div>

      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '20px 24px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 12px', color: 'var(--text-bright)' }}>
          Getting Started
        </h2>
        <ol style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)', lineHeight: '1.8', fontSize: '14px' }}>
          <li>Set <code style={{ background: 'var(--bg-code)', color: 'var(--accent-bright)', padding: '1px 4px', borderRadius: '3px' }}>NEXT_PUBLIC_API_URL</code> to your AgentGuard API endpoint</li>
          <li>Set <code style={{ background: 'var(--bg-code)', color: 'var(--accent-bright)', padding: '1px 4px', borderRadius: '3px' }}>NEXT_PUBLIC_AGENTGUARD_JWT</code> or save your JWT via localStorage <code style={{ background: 'var(--bg-code)', color: 'var(--accent-bright)', padding: '1px 4px', borderRadius: '3px' }}>ag_token</code></li>
          <li>Navigate to <Link href="/audit" style={{ color: 'var(--accent-bright)' }}>Audit Log</Link> to see live events</li>
          <li>Navigate to <Link href="/agents" style={{ color: 'var(--accent-bright)' }}>Agents</Link> to manage agent kill switches</li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>New to AgentGuard?</strong>{' '}
            <Link href="/onboarding" style={{ color: 'var(--accent-bright)', fontWeight: 600 }}>
              <span aria-hidden="true">🚀</span> Run the 5-minute setup wizard
            </Link>
          </li>
        </ol>
      </div>
    </div>
  );
}
