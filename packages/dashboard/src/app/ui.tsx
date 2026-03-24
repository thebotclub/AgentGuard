/**
 * Shared UI primitives — AgentGuard Dashboard
 * Loading skeletons, error states, empty states, accessible spinner
 * Dark theme — uses CSS custom properties from globals.css
 */
'use client';

import type { ReactNode, CSSProperties } from 'react';

// ── Spinner ────────────────────────────────────────────────────────────────────

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `2px solid rgba(148,163,184,0.2)`,
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

export function Skeleton({ width = '100%', height = 16, style }: { width?: number | string; height?: number; style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="skeleton"
      style={{ width, height, borderRadius: 4, ...style }}
    />
  );
}

export function SkeletonText({ lines = 3, style }: { lines?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height={14} />
      ))}
    </div>
  );
}

// ── Table skeleton ─────────────────────────────────────────────────────────────

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading data"
      style={{ padding: '8px 0' }}
    >
      {Array.from({ length: rows }).map((_, ri) => (
        <div
          key={ri}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 12,
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          {Array.from({ length: cols }).map((_, ci) => (
            <Skeleton key={ci} height={16} width={ci === 0 ? '60%' : '80%'} />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

// ── Card skeleton ─────────────────────────────────────────────────────────────

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{ background: 'var(--bg-card)', borderRadius: 10, padding: '16px 20px', border: '1px solid var(--border)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Skeleton width={200} height={18} />
            <Skeleton width={60} height={20} />
          </div>
          <Skeleton height={13} style={{ marginBottom: 6 }} />
          <Skeleton width="50%" height={13} />
        </div>
      ))}
    </div>
  );
}

// ── Loading Overlay ───────────────────────────────────────────────────────────

export function LoadingBox({ message = 'Loading…', style }: { message?: string; style?: CSSProperties }) {
  return (
    <div
      role="status"
      aria-label={message}
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        color: 'var(--text-secondary)',
        fontSize: 14,
        ...style,
      }}
    >
      <Spinner size={28} />
      <span>{message}</span>
    </div>
  );
}

// ── Error State ────────────────────────────────────────────────────────────────

export function ErrorBox({
  message,
  onRetry,
  style,
}: {
  message: string;
  onRetry?: () => void;
  style?: CSSProperties;
}) {
  return (
    <div
      role="alert"
      style={{
        background: 'rgba(239,68,68,0.12)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 8,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: '#f87171', fontSize: 14, fontWeight: 500 }}>{message}</div>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              marginTop: 10,
              padding: '6px 14px',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              fontSize: 13,
              color: '#f87171',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            ↺ Try again
          </button>
        )}
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────────

export function EmptyBox({
  icon,
  title,
  description,
  action,
  style,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        padding: '60px 24px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        ...style,
      }}
    >
      {icon && <div style={{ fontSize: 48, marginBottom: 12, lineHeight: 1 }}>{icon}</div>}
      <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: 'var(--text-bright)' }}>{title}</h3>
      {description && (
        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
