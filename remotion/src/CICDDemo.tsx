import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from 'remotion';
import React from 'react';

const C = {
  bg: '#0d1117',       // GitHub dark
  card: '#161b22',
  accent: '#5254d4',
  accentHi: '#818cf8',
  green: '#3fb950',
  red: '#f85149',
  amber: '#d29922',
  blue: '#58a6ff',
  text: '#e6edf3',
  textDim: '#8b949e',
  border: '#30363d',
  mono: 'JetBrains Mono, Fira Code, monospace',
  sans: 'Inter, system-ui, sans-serif',
};

function fadeIn(frame: number, start: number, duration = 15) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.ease),
  });
}

function slideRight(frame: number, start: number, duration = 20) {
  return interpolate(frame, [start, start + duration], [-30, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
}

// ── Progress bar ──────────────────────────────────────────────────────────
const ProgressBar: React.FC<{ width: number; color: string }> = ({ width, color }) => (
  <div style={{ background: C.border, borderRadius: 4, height: 8, overflow: 'hidden', marginTop: 4 }}>
    <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
  </div>
);

// ── Step row ──────────────────────────────────────────────────────────────
const Step: React.FC<{ icon: string; label: string; status: 'done' | 'running' | 'fail' | 'pending'; opacity: number; translateX: number; duration?: string }> = ({
  icon, label, status, opacity, translateX, duration
}) => {
  const statusColor = { done: C.green, running: C.blue, fail: C.red, pending: C.textDim }[status];
  const statusIcon = { done: '✓', running: '●', fail: '✕', pending: '○' }[status];

  return (
    <div style={{
      opacity, transform: `translateX(${translateX}px)`,
      display: 'flex', alignItems: 'center', gap: 20,
      padding: '16px 24px', borderRadius: 8,
      background: status === 'running' ? `${C.blue}0f` : status === 'fail' ? `${C.red}0f` : 'transparent',
      border: `1px solid ${status === 'running' ? `${C.blue}40` : status === 'fail' ? `${C.red}40` : 'transparent'}`,
      marginBottom: 8,
    }}>
      <div style={{ fontSize: 28, width: 36, textAlign: 'center' }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 26, fontFamily: C.mono, color: C.text }}>{label}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {duration && <div style={{ fontSize: 22, fontFamily: C.mono, color: C.textDim }}>{duration}</div>}
        <div style={{
          fontSize: 24, fontFamily: C.mono, color: statusColor, fontWeight: 700,
          width: 28, textAlign: 'center',
        }}>{statusIcon}</div>
      </div>
    </div>
  );
};

// ── Scene 1: Commit pushed (0-2s, 0-60f) ─────────────────────────────────
const Scene1Commit: React.FC<{ frame: number }> = ({ frame: f }) => {
  const exit = interpolate(f, [50, 60], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exit, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ opacity: fadeIn(f, 5), fontSize: 56, marginBottom: 24 }}>⚡</div>
        <div style={{ opacity: fadeIn(f, 15), fontSize: 64, fontWeight: 700, color: C.text, fontFamily: C.sans, marginBottom: 16 }}>
          git push origin main
        </div>
        <div style={{ opacity: fadeIn(f, 30), fontSize: 36, color: C.textDim, fontFamily: C.mono }}>
          → AgentGuard CI gate triggered
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 2: GitHub Actions UI (2-14s, 60-420f) ──────────────────────────
const Scene2GHActions: React.FC<{ frame: number }> = ({ frame: f }) => {
  const exit = interpolate(f, [340, 360], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Steps appear progressively
  const steps = [
    { icon: '📦', label: 'Checkout', status: 'done' as const, delay: 10, duration: '1s' },
    { icon: '🔬', label: 'AgentGuard — Scan tool usage', status: 'done' as const, delay: 50, duration: '3s' },
    { icon: '📊', label: 'AgentGuard — Check policy coverage', status: f < 180 ? 'running' as const : 'fail' as const, delay: 90, duration: f < 180 ? undefined : '2s' },
    { icon: '🚀', label: 'Deploy to Production', status: 'pending' as const, delay: 130 },
  ];

  // Coverage bar animates
  const coveragePct = interpolate(f, [100, 180], [0, 60], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exit }}>
      {/* GitHub-style header */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '20px 60px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ fontSize: 28, fontFamily: C.mono, color: C.textDim }}>AgentGuard-tech / agentguard</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 24, fontFamily: C.mono, color: C.textDim }}>Actions</div>
      </div>

      <div style={{ padding: '40px 80px' }}>
        {/* Workflow title */}
        <div style={{ opacity: fadeIn(f, 5), marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: f < 180 ? C.blue : C.red }} />
            <div style={{ fontSize: 36, fontWeight: 700, color: C.text, fontFamily: C.sans }}>
              🛡️ AgentGuard Policy Coverage
            </div>
          </div>
          <div style={{ fontSize: 24, color: C.textDim, fontFamily: C.mono, marginLeft: 40 }}>
            feat: add booking agent — push to main by developer
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 40 }}>
          {/* Left: Steps */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '32px 24px' }}>
            <div style={{ fontSize: 26, fontWeight: 600, color: C.textDim, fontFamily: C.sans, marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              agentguard-validate
            </div>
            {steps.map((s) => (
              <Step key={s.label} {...s}
                opacity={fadeIn(f, s.delay)}
                translateX={slideRight(f, s.delay)}
              />
            ))}
          </div>

          {/* Right: Coverage output */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '32px 24px' }}>
            <div style={{ fontSize: 26, fontWeight: 600, color: C.textDim, fontFamily: C.sans, marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Coverage Report
            </div>

            {f > 90 && (
              <div>
                {[
                  { tool: 'file_read', policy: 'monitor', covered: true, delay: 100 },
                  { tool: 'file_write', policy: 'block', covered: true, delay: 120 },
                  { tool: 'db_query', policy: 'monitor', covered: true, delay: 140 },
                  { tool: 'shell_exec', policy: '—', covered: false, delay: 155 },
                  { tool: 'http_post', policy: '—', covered: false, delay: 165 },
                ].map((t) => (
                  <div key={t.tool} style={{
                    opacity: fadeIn(f, t.delay),
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: `1px solid ${C.border}`,
                    fontSize: 24, fontFamily: C.mono,
                  }}>
                    <span style={{ color: C.text }}>{t.tool}</span>
                    <span style={{ color: C.textDim, width: 100 }}>{t.policy}</span>
                    <span style={{ color: t.covered ? C.green : C.red }}>
                      {t.covered ? '✅ covered' : '❌ uncovered'}
                    </span>
                  </div>
                ))}

                {f > 170 && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, fontFamily: C.mono, color: C.amber, marginBottom: 8 }}>
                      <span>Coverage</span>
                      <span style={{ fontWeight: 700 }}>{Math.round(coveragePct)}% (3/5 tools)</span>
                    </div>
                    <ProgressBar width={coveragePct} color={C.amber} />

                    {f > 220 && (
                      <div style={{
                        opacity: fadeIn(f, 220),
                        marginTop: 24,
                        background: `${C.red}15`,
                        border: `1px solid ${C.red}40`,
                        borderRadius: 8,
                        padding: '16px 20px',
                        fontSize: 24,
                        fontFamily: C.mono,
                        color: C.red,
                        lineHeight: 1.5,
                      }}>
                        ❌ FAIL: Coverage 60% &lt; required 100%<br />
                        Add policies: shell_exec, http_post<br />
                        Deploy blocked.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 3: Fix + Pass (14-20s, 420-600f) ───────────────────────────────
const Scene3Fixed: React.FC<{ frame: number }> = ({ frame: f }) => {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '20px 60px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ fontSize: 28, fontFamily: C.mono, color: C.textDim }}>AgentGuard-tech / agentguard</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 24, fontFamily: C.mono, color: C.textDim }}>Actions</div>
      </div>

      <div style={{ padding: '40px 80px' }}>
        <div style={{ opacity: fadeIn(f, 5), marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: C.green }} />
            <div style={{ fontSize: 36, fontWeight: 700, color: C.text, fontFamily: C.sans }}>
              🛡️ AgentGuard Policy Coverage
            </div>
          </div>
          <div style={{ fontSize: 24, color: C.textDim, fontFamily: C.mono, marginLeft: 40 }}>
            fix: add shell_exec + http_post policies — push to main by developer
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 40 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '32px 24px' }}>
            <div style={{ fontSize: 26, fontWeight: 600, color: C.textDim, fontFamily: C.sans, marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              agentguard-validate
            </div>
            {[
              { icon: '📦', label: 'Checkout', duration: '1s' },
              { icon: '🔬', label: 'AgentGuard — Scan tool usage', duration: '3s' },
              { icon: '📊', label: 'AgentGuard — Check policy coverage', duration: '2s' },
              { icon: '🚀', label: 'Deploy to Production', duration: '45s' },
            ].map((s, i) => (
              <Step key={s.label} {...s} status="done"
                opacity={fadeIn(f, i * 25)}
                translateX={slideRight(f, i * 25)}
              />
            ))}
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '32px 24px' }}>
            <div style={{ fontSize: 26, fontWeight: 600, color: C.textDim, fontFamily: C.sans, marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Coverage Report
            </div>
            {[
              { tool: 'file_read', policy: 'monitor' },
              { tool: 'file_write', policy: 'block' },
              { tool: 'db_query', policy: 'monitor' },
              { tool: 'shell_exec', policy: 'block' },
              { tool: 'http_post', policy: 'block' },
            ].map((t, i) => (
              <div key={t.tool} style={{
                opacity: fadeIn(f, 20 + i * 15),
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: `1px solid ${C.border}`,
                fontSize: 24, fontFamily: C.mono,
              }}>
                <span style={{ color: C.text }}>{t.tool}</span>
                <span style={{ color: C.textDim, width: 100 }}>{t.policy}</span>
                <span style={{ color: C.green }}>✅ covered</span>
              </div>
            ))}

            <div style={{ opacity: fadeIn(f, 120), marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, fontFamily: C.mono, color: C.green, marginBottom: 8, fontWeight: 700 }}>
                <span>Coverage</span><span>100% (5/5 tools)</span>
              </div>
              <ProgressBar width={100} color={C.green} />

              <div style={{
                opacity: fadeIn(f, 140),
                marginTop: 24, background: `${C.green}15`,
                border: `1px solid ${C.green}40`, borderRadius: 8,
                padding: '16px 20px', fontSize: 24, fontFamily: C.mono, color: C.green, lineHeight: 1.5,
              }}>
                ✅ PASS: 100% policy coverage<br />
                All 5 tools covered<br />
                Deploying to production...
              </div>
            </div>
          </div>
        </div>

        {/* Final stamp */}
        {f > 150 && (
          <div style={{
            opacity: fadeIn(f, 150),
            position: 'absolute', bottom: 60, left: 0, right: 0,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, color: C.textDim, fontFamily: C.sans }}>
              No unsafe agent ships without a passing AgentGuard check.
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: C.accentHi, fontFamily: C.sans, marginTop: 12 }}>
              agentguard.tech
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ── Composition ───────────────────────────────────────────────────────────
export const CICDDemo: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {frame < 60 && <Scene1Commit frame={frame} />}
      {frame >= 50 && frame < 420 && <Scene2GHActions frame={frame - 60} />}
      {frame >= 410 && <Scene3Fixed frame={frame - 420} />}
    </AbsoluteFill>
  );
};
