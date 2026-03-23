/**
 * Alerts page — SIEM integrations & webhooks
 * Currently a placeholder; shows clear status and API guidance.
 */
export default function AlertsPage() {
  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 8px', color: '#0f172a' }}>
        🔔 Alerts
      </h1>
      <p style={{ color: '#475569', fontSize: '14px', margin: '0 0 24px' }}>
        SIEM integrations, alert webhooks, and anomaly notifications.
      </p>

      {/* Status card */}
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '48px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          textAlign: 'center',
          marginBottom: '24px',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '12px', lineHeight: 1 }}>🔔</div>
        <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
          Alert UI Coming Soon
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#475569', maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
          The in-dashboard alert configuration UI is planned for a future release. In the meantime, configure SIEM integrations and webhooks directly via the API.
        </p>
        <a
          href="https://docs.agentguard.tech/alerts"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            padding: '10px 24px',
            background: '#3b82f6',
            color: '#fff',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          📚 View API Docs
        </a>
      </div>

      {/* What's available via API */}
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
          Available via API today
        </h3>
        <ul
          style={{ margin: 0, paddingLeft: '20px', color: '#475569', lineHeight: '2', fontSize: '14px' }}
        >
          <li>
            <strong>Slack webhooks</strong> — <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>POST /v1/alert-webhooks</code>
          </li>
          <li>
            <strong>Splunk / DataDog SIEM</strong> — configure HEC / Forwarder endpoints
          </li>
          <li>
            <strong>PagerDuty integration</strong> — route HIGH/CRITICAL events to on-call
          </li>
          <li>
            <strong>Custom webhooks</strong> — send any event type to your own endpoints
          </li>
          <li>
            <strong>Email notifications</strong> — SMTP-based alerting for blocked actions
          </li>
        </ul>
      </div>
    </div>
  );
}
