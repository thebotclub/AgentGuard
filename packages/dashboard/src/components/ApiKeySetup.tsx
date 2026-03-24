'use client';

import { useState, useEffect } from 'react';
import { getApiKey, setApiKey } from '@/lib/api';

interface ApiKeySetupProps {
  onReady: () => void;
}

export default function ApiKeySetup({ onReady }: ApiKeySetupProps) {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const existing = getApiKey();
    if (existing) {
      setKey(existing);
      onReady();
    }
  }, [onReady]);

  const handleSave = () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setApiKey(trimmed);
    setSaved(true);
    onReady();
  };

  if (saved) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: '#1a1a2e',
          border: '1px solid #334155',
          borderRadius: 12,
          padding: 32,
          maxWidth: 420,
          width: '100%',
          margin: '0 16px',
        }}
      >
        <h2 style={{ margin: '0 0 8px', color: '#f1f5f9', fontSize: 20 }}>
          🔑 API Key Required
        </h2>
        <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 20px' }}>
          Enter your AgentGuard API key to access the dashboard. This is stored
          locally in your browser.
        </p>
        <input
          type="password"
          placeholder="ag_live_..."
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #334155',
            background: '#0f172a',
            color: '#f1f5f9',
            fontSize: 14,
            boxSizing: 'border-box',
            marginBottom: 12,
          }}
          autoFocus
        />
        <button
          onClick={handleSave}
          style={{
            width: '100%',
            padding: '10px 0',
            borderRadius: 8,
            border: 'none',
            background: '#6366f1',
            color: '#fff',
            fontWeight: 600,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Connect
        </button>
      </div>
    </div>
  );
}
