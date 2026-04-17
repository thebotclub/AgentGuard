'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>{error.message || 'An unexpected error occurred'}</p>
      <button
        onClick={reset}
        style={{
          padding: '8px 16px',
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
