/**
 * Dashboard home page — scaffold.
 * TODO: Implement full dashboard with:
 *   - Agent activity feed (WebSocket)
 *   - Policy violations chart
 *   - Kill switch controls
 *   - HITL approval queue
 *   - Audit log viewer
 */
export default function DashboardPage() {
  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '800px',
        margin: '80px auto',
        padding: '0 24px',
      }}
    >
      <h1>AgentGuard Dashboard</h1>
      <p style={{ color: '#666' }}>
        Runtime security platform for AI agents.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginTop: '48px',
        }}
      >
        <FeatureCard
          title="Agents"
          description="Monitor and manage your AI agents"
          href="/agents"
        />
        <FeatureCard
          title="Policies"
          description="Define and deploy security policies"
          href="/policies"
        />
        <FeatureCard
          title="Audit Log"
          description="Tamper-evident audit trail"
          href="/audit"
        />
        <FeatureCard
          title="Kill Switch"
          description="Halt agents instantly"
          href="/killswitch"
        />
        <FeatureCard
          title="HITL Queue"
          description="Review pending approvals"
          href="/hitl"
        />
        <FeatureCard
          title="Alerts"
          description="SIEM integrations and webhooks"
          href="/alerts"
        />
      </div>
    </main>
  );
}

function FeatureCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: 'block',
        padding: '20px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.2s',
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>{title}</h3>
      <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>{description}</p>
    </a>
  );
}
