export default function AlertsPage() {
  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 8px', color: '#0f172a' }}>🔔 Alerts</h1>
      <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 24px' }}>
        SIEM integrations, alert webhooks, and anomaly notifications.
      </p>
      <div style={{ background: '#fff', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', color: '#64748b' }}>
        <p>Alert configuration UI — coming in a future wave.</p>
        <p>Configure SIEM integrations and webhooks via the API.</p>
      </div>
    </div>
  );
}
