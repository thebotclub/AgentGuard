export default function HitlPage() {
  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 8px', color: '#0f172a' }}>👤 HITL Queue</h1>
      <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 24px' }}>
        Human-in-the-loop approval queue for pending agent decisions.
      </p>
      <div style={{ background: '#fff', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', color: '#64748b' }}>
        <p>HITL approval queue UI — coming in a future wave.</p>
        <p>Approve and reject decisions via the API or Slack integration:</p>
        <pre style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '12px', color: '#0f172a' }}>
          {`GET  /v1/hitl
POST /v1/hitl/:gateId/decide  { decision: 'approve' | 'reject', note? }`}
        </pre>
      </div>
    </div>
  );
}
