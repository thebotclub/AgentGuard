export default function PoliciesPage() {
  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 8px', color: '#0f172a' }}>📜 Policies</h1>
      <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 24px' }}>
        Define and manage YAML-based security policies for your agents.
      </p>
      <div style={{ background: '#fff', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', color: '#64748b' }}>
        <p>Policy management UI — coming in a future wave.</p>
        <p>Use the API directly to manage policies:</p>
        <pre style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '12px', color: '#0f172a' }}>
          {`GET  /v1/policies
POST /v1/policies
GET  /v1/policies/:id
PUT  /v1/policies/:id
DELETE /v1/policies/:id
POST /v1/policies/:id/test`}
        </pre>
      </div>
    </div>
  );
}
