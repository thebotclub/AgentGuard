import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from 'remotion';
import React from 'react';

const C = {
  bg: '#0a0a1a',
  card: '#111128',
  accent: '#5254d4',
  accentHi: '#818cf8',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  text: '#e2e8f0',
  textDim: '#94a3b8',
  textBright: '#f8fafc',
  border: 'rgba(99,102,241,0.25)',
  mono: 'JetBrains Mono, Fira Code, monospace',
  sans: 'Inter, system-ui, sans-serif',
};

function fadeIn(frame: number, start: number, dur = 15) {
  return interpolate(frame, [start, start + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.ease) });
}
function slideUp(frame: number, start: number, dur = 20) {
  return interpolate(frame, [start, start + dur], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
}

// ── Scene 1: Title card (0-4s, 0-120f) ────────────────────────────────────
const SceneTitle: React.FC<{ frame: number }> = ({ frame: f }) => {
  const exit = interpolate(f, [100, 120], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exit, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ opacity: fadeIn(f, 10), fontSize: 32, color: C.accentHi, fontFamily: C.mono, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 24 }}>
          AGENTGUARD
        </div>
        <div style={{ opacity: fadeIn(f, 25), fontSize: 72, fontWeight: 800, color: C.textBright, fontFamily: C.sans, lineHeight: 1.2 }}>
          Before &amp; After
        </div>
        <div style={{ opacity: fadeIn(f, 45), fontSize: 36, color: C.textDim, fontFamily: C.sans, marginTop: 16 }}>
          What happens when your AI agent goes rogue?
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 2: Before — The Incident (4-20s, 120-600f) ──────────────────────
const ChatBubble: React.FC<{ text: string; isUser: boolean; opacity: number; y: number }> = ({ text, isUser, opacity, y }) => (
  <div style={{
    opacity, transform: `translateY(${y}px)`,
    display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
    marginBottom: 16,
  }}>
    <div style={{
      background: isUser ? C.accent : C.card,
      border: `1px solid ${isUser ? C.accent : C.border}`,
      borderRadius: 16,
      borderBottomRightRadius: isUser ? 4 : 16,
      borderBottomLeftRadius: isUser ? 16 : 4,
      padding: '16px 24px',
      maxWidth: '75%',
      fontSize: 24,
      fontFamily: C.sans,
      color: C.text,
      lineHeight: 1.5,
    }}>
      {text}
    </div>
  </div>
);

const SceneBefore: React.FC<{ frame: number }> = ({ frame: f }) => {
  const exit = interpolate(f, [460, 480], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const messages = [
    { text: '🧑 User: "Delete all inactive accounts from the database"', isUser: true, delay: 10 },
    { text: '🤖 Agent: Sure! Running db_query: DELETE FROM users WHERE last_login < \'2024-01-01\'', isUser: false, delay: 50 },
    { text: '🤖 Agent: Done! Deleted 14,847 user accounts.', isUser: false, delay: 100 },
    { text: '🧑 User: "Wait... I meant deactivate, not delete!"', isUser: true, delay: 160 },
    { text: '🤖 Agent: I\'m sorry, the DELETE was already executed. There is no undo.', isUser: false, delay: 210 },
  ];

  // Terminal showing the damage
  const termLines = [
    { text: '$ psql agentguard_prod', color: C.textDim, delay: 270 },
    { text: '', color: C.textDim, delay: 280 },
    { text: 'agentguard_prod=# SELECT count(*) FROM users;', color: C.text, delay: 290 },
    { text: '  count: 2,153   (was 17,000)', color: C.red, delay: 310 },
    { text: '', color: C.textDim, delay: 320 },
    { text: 'agentguard_prod=# SELECT * FROM audit_log;', color: C.text, delay: 330 },
    { text: '  0 rows — no audit trail exists', color: C.red, delay: 350 },
    { text: '', color: C.textDim, delay: 360 },
    { text: '-- No record of what happened, who asked, or why.', color: C.amber, delay: 380 },
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exit }}>
      <div style={{ padding: '40px 80px' }}>
        <div style={{ opacity: fadeIn(f, 5), display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{ fontSize: 20, fontFamily: C.mono, color: C.red, background: `${C.red}22`, border: `1px solid ${C.red}44`, borderRadius: 6, padding: '6px 16px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
            WITHOUT AGENTGUARD
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
          {/* Left: Chat */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32 }}>
            <div style={{ fontSize: 22, color: C.textDim, fontFamily: C.sans, marginBottom: 24, fontWeight: 600 }}>Agent Chat</div>
            {messages.map((m, i) => (
              <ChatBubble key={i} text={m.text} isUser={m.isUser} opacity={fadeIn(f, m.delay)} y={slideUp(f, m.delay)} />
            ))}
          </div>

          {/* Right: Terminal */}
          <div>
            <div style={{
              opacity: fadeIn(f, 260),
              background: '#050510', border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden',
            }}>
              <div style={{ background: '#1a1a2e', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c941' }} />
                <span style={{ marginLeft: 12, fontSize: 18, fontFamily: C.mono, color: C.textDim }}>Aftermath</span>
              </div>
              <div style={{ padding: '24px 28px' }}>
                {termLines.map((l, i) => (
                  <div key={i} style={{ opacity: fadeIn(f, l.delay), fontSize: 22, fontFamily: C.mono, color: l.color, lineHeight: 1.7 }}>
                    {l.text || '\u00A0'}
                  </div>
                ))}
              </div>
            </div>

            {/* Cost callout */}
            {f > 400 && (
              <div style={{
                opacity: fadeIn(f, 400),
                marginTop: 24, background: `${C.red}15`, border: `1px solid ${C.red}40`,
                borderRadius: 12, padding: '24px 28px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 48, fontWeight: 800, color: C.red, fontFamily: C.sans }}>$2.3M</div>
                <div style={{ fontSize: 22, color: C.textDim, fontFamily: C.sans, marginTop: 8 }}>
                  Estimated cost: data recovery + GDPR fines + customer churn
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 3: After — With AgentGuard (20-36s, 600-1080f) ──────────────────
const SceneAfter: React.FC<{ frame: number }> = ({ frame: f }) => {
  const exit = interpolate(f, [460, 480], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const messages = [
    { text: '🧑 User: "Delete all inactive accounts from the database"', isUser: true, delay: 10 },
    { text: '🤖 Agent: Evaluating tool call: db_query → DELETE FROM users...', isUser: false, delay: 50 },
  ];

  const evalLines = [
    { text: '→ AgentGuard evaluate:', color: C.accentHi, delay: 80 },
    { text: '  tool:     db_query', color: C.text, delay: 95 },
    { text: '  action:   DELETE FROM users WHERE ...', color: C.text, delay: 110 },
    { text: '  policy:   "block destructive writes"', color: C.amber, delay: 125 },
    { text: '  latency:  0.4ms', color: C.textDim, delay: 140 },
    { text: '', color: C.textDim, delay: 145 },
    { text: '  result:   ██ BLOCK ██', color: C.red, delay: 155 },
    { text: '  reason:   "DELETE on users table requires', color: C.amber, delay: 170 },
    { text: '             human approval (policy: P-003)"', color: C.amber, delay: 185 },
  ];

  const afterMessages = [
    { text: '🛡️ AgentGuard blocked this action. DELETE on production tables requires human approval. Would you like to request approval?', isUser: false, delay: 220 },
    { text: '🧑 User: "Actually, just deactivate them instead"', isUser: true, delay: 270 },
    { text: '🤖 Agent: Running db_query: UPDATE users SET active=false WHERE last_login < \'2024-01-01\'', isUser: false, delay: 310 },
  ];

  const evalLines2 = [
    { text: '', color: C.textDim, delay: 320 },
    { text: '→ AgentGuard evaluate:', color: C.accentHi, delay: 330 },
    { text: '  tool:     db_query', color: C.text, delay: 340 },
    { text: '  action:   UPDATE users SET active=false ...', color: C.text, delay: 350 },
    { text: '  result:   ✅ ALLOW (monitor)', color: C.green, delay: 365 },
    { text: '  logged:   sha256:a4f2...c891 (chain #1847)', color: C.textDim, delay: 380 },
  ];

  const finalMessage = { text: '🤖 Agent: Done! Deactivated 14,847 accounts. All records logged to audit trail.', isUser: false, delay: 400 };

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exit }}>
      <div style={{ padding: '40px 80px' }}>
        <div style={{ opacity: fadeIn(f, 5), display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{ fontSize: 20, fontFamily: C.mono, color: C.green, background: `${C.green}22`, border: `1px solid ${C.green}44`, borderRadius: 6, padding: '6px 16px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
            WITH AGENTGUARD
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
          {/* Left: Chat */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 22, color: C.textDim, fontFamily: C.sans, marginBottom: 24, fontWeight: 600 }}>Agent Chat</div>
            {messages.map((m, i) => (
              <ChatBubble key={i} text={m.text} isUser={m.isUser} opacity={fadeIn(f, m.delay)} y={slideUp(f, m.delay)} />
            ))}
            {afterMessages.map((m, i) => (
              <ChatBubble key={`a${i}`} text={m.text} isUser={m.isUser} opacity={fadeIn(f, m.delay)} y={slideUp(f, m.delay)} />
            ))}
            <ChatBubble text={finalMessage.text} isUser={finalMessage.isUser} opacity={fadeIn(f, finalMessage.delay)} y={slideUp(f, finalMessage.delay)} />
          </div>

          {/* Right: AgentGuard evaluation */}
          <div>
            <div style={{
              opacity: fadeIn(f, 70),
              background: '#050510', border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden',
            }}>
              <div style={{ background: '#1a1a2e', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c941' }} />
                <span style={{ marginLeft: 12, fontSize: 18, fontFamily: C.mono, color: C.accentHi }}>🛡️ AgentGuard Runtime</span>
              </div>
              <div style={{ padding: '24px 28px' }}>
                {[...evalLines, ...evalLines2].map((l, i) => (
                  <div key={i} style={{ opacity: fadeIn(f, l.delay), fontSize: 21, fontFamily: C.mono, color: l.color, lineHeight: 1.7 }}>
                    {l.text || '\u00A0'}
                  </div>
                ))}
              </div>
            </div>

            {/* Saved callout */}
            {f > 420 && (
              <div style={{
                opacity: fadeIn(f, 420),
                marginTop: 24, background: `${C.green}15`, border: `1px solid ${C.green}40`,
                borderRadius: 12, padding: '24px 28px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 48, fontWeight: 800, color: C.green, fontFamily: C.sans }}>$0 damage</div>
                <div style={{ fontSize: 22, color: C.textDim, fontFamily: C.sans, marginTop: 8 }}>
                  Dangerous action blocked • User corrected intent • Full audit trail
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 4: Side-by-side summary (36-42s, 1080-1260f) ───────────────────
const SceneCompare: React.FC<{ frame: number }> = ({ frame: f }) => {
  const exit = interpolate(f, [160, 180], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const rows = [
    { label: 'Dangerous tool call', without: 'Executed immediately', withAG: 'Blocked at runtime', delay: 30 },
    { label: 'User intent', without: 'Misinterpreted', withAG: 'Corrected before damage', delay: 60 },
    { label: 'Data loss', without: '14,847 records deleted', withAG: 'Zero records lost', delay: 90 },
    { label: 'Audit trail', without: 'None', withAG: 'SHA-256 hash chain', delay: 120 },
    { label: 'Cost', without: '$2.3M', withAG: '$0', delay: 150 },
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exit, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 1100 }}>
        <div style={{ opacity: fadeIn(f, 5), textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 56, fontWeight: 700, color: C.textBright, fontFamily: C.sans }}>The difference is clear.</div>
        </div>

        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ padding: '20px 28px', fontSize: 22, fontFamily: C.sans, color: C.textDim, fontWeight: 600 }}></div>
            <div style={{ padding: '20px 28px', fontSize: 22, fontFamily: C.sans, color: C.red, fontWeight: 700, textAlign: 'center', background: `${C.red}0a` }}>Without</div>
            <div style={{ padding: '20px 28px', fontSize: 22, fontFamily: C.sans, color: C.green, fontWeight: 700, textAlign: 'center', background: `${C.green}0a` }}>With AgentGuard</div>
          </div>
          {rows.map((r) => (
            <div key={r.label} style={{
              opacity: fadeIn(f, r.delay),
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{ padding: '18px 28px', fontSize: 24, fontFamily: C.sans, color: C.text, fontWeight: 600 }}>{r.label}</div>
              <div style={{ padding: '18px 28px', fontSize: 24, fontFamily: C.mono, color: C.red, textAlign: 'center', background: `${C.red}05` }}>{r.without}</div>
              <div style={{ padding: '18px 28px', fontSize: 24, fontFamily: C.mono, color: C.green, textAlign: 'center', background: `${C.green}05` }}>{r.withAG}</div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 5: CTA (42-45s, 1260-1350f) ─────────────────────────────────────
const SceneCTA: React.FC<{ frame: number }> = ({ frame: f }) => (
  <AbsoluteFill style={{ background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 1400px 900px at 50% 50%, rgba(82,84,212,0.12) 0%, transparent 70%)` }} />
    <div style={{ textAlign: 'center', zIndex: 1 }}>
      <div style={{ opacity: fadeIn(f, 10), fontSize: 80, fontWeight: 800, color: C.textBright, fontFamily: C.sans, marginBottom: 20 }}>
        Don't ship without it.
      </div>
      <div style={{ opacity: fadeIn(f, 35), fontSize: 38, color: C.textDim, fontFamily: C.sans, marginBottom: 60 }}>
        Runtime enforcement. Deployment gates. Compliance built in.
      </div>
      <div style={{ opacity: fadeIn(f, 60), display: 'flex', gap: 32, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ background: C.accent, borderRadius: 12, padding: '24px 56px', fontSize: 36, fontFamily: C.sans, fontWeight: 700, color: '#fff' }}>
          Get Started Free
        </div>
        <div style={{ fontSize: 36, fontFamily: C.mono, color: C.accentHi }}>
          agentguard.tech
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

// ── Root ──────────────────────────────────────────────────────────────────
export const ProductDemo: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {frame < 120 && <SceneTitle frame={frame} />}
      {frame >= 110 && frame < 600 && <SceneBefore frame={frame - 120} />}
      {frame >= 590 && frame < 1080 && <SceneAfter frame={frame - 600} />}
      {frame >= 1070 && frame < 1260 && <SceneCompare frame={frame - 1080} />}
      {frame >= 1250 && <SceneCTA frame={frame - 1260} />}
    </AbsoluteFill>
  );
};
