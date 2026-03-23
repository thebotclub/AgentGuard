'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  listAuditEvents,
  buildExportUrl,
  type AuditQueryParams,
} from '../../lib/api';
import { TableSkeleton, ErrorBox, EmptyBox } from '../ui';

// ─── Types & constants ────────────────────────────────────────────────────────

const DECISIONS = ['', 'ALLOW', 'BLOCK', 'MONITOR', 'HITL_PENDING', 'HITL_APPROVED', 'HITL_REJECTED', 'KILLED', 'ERROR'];
const RISK_TIERS = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const DECISION_COLORS: Record<string, { bg: string; color: string }> = {
  ALLOW: { bg: '#dcfce7', color: '#15803d' },
  BLOCK: { bg: '#fee2e2', color: '#b91c1c' },
  MONITOR: { bg: '#dbeafe', color: '#1d4ed8' },
  HITL_PENDING: { bg: '#fef3c7', color: '#92400e' },
  HITL_APPROVED: { bg: '#d1fae5', color: '#065f46' },
  HITL_REJECTED: { bg: '#fee2e2', color: '#991b1b' },
  HITL_TIMEOUT: { bg: '#f3f4f6', color: '#374151' },
  KILLED: { bg: '#fee2e2', color: '#7f1d1d' },
  ERROR: { bg: '#f3f4f6', color: '#374151' },
};

const RISK_COLORS: Record<string, { bg: string; color: string }> = {
  LOW: { bg: '#dcfce7', color: '#15803d' },
  MEDIUM: { bg: '#fef3c7', color: '#92400e' },
  HIGH: { bg: '#fee2e2', color: '#b91c1c' },
  CRITICAL: { bg: '#7f1d1d', color: '#fef2f2' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({
  label,
  colors,
}: {
  label: string;
  colors?: { bg: string; color: string };
}) {
  const c = colors ?? { bg: '#f1f5f9', color: '#475569' };
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: AuditQueryParams;
  onChange: (f: AuditQueryParams) => void;
}) {
  const inputStyle = {
    padding: '6px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    background: '#fff',
    color: '#0f172a',
    outline: 'none',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '16px',
        background: '#fff',
        borderRadius: '8px',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        alignItems: 'flex-end',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Agent ID
        </label>
        <input
          style={inputStyle}
          placeholder="Filter by agent…"
          value={filters.agentId ?? ''}
          onChange={(e) => onChange({ ...filters, agentId: e.target.value || undefined, cursor: undefined })}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Decision
        </label>
        <select
          style={inputStyle}
          value={filters.decision ?? ''}
          onChange={(e) => onChange({ ...filters, decision: e.target.value || undefined, cursor: undefined })}
        >
          {DECISIONS.map((d) => (
            <option key={d} value={d}>{d || 'All decisions'}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Risk Tier
        </label>
        <select
          style={inputStyle}
          value={filters.riskTier ?? ''}
          onChange={(e) => onChange({ ...filters, riskTier: e.target.value || undefined, cursor: undefined })}
        >
          {RISK_TIERS.map((r) => (
            <option key={r} value={r}>{r || 'All tiers'}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Tool Name
        </label>
        <input
          style={inputStyle}
          placeholder="e.g. stripe.charge"
          value={filters.toolName ?? ''}
          onChange={(e) => onChange({ ...filters, toolName: e.target.value || undefined, cursor: undefined })}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          From
        </label>
        <input
          type="datetime-local"
          style={inputStyle}
          value={filters.fromDate?.slice(0, 16) ?? ''}
          onChange={(e) => onChange({ ...filters, fromDate: e.target.value ? new Date(e.target.value).toISOString() : undefined, cursor: undefined })}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          To
        </label>
        <input
          type="datetime-local"
          style={inputStyle}
          value={filters.toDate?.slice(0, 16) ?? ''}
          onChange={(e) => onChange({ ...filters, toDate: e.target.value ? new Date(e.target.value).toISOString() : undefined, cursor: undefined })}
        />
      </div>

      <button
        style={{
          padding: '6px 14px',
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          fontSize: '13px',
          cursor: 'pointer',
          color: '#475569',
          alignSelf: 'flex-end',
        }}
        onClick={() => onChange({ limit: 50 })}
      >
        Clear
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditQueryParams>({ limit: 50 });
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['audit', filters],
    queryFn: () => listAuditEvents(filters),
  });

  const handleFilterChange = useCallback((f: AuditQueryParams) => {
    setFilters({ ...f, limit: 50 });
    setCursorStack([]);
  }, []);

  const handleNextPage = () => {
    if (!data?.pagination.cursor) return;
    setCursorStack((prev) => [...prev, filters.cursor ?? '']);
    setFilters((f) => ({ ...f, cursor: data.pagination.cursor! }));
  };

  const handlePrevPage = () => {
    const stack = [...cursorStack];
    const prev = stack.pop();
    setCursorStack(stack);
    setFilters((f) => ({ ...f, cursor: prev || undefined }));
  };

  const handleExport = (format: 'csv' | 'json') => {
    const url = buildExportUrl(filters, format);
    window.open(url, '_blank');
  };

  const events = data?.data ?? [];
  const page = cursorStack.length + 1;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
            📋 Audit Log
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
            Tamper-evident audit trail with SHA-256 hash chain verification.
          </p>
        </div>

        {/* Export buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handleExport('csv')}
            aria-label="Export audit log as CSV"
            style={{
              padding: '8px 16px',
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              color: '#374151',
              fontWeight: 500,
            }}
          >
            ⬇ Export CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            aria-label="Export audit log as JSON"
            style={{
              padding: '8px 16px',
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              color: '#374151',
              fontWeight: 500,
            }}
          >
            ⬇ Export JSON
          </button>
        </div>
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onChange={handleFilterChange} />

      {/* Error state */}
      {isError && (
        <ErrorBox
          message={`Failed to load audit events: ${(error as Error).message}`}
          onRetry={() => void refetch()}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Table */}
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <TableSkeleton rows={7} cols={8} />
        ) : events.length === 0 ? (
          <EmptyBox
            icon="📋"
            title="No audit events found"
            description="No events match the current filters. Try adjusting or clearing your filters."
            action={
              <button
                onClick={() => handleFilterChange({ limit: 50 })}
                style={{ padding: '8px 20px', background: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
              >
                Clear all filters
              </button>
            }
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr
                style={{
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                {['Time', 'Agent', 'Tool', 'Decision', 'Risk', 'Score', 'Chain', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: '#64748b',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event, idx) => (
                <tr
                  key={event.id}
                  style={{
                    borderBottom: idx < events.length - 1 ? '1px solid #f1f5f9' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                >
                  <td style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {new Date(event.occurredAt).toLocaleDateString()}
                    </div>
                    <div>
                      {new Date(event.occurredAt).toLocaleTimeString()}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <code
                      style={{
                        fontSize: '11px',
                        background: '#f1f5f9',
                        padding: '2px 5px',
                        borderRadius: '3px',
                        color: '#374151',
                        display: 'block',
                        maxWidth: '160px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={event.agentId}
                    >
                      {event.agentId}
                    </code>
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: '160px' }}>
                    <div
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: '#374151',
                      }}
                      title={event.toolName ?? event.actionType}
                    >
                      {event.toolName ?? <em style={{ color: '#94a3b8' }}>{event.actionType}</em>}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Badge
                      label={event.policyDecision}
                      colors={DECISION_COLORS[event.policyDecision]}
                    />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Badge
                      label={event.riskTier}
                      colors={RISK_COLORS[event.riskTier]}
                    />
                  </td>
                  <td style={{ padding: '10px 14px', color: '#374151' }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: event.riskScore >= 700 ? '#b91c1c' : event.riskScore >= 400 ? '#92400e' : '#15803d',
                      }}
                    >
                      {event.riskScore}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {event.previousHash === '0000000000000000000000000000000000000000000000000000000000000000' ? (
                      <span title="Genesis block (first in chain)" style={{ color: '#94a3b8', fontSize: '12px' }}>⊙ genesis</span>
                    ) : (
                      <span title={`Previous: ${event.previousHash.slice(0, 16)}…`} style={{ color: '#10b981', fontSize: '12px' }}>
                        🔗 linked
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Link
                      href={`/audit/${event.id}`}
                      style={{
                        color: '#3b82f6',
                        fontSize: '12px',
                        textDecoration: 'none',
                        fontWeight: 500,
                      }}
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && events.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '16px',
            padding: '12px 0',
          }}
        >
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            Page {page} · {events.length} events
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handlePrevPage}
              disabled={cursorStack.length === 0}
              style={{
                padding: '7px 16px',
                background: cursorStack.length === 0 ? '#f1f5f9' : '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: cursorStack.length === 0 ? 'not-allowed' : 'pointer',
                color: cursorStack.length === 0 ? '#94a3b8' : '#374151',
              }}
            >
              ← Prev
            </button>
            <button
              onClick={handleNextPage}
              disabled={!data?.pagination.hasMore}
              style={{
                padding: '7px 16px',
                background: !data?.pagination.hasMore ? '#f1f5f9' : '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: !data?.pagination.hasMore ? 'not-allowed' : 'pointer',
                color: !data?.pagination.hasMore ? '#94a3b8' : '#374151',
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
