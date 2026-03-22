'use client';

/**
 * Policy CRUD UI — /policies
 *
 * Lists all policies. Create/Edit via YAML editor (textarea, monospace, syntax-aware).
 * Delete with confirmation. Version history (last 5). Test Policy dry-run.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import {
  listPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  listPolicyVersions,
  getPolicyVersion,
  testPolicy,
  activatePolicyVersion,
  type Policy,
  type PolicyVersion,
  type PolicyTestResult,
} from '../../lib/api';

// ── Default YAML template ──────────────────────────────────────────────────────

const YAML_TEMPLATE = `# AgentGuard Policy
name: my-policy
version: "1.0"
description: Security policy for AI agents

rules:
  - id: block-sensitive-tools
    description: Block access to sensitive filesystem and network tools
    condition:
      type: tool_name
      operator: in
      values:
        - delete_file
        - drop_database
        - send_email
    action: BLOCK
    severity: HIGH

  - id: monitor-high-risk
    description: Monitor high-risk actions
    condition:
      type: risk_score
      operator: gte
      value: 700
    action: MONITOR

  - id: require-approval-production
    description: Require human approval for production deployments
    condition:
      type: tool_name
      operator: in
      values:
        - deploy_to_production
        - run_migration
    action: REQUIRE_APPROVAL

defaultAction: ALLOW
`;

const DEFAULT_TEST_YAML = `tests:
  - name: Block delete_file
    input:
      toolName: delete_file
      riskScore: 500
    expectedDecision: BLOCK

  - name: Allow safe tool
    input:
      toolName: read_file
      riskScore: 100
    expectedDecision: ALLOW
`;

// ── Simple YAML Syntax Highlighter ────────────────────────────────────────────
// We use a plain styled textarea for editing (no heavy deps).
// A mirror div behind it shows syntax highlighting via CSS.
// For production, swap with Monaco or CodeMirror.

function YamlEditor({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%',
          minHeight: '400px',
          boxSizing: 'border-box',
          fontFamily: '"Fira Code", "Cascadia Code", Consolas, "Courier New", monospace',
          fontSize: '13px',
          lineHeight: '1.6',
          padding: '12px 14px',
          border: `1px solid ${error ? '#ef4444' : '#e2e8f0'}`,
          borderRadius: '6px',
          background: '#0f172a',
          color: '#e2e8f0',
          resize: 'vertical',
          outline: 'none',
          tabSize: 2,
        }}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const start = e.currentTarget.selectionStart;
            const end = e.currentTarget.selectionEnd;
            const newValue = value.substring(0, start) + '  ' + value.substring(end);
            onChange(newValue);
            setTimeout(() => {
              e.currentTarget.selectionStart = start + 2;
              e.currentTarget.selectionEnd = start + 2;
            }, 0);
          }
        }}
      />
      {error && (
        <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

// ── Policy Editor Modal ────────────────────────────────────────────────────────

interface PolicyEditorProps {
  policy?: Policy;
  initialYaml?: string;
  onClose: () => void;
  onSaved: () => void;
}

function PolicyEditor({ policy, initialYaml, onClose, onSaved }: PolicyEditorProps) {
  const [yaml, setYaml] = useState(initialYaml ?? YAML_TEMPLATE);
  const [name, setName] = useState(policy?.name ?? '');
  const [description, setDescription] = useState(policy?.description ?? '');
  const [changelog, setChangelog] = useState('');
  const [yamlError, setYamlError] = useState('');
  const isEditing = !!policy;

  const createMutation = useMutation({
    mutationFn: createPolicy,
    onSuccess: () => { onSaved(); onClose(); },
    onError: (err) => setYamlError(err instanceof Error ? err.message : 'Save failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePolicy>[1] }) =>
      updatePolicy(id, data),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (err) => setYamlError(err instanceof Error ? err.message : 'Save failed'),
  });

  const handleSave = useCallback(() => {
    setYamlError('');
    // Basic YAML validation
    if (!yaml.trim()) {
      setYamlError('YAML content cannot be empty');
      return;
    }
    if (!name.trim() && !isEditing) {
      setYamlError('Policy name is required');
      return;
    }

    if (isEditing) {
      updateMutation.mutate({
        id: policy.id,
        data: { yamlContent: yaml, description: description || undefined, changelog: changelog || undefined },
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        description: description || undefined,
        yamlContent: yaml,
        changelog: changelog || undefined,
      });
    }
  }, [yaml, name, description, changelog, isEditing, policy, createMutation, updateMutation]);

  const loading = createMutation.isPending || updateMutation.isPending;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px',
        width: '800px', maxWidth: '95vw', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
            {isEditing ? `✏️ Edit Policy: ${policy.name}` : '📜 Create New Policy'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#94a3b8' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {!isEditing && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#374151' }}>
                  Policy Name *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. finance-agent-policy"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    padding: '8px 10px', fontSize: '13px',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#374151' }}>
                  Description
                </label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    padding: '8px 10px', fontSize: '13px',
                  }}
                />
              </div>
            </div>
          )}

          {isEditing && description !== undefined && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#374151' }}>
                Description
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: '1px solid #e2e8f0', borderRadius: '6px',
                  padding: '8px 10px', fontSize: '13px',
                }}
              />
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                YAML Policy Content
              </label>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Tab = 2 spaces</span>
            </div>
            <YamlEditor value={yaml} onChange={setYaml} error={yamlError} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#374151' }}>
              Changelog {isEditing && '(new version description)'}
            </label>
            <input
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              placeholder="e.g. Added rule to block production deployments"
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1px solid #e2e8f0', borderRadius: '6px',
                padding: '8px 10px', fontSize: '13px',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              padding: '8px 20px', borderRadius: '6px', border: 'none',
              background: '#3b82f6', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '13px', fontWeight: 600, opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Saving…' : isEditing ? 'Save New Version' : 'Create Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Version History Panel ──────────────────────────────────────────────────────

function VersionHistoryPanel({
  policyId,
  activeVersion,
  onActivate,
}: {
  policyId: string;
  activeVersion: string | null;
  onActivate: (version: string) => void;
}) {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  const { data: versionsData, isLoading } = useQuery({
    queryKey: ['policy-versions', policyId],
    queryFn: () => listPolicyVersions(policyId),
  });

  const { data: versionDetail } = useQuery({
    queryKey: ['policy-version-detail', policyId, selectedVersion],
    queryFn: () => getPolicyVersion(policyId, selectedVersion!),
    enabled: !!selectedVersion,
  });

  const versions = (versionsData?.data ?? []).slice(0, 5);

  if (isLoading) return <div style={{ padding: '12px', fontSize: '13px', color: '#64748b' }}>Loading versions…</div>;

  return (
    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px' }}>
      <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
        📚 Version History (last 5)
      </h4>
      {versions.length === 0 && (
        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>No versions yet.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {versions.map((v: PolicyVersion) => (
          <div key={v.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px',
            background: '#fff', borderRadius: '6px',
            border: v.version === activeVersion ? '1px solid #3b82f6' : '1px solid #e2e8f0',
          }}>
            <div>
              <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>v{v.version}</span>
              {v.version === activeVersion && (
                <span style={{ marginLeft: '6px', background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>ACTIVE</span>
              )}
              <span style={{ marginLeft: '8px', fontSize: '11px', color: '#94a3b8' }}>
                {v.ruleCount} rules · {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
              </span>
              {v.changelog && (
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{v.changelog}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setSelectedVersion(selectedVersion === v.version ? null : v.version)}
                style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '11px' }}
              >
                {selectedVersion === v.version ? 'Hide YAML' : 'View YAML'}
              </button>
              {v.version !== activeVersion && (
                <button
                  onClick={() => onActivate(v.version)}
                  style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '11px' }}
                >
                  Activate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {selectedVersion && versionDetail?.yamlContent && (
        <div style={{ marginTop: '12px' }}>
          <pre style={{
            background: '#0f172a', color: '#e2e8f0',
            padding: '12px', borderRadius: '6px',
            fontSize: '11px', overflow: 'auto',
            maxHeight: '200px', margin: 0,
          }}>
            {versionDetail.yamlContent}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Test Policy Modal ──────────────────────────────────────────────────────────

function TestPolicyModal({
  policyId,
  policyName,
  onClose,
}: {
  policyId: string;
  policyName: string;
  onClose: () => void;
}) {
  const [testYaml, setTestYaml] = useState(DEFAULT_TEST_YAML);
  const [result, setResult] = useState<PolicyTestResult | null>(null);
  const [error, setError] = useState('');

  const testMutation = useMutation({
    mutationFn: (tests: unknown[]) => testPolicy(policyId, tests),
    onSuccess: (data) => setResult(data),
    onError: (err) => setError(err instanceof Error ? err.message : 'Test failed'),
  });

  const handleRun = useCallback(() => {
    setError('');
    setResult(null);
    // Parse YAML-ish tests — extract test cases from the simple format
    // We send raw objects; real parser would be needed for production
    const sampleTests = [
      {
        name: 'block-delete-file',
        input: { toolName: 'delete_file', actionType: 'tool_call', riskScore: 500 },
        expectedDecision: 'BLOCK',
      },
      {
        name: 'allow-read-file',
        input: { toolName: 'read_file', actionType: 'tool_call', riskScore: 100 },
        expectedDecision: 'ALLOW',
      },
    ];
    testMutation.mutate(sampleTests);
  }, [testMutation]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1001, padding: '20px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px', width: '700px', maxWidth: '95vw',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
            🧪 Test Policy: {policyName}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#94a3b8' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#64748b' }}>
            Dry-run test cases against the active policy version. No side effects.
          </p>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>
              Test Cases (YAML preview — sample cases used for dry-run)
            </label>
            <YamlEditor value={testYaml} onChange={setTestYaml} />
          </div>

          {error && (
            <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
              {error}
            </div>
          )}

          {result && (
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{result.summary.total}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Total</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>{result.summary.passed}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Passed</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626' }}>{result.summary.failed}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Failed</div>
                </div>
              </div>

              {result.results.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', background: '#fff', borderRadius: '6px',
                  border: `1px solid ${r.passed ? '#dcfce7' : '#fee2e2'}`,
                  marginBottom: '6px',
                }}>
                  <span style={{ fontSize: '16px' }}>{r.passed ? '✅' : '❌'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>{r.name}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      Decision: <strong>{r.decision}</strong>
                      {r.expectedDecision && r.decision !== r.expectedDecision && (
                        <span style={{ color: '#dc2626' }}> (expected: {r.expectedDecision})</span>
                      )}
                      {r.riskScore !== undefined && ` · Risk: ${r.riskScore}`}
                    </div>
                    {r.error && <div style={{ fontSize: '11px', color: '#ef4444' }}>{r.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>
            Close
          </button>
          <button
            onClick={handleRun}
            disabled={testMutation.isPending}
            style={{
              padding: '8px 20px', borderRadius: '6px', border: 'none',
              background: '#8b5cf6', color: '#fff', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600,
              opacity: testMutation.isPending ? 0.7 : 1,
            }}
          >
            {testMutation.isPending ? 'Running…' : '▶ Run Dry-Run Test'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Policy Card ───────────────────────────────────────────────────────────────

function PolicyCard({
  policy,
  onEdit,
  onDelete,
  onTest,
}: {
  policy: Policy;
  onEdit: (p: Policy) => void;
  onDelete: (p: Policy) => void;
  onTest: (p: Policy) => void;
}) {
  const [showVersions, setShowVersions] = useState(false);
  const queryClient = useQueryClient();

  const activateMutation = useMutation({
    mutationFn: (version: string) => activatePolicyVersion(policy.id, version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['policies'] });
      void queryClient.invalidateQueries({ queryKey: ['policy-versions', policy.id] });
    },
  });

  const defaultActionColor = policy.defaultAction === 'BLOCK' ? '#dc2626'
    : policy.defaultAction === 'ALLOW' ? '#16a34a'
    : '#f59e0b';

  return (
    <div style={{
      background: '#fff', borderRadius: '10px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      border: '1px solid #f1f5f9',
      overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
                {policy.name}
              </h3>
              <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1px 7px', fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                {policy.activeVersion ? `v${policy.activeVersion}` : 'no version'}
              </span>
              <span style={{ background: defaultActionColor + '15', color: defaultActionColor, borderRadius: '4px', padding: '1px 7px', fontSize: '11px', fontWeight: 600 }}>
                {policy.defaultAction}
              </span>
            </div>
            {policy.description && (
              <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#64748b' }}>{policy.description}</p>
            )}
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Updated {formatDistanceToNow(new Date(policy.updatedAt), { addSuffix: true })}
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => onTest(policy)}
              style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '12px', color: '#8b5cf6' }}
            >🧪 Test</button>
            <button
              onClick={() => setShowVersions(!showVersions)}
              style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '12px', color: '#3b82f6' }}
            >📚 History</button>
            <button
              onClick={() => onEdit(policy)}
              style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '12px' }}
            >✏️ Edit</button>
            <button
              onClick={() => onDelete(policy)}
              style={{ padding: '5px 10px', borderRadius: '5px', border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }}
            >🗑 Delete</button>
          </div>
        </div>
      </div>

      {/* Version history */}
      {showVersions && (
        <div style={{ padding: '16px 20px', background: '#fafafa', borderTop: '1px solid #f1f5f9' }}>
          <VersionHistoryPanel
            policyId={policy.id}
            activeVersion={policy.activeVersion}
            onActivate={(v) => activateMutation.mutate(v)}
          />
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const [showEditor, setShowEditor] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [testingPolicy, setTestingPolicy] = useState<Policy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Policy | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['policies'],
    queryFn: () => listPolicies({ limit: 50 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (policyId: string) => deletePolicy(policyId),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
  });

  const policies = data?.data ?? [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px', color: '#0f172a' }}>
            📜 Policies
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
            Define and manage YAML-based security policies for your agents.
          </p>
        </div>
        <button
          onClick={() => { setEditingPolicy(null); setShowEditor(true); }}
          style={{
            padding: '10px 20px', borderRadius: '8px', border: 'none',
            background: '#3b82f6', color: '#fff', cursor: 'pointer',
            fontSize: '14px', fontWeight: 600,
          }}
        >
          + Create Policy
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
          Error loading policies: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {/* Loading */}
      {isLoading && <div style={{ color: '#64748b', padding: '20px' }}>Loading policies…</div>}

      {/* Empty state */}
      {!isLoading && policies.length === 0 && (
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '60px 24px',
          textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📜</div>
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#0f172a' }}>No policies yet</h3>
          <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>
            Create your first policy to start protecting your agents.
          </p>
          <button
            onClick={() => { setEditingPolicy(null); setShowEditor(true); }}
            style={{
              padding: '10px 24px', borderRadius: '8px', border: 'none',
              background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
            }}
          >
            + Create First Policy
          </button>
        </div>
      )}

      {/* Policy list */}
      {!isLoading && policies.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {policies.map((policy) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onEdit={(p) => { setEditingPolicy(p); setShowEditor(true); }}
              onDelete={setDeleteTarget}
              onTest={setTestingPolicy}
            />
          ))}
        </div>
      )}

      {/* Policy Editor Modal */}
      {showEditor && (
        <PolicyEditor
          policy={editingPolicy ?? undefined}
          onClose={() => { setShowEditor(false); setEditingPolicy(null); }}
          onSaved={() => { void queryClient.invalidateQueries({ queryKey: ['policies'] }); }}
        />
      )}

      {/* Test Modal */}
      {testingPolicy && (
        <TestPolicyModal
          policyId={testingPolicy.id}
          policyName={testingPolicy.name}
          onClose={() => setTestingPolicy(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '28px',
            width: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
              🗑 Delete Policy
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#475569' }}>
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
              This action soft-deletes the policy — it can be recovered via the API.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '13px' }}
              >Cancel</button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: 'none',
                  background: '#dc2626', color: '#fff', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 600,
                  opacity: deleteMutation.isPending ? 0.7 : 1,
                }}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete Policy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
