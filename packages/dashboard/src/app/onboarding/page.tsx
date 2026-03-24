'use client';

/**
 * Onboarding Wizard — /onboarding
 *
 * 5-step flow targeting < 5 min to first event (TTFE):
 *   1. Generate API key
 *   2. Choose framework
 *   3. Copy wrapper code snippet
 *   4. Send test event
 *   5. Success screen
 *
 * Tracks analytics per step (localStorage + console.debug for now).
 * Shows progress indicator. Skip / "I'll do this later" option available.
 */

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { createAgent, type Agent } from '../../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

type Framework = 'langchain' | 'crewai' | 'autogen' | 'custom';

const FRAMEWORKS: Array<{ id: Framework; label: string; icon: string; description: string }> = [
  { id: 'langchain', label: 'LangChain', icon: '🦜', description: 'Python & JS agent framework' },
  { id: 'crewai', label: 'CrewAI', icon: '🤝', description: 'Multi-agent orchestration' },
  { id: 'autogen', label: 'AutoGen', icon: '🤖', description: 'Microsoft multi-agent framework' },
  { id: 'custom', label: 'Custom / REST', icon: '⚡', description: 'Any language, direct API' },
];

// ── Analytics ─────────────────────────────────────────────────────────────────

function trackStep(step: number, name: string, extra?: Record<string, unknown>) {
  const event = { step, name, ts: new Date().toISOString(), ...extra };
  console.debug('[onboarding-analytics]', event);
  try {
    const prev = JSON.parse(localStorage.getItem('ag_onboarding_analytics') ?? '[]') as unknown[];
    prev.push(event);
    localStorage.setItem('ag_onboarding_analytics', JSON.stringify(prev));
  } catch {
    // ignore storage errors
  }
}

// ── Code Snippets ─────────────────────────────────────────────────────────────

function getInstallCommand(framework: Framework): string {
  if (framework === 'langchain') return 'pip install agentguard-tech langchain';
  if (framework === 'crewai') return 'pip install agentguard-tech crewai';
  if (framework === 'autogen') return 'pip install agentguard-tech pyautogen';
  return '# npm\nnpm install @agentguard/sdk\n# or pip\npip install agentguard-tech';
}

function getWrapperSnippet(framework: Framework, apiKey: string): string {
  const key = apiKey || 'ag_agent_YOUR_KEY_HERE';
  const apiUrl = process.env['NEXT_PUBLIC_API_URL']?.replace('/v1', '') ?? 'https://api.agentguard.tech';

  if (framework === 'langchain') {
    return `from agentguard import AgentGuard
from langchain.agents import initialize_agent

# Initialize AgentGuard
guard = AgentGuard(
    api_key="${key}",
    api_url="${apiUrl}",
)

# Wrap your LangChain tools
from agentguard.integrations.langchain import GuardedToolWrapper

@guard.tool
def my_tool(input: str) -> str:
    """Your tool logic here."""
    return f"result: {input}"

# Use the guarded tool in your agent
tools = [GuardedToolWrapper(my_tool)]
agent = initialize_agent(tools, llm, agent="zero-shot-react-description")`;
  }

  if (framework === 'crewai') {
    return `from agentguard import AgentGuard
from agentguard.integrations.crewai import GuardedCrewAITool
from crewai import Agent, Task, Crew

# Initialize AgentGuard
guard = AgentGuard(
    api_key="${key}",
    api_url="${apiUrl}",
)

# Wrap CrewAI tools
class MyTool(GuardedCrewAITool):
    name = "my_tool"
    description = "My guarded tool"
    guard = guard

    def _run(self, input: str) -> str:
        return f"result: {input}"

agent = Agent(role="analyst", tools=[MyTool()])`;
  }

  if (framework === 'autogen') {
    return `from agentguard import AgentGuard
from agentguard.integrations.autogen import GuardedFunctionMap
import autogen

# Initialize AgentGuard
guard = AgentGuard(
    api_key="${key}",
    api_url="${apiUrl}",
)

# Register guarded functions
@guard.function
def my_function(input: str) -> str:
    """Your function logic."""
    return f"result: {input}"

function_map = GuardedFunctionMap(guard, {"my_function": my_function})

# Use with AutoGen agents
agent = autogen.AssistantAgent(
    name="assistant",
    function_map=function_map,
)`;
  }

  // custom / REST
  return `# Direct REST API Integration

import requests

AGENTGUARD_API_URL = "${apiUrl}/v1"
AGENTGUARD_API_KEY = "${key}"

def evaluate_action(tool_name: str, tool_params: dict) -> dict:
    """Call AgentGuard before executing any tool."""
    response = requests.post(
        f"{AGENTGUARD_API_URL}/actions/evaluate",
        json={
            "toolName": tool_name,
            "toolParams": tool_params,
            "actionType": "tool_call",
        },
        headers={"Authorization": f"Bearer {AGENTGUARD_API_KEY}"},
    )
    result = response.json()
    
    if result["decision"] == "BLOCK":
        raise PermissionError(f"AgentGuard blocked: {result.get('blockReason')}")
    
    return result

# Example usage
result = evaluate_action("send_email", {"to": "user@example.com"})
print(f"Decision: {result['decision']} (risk: {result['riskScore']})")`;
}

// ── Components ────────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round(((step - 1) / (total - 1)) * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Step {step} of {total}</span>
        <span style={{ fontSize: '12px', color: '#3b82f6', fontWeight: 600 }}>{pct}% complete</span>
      </div>
      <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: '3px',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ display: 'flex', gap: '0', marginTop: '12px' }}>
        {Array.from({ length: total }).map((_, i) => {
          const done = i + 1 < step;
          const active = i + 1 === step;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: done ? '#3b82f6' : active ? '#fff' : '#f1f5f9',
                border: `2px solid ${done || active ? '#3b82f6' : '#e2e8f0'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 700,
                color: done ? '#fff' : active ? '#3b82f6' : '#94a3b8',
                zIndex: 1, position: 'relative',
              }}>
                {done ? '✓' : i + 1}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        padding: '6px 14px', borderRadius: '5px',
        border: '1px solid var(--border)', background: copied ? '#dcfce7' : '#fff',
        color: copied ? '#16a34a' : '#475569',
        cursor: 'pointer', fontSize: '12px', fontWeight: 500,
        transition: 'all 0.2s',
      }}
    >
      {copied ? '✓ Copied!' : '📋 Copy'}
    </button>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function Step1GenerateKey({
  onNext,
  setApiKey,
  apiKey,
}: {
  onNext: () => void;
  setApiKey: (k: string) => void;
  apiKey: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agentName, setAgentName] = useState('my-first-agent');
  const [generated, setGenerated] = useState(!!apiKey);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await createAgent({
        name: agentName || 'my-first-agent',
        description: 'Created via onboarding wizard',
      });
      setApiKey(result.apiKey);
      setGenerated(true);
      trackStep(1, 'api_key_generated', { agentId: result.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate API key');
    } finally {
      setLoading(false);
    }
  }, [agentName, setApiKey]);

  return (
    <div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: 'var(--text-bright)' }}>
        🔑 Step 1: Generate Your API Key
      </h2>
      <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Each agent needs an API key to authenticate with AgentGuard. This key will be shown only once — save it securely.
      </p>

      {!generated ? (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
              Agent Name
            </label>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. finance-agent, support-bot"
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1px solid var(--border)', borderRadius: '6px',
                padding: '10px 12px', fontSize: '14px',
              }}
            />
          </div>
          {error && <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>⚠ {error}</div>}
          <button
            onClick={() => void handleGenerate()}
            disabled={loading}
            style={{
              padding: '12px 28px', borderRadius: '8px', border: 'none',
              background: '#3b82f6', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '15px', fontWeight: 600, opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '⏳ Generating…' : '🔑 Generate API Key'}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '16px 20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your API Key (shown once)</span>
              <CopyButton text={apiKey} />
            </div>
            <code style={{ fontSize: '14px', color: '#38bdf8', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {apiKey}
            </code>
          </div>
          <div style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid #fde68a', borderRadius: '6px', padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: '#fbbf24' }}>
            ⚠️ <strong>Save this key now.</strong> For security, it will not be shown again.
          </div>
          <button
            onClick={() => { trackStep(1, 'step1_continue'); onNext(); }}
            style={{
              padding: '12px 28px', borderRadius: '8px', border: 'none',
              background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: '15px', fontWeight: 600,
            }}
          >
            ✅ I&apos;ve saved my key — Continue
          </button>
        </div>
      )}
    </div>
  );
}

function Step2Framework({
  onNext,
  onBack,
  framework,
  setFramework,
}: {
  onNext: () => void;
  onBack: () => void;
  framework: Framework | null;
  setFramework: (f: Framework) => void;
}) {
  return (
    <div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: 'var(--text-bright)' }}>
        🧩 Step 2: Choose Your Framework
      </h2>
      <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'var(--text-muted)' }}>
        Select the framework you use to build your AI agents.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
        {FRAMEWORKS.map((fw) => (
          <button
            key={fw.id}
            onClick={() => setFramework(fw.id)}
            style={{
              padding: '16px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
              border: `2px solid ${framework === fw.id ? '#3b82f6' : '#e2e8f0'}`,
              background: framework === fw.id ? '#eff6ff' : '#fff',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>{fw.icon}</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-bright)', marginBottom: '4px' }}>{fw.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fw.description}</div>
          </button>
        ))}
      </div>

      {framework && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '12px 14px', marginBottom: '20px' }}>
          <span style={{ fontSize: '13px', color: '#60a5fa' }}>
            📦 Install command:
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <code style={{ flex: 1, fontSize: '13px', color: 'var(--text-bright)', background: 'rgba(96,165,250,0.15)', padding: '6px 10px', borderRadius: '4px', fontFamily: 'monospace' }}>
              {getInstallCommand(framework)}
            </code>
            <CopyButton text={getInstallCommand(framework)} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={onBack} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: '14px' }}>
          ← Back
        </button>
        <button
          onClick={() => { trackStep(2, 'framework_selected', { framework }); onNext(); }}
          disabled={!framework}
          style={{
            padding: '10px 24px', borderRadius: '8px', border: 'none',
            background: framework ? '#3b82f6' : '#94a3b8',
            color: '#fff', cursor: framework ? 'pointer' : 'not-allowed',
            fontSize: '14px', fontWeight: 600,
          }}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

function Step3Snippet({
  onNext,
  onBack,
  framework,
  apiKey,
}: {
  onNext: () => void;
  onBack: () => void;
  framework: Framework;
  apiKey: string;
}) {
  const snippet = getWrapperSnippet(framework, apiKey);
  const fw = FRAMEWORKS.find((f) => f.id === framework)!;

  return (
    <div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: 'var(--text-bright)' }}>
        📝 Step 3: Add the Wrapper Code
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--text-muted)' }}>
        Add this code to your {fw.label} {fw.icon} agent to route all tool calls through AgentGuard.
      </p>

      <div style={{ background: '#0f172a', borderRadius: '8px', marginBottom: '20px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #1e293b' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Python · {fw.label} Integration</span>
          <CopyButton text={snippet} />
        </div>
        <pre style={{
          margin: 0, padding: '16px',
          fontSize: '12px', lineHeight: '1.7',
          color: '#e2e8f0', fontFamily: 'monospace',
          overflow: 'auto', maxHeight: '320px',
        }}>
          {snippet}
        </pre>
      </div>

      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: '#4ade80' }}>
        💡 All tool calls are now evaluated by AgentGuard before execution. Blocked calls throw a <code>PermissionError</code>.
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={onBack} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: '14px' }}>
          ← Back
        </button>
        <button
          onClick={() => { trackStep(3, 'snippet_copied'); onNext(); }}
          style={{
            padding: '10px 24px', borderRadius: '8px', border: 'none',
            background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
          }}
        >
          I&apos;ve added the code →
        </button>
      </div>
    </div>
  );
}

function Step4TestEvent({
  onNext,
  onBack,
  apiKey,
}: {
  onNext: () => void;
  onBack: () => void;
  apiKey: string;
}) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  const apiUrl = (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000/v1');

  const handleSendTest = useCallback(async () => {
    setStatus('sending');
    setError('');
    try {
      const res = await fetch(`${apiUrl}/actions/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          toolName: 'test_tool',
          toolParams: { message: 'hello from onboarding wizard 👋' },
          actionType: 'tool_call',
          sessionId: `onboarding-${Date.now()}`,
        }),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        throw new Error((data as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
      }

      setResult(data);
      setStatus('success');
      trackStep(4, 'test_event_sent', { decision: data['decision'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test event');
      setStatus('error');
    }
  }, [apiKey, apiUrl]);

  return (
    <div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: 'var(--text-bright)' }}>
        🧪 Step 4: Send a Test Event
      </h2>
      <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Fire a test evaluation to verify your agent is connected. Check the{' '}
        <Link href="/audit" style={{ color: '#3b82f6' }}>Audit Log</Link> to see it appear in real-time.
      </p>

      {status === 'idle' && (
        <div style={{ background: 'var(--bg-page)', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            This will send a test <code>tool_call</code> evaluation to the AgentGuard API using your new API key.
          </div>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: '6px', padding: '12px', fontSize: '12px', overflow: 'auto', margin: 0 }}>
{`POST ${apiUrl}/actions/evaluate
Authorization: Bearer ${apiKey ? apiKey.slice(0, 20) + '...' : 'your-api-key'}

{
  "toolName": "test_tool",
  "toolParams": { "message": "hello from wizard 👋" },
  "actionType": "tool_call"
}`}
          </pre>
        </div>
      )}

      {status === 'success' && result && (
        <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#4ade80', marginBottom: '8px' }}>
            ✅ Event received by AgentGuard!
          </div>
          <div style={{ fontSize: '13px', color: '#4ade80', marginBottom: '12px' }}>
            Decision: <strong>{String(result['decision'])}</strong> · Risk Score: <strong>{String(result['riskScore'] ?? 'N/A')}</strong>
          </div>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: '6px', padding: '12px', fontSize: '11px', overflow: 'auto', maxHeight: '150px', margin: 0 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {status === 'error' && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', marginBottom: '20px', fontSize: '13px', color: '#dc2626' }}>
          ⚠ {error}
          <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
            Make sure your API URL is configured correctly in your environment ({apiUrl}).
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button onClick={onBack} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: '14px' }}>
          ← Back
        </button>
        {status !== 'success' && (
          <button
            onClick={() => void handleSendTest()}
            disabled={status === 'sending'}
            style={{
              padding: '10px 24px', borderRadius: '8px', border: 'none',
              background: status === 'error' ? '#dc2626' : '#3b82f6',
              color: '#fff', cursor: status === 'sending' ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 600, opacity: status === 'sending' ? 0.7 : 1,
            }}
          >
            {status === 'sending' ? '⏳ Sending…' : status === 'error' ? '🔄 Try Again' : '🚀 Send Test Event'}
          </button>
        )}
        <button
          onClick={() => { trackStep(4, 'step4_continue', { status }); onNext(); }}
          style={{
            padding: '10px 24px', borderRadius: '8px', border: 'none',
            background: status === 'success' ? '#16a34a' : '#e2e8f0',
            color: status === 'success' ? '#fff' : '#64748b',
            cursor: 'pointer', fontSize: '14px', fontWeight: 600,
          }}
        >
          {status === 'success' ? '🎉 Continue' : 'Skip →'}
        </button>
      </div>
    </div>
  );
}

function Step5Success({ framework }: { framework: Framework | null }) {
  useEffect(() => {
    trackStep(5, 'onboarding_complete', { framework });
    // Mark onboarding complete
    try { localStorage.setItem('ag_onboarding_done', '1'); } catch { /* ignore */ }
  }, [framework]);

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
      <h2 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>
        You&apos;re all set!
      </h2>
      <p style={{ margin: '0 0 32px', fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto' }}>
        AgentGuard is protecting your agents. Explore the dashboard to monitor events,
        manage policies, and review HITL approvals.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '32px' }}>
        {[
          { href: '/audit', icon: '📋', title: 'Audit Log', desc: 'See all agent actions' },
          { href: '/policies', icon: '📜', title: 'Policies', desc: 'Define security rules' },
          { href: '/hitl', icon: '👤', title: 'HITL Queue', desc: 'Review approvals' },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              display: 'block', padding: '16px', borderRadius: '10px', textDecoration: 'none',
              border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'inherit',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: '24px', marginBottom: '6px' }}>{link.icon}</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-bright)', marginBottom: '2px' }}>{link.title}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{link.desc}</div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <a
          href="https://docs.agentguard.tech"
          target="_blank"
          rel="noopener noreferrer"
          style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', textDecoration: 'none', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}
        >
          📚 Read the Docs
        </a>
        <a
          href="https://join.slack.com/agentguard"
          target="_blank"
          rel="noopener noreferrer"
          style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#4A154B', color: '#fff', textDecoration: 'none', fontSize: '14px', fontWeight: 500 }}
        >
          💬 Join Slack Community
        </a>
        <Link
          href="/"
          style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}
        >
          🏠 Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5;

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [framework, setFramework] = useState<Framework | null>(null);

  const goNext = useCallback(() => setStep((s) => Math.min(s + 1, TOTAL_STEPS)), []);
  const goBack = useCallback(() => setStep((s) => Math.max(s - 1, 1)), []);

  const isDone = step === TOTAL_STEPS;

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-bright)' }}>
            🚀 AgentGuard Setup
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
            Get your first agent protected in under 5 minutes.
          </p>
        </div>
        {!isDone && (
          <Link
            href="/"
            style={{ fontSize: '13px', color: '#94a3b8', textDecoration: 'none' }}
            onClick={() => trackStep(step, 'skip_clicked')}
          >
            I&apos;ll do this later →
          </Link>
        )}
      </div>

      {/* Progress */}
      {!isDone && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '20px 24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <ProgressBar step={step} total={TOTAL_STEPS} />
        </div>
      )}

      {/* Step content */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: '12px', padding: '32px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        {step === 1 && (
          <Step1GenerateKey onNext={goNext} setApiKey={setApiKey} apiKey={apiKey} />
        )}
        {step === 2 && (
          <Step2Framework onNext={goNext} onBack={goBack} framework={framework} setFramework={setFramework} />
        )}
        {step === 3 && framework && (
          <Step3Snippet onNext={goNext} onBack={goBack} framework={framework} apiKey={apiKey} />
        )}
        {step === 4 && (
          <Step4TestEvent onNext={goNext} onBack={goBack} apiKey={apiKey} />
        )}
        {step === 5 && (
          <Step5Success framework={framework} />
        )}
      </div>
    </div>
  );
}
