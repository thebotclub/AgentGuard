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
  blue: '#3b82f6',
  text: '#e2e8f0',
  textDim: '#94a3b8',
  textBright: '#f8fafc',
  border: 'rgba(99,102,241,0.25)',
  mono: 'JetBrains Mono, Fira Code, monospace',
  sans: 'Inter, system-ui, sans-serif',
};

function fadeIn(f: number, s: number, d = 15) {
  return interpolate(f, [s, s + d], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.ease) });
}
function slideUp(f: number, s: number, d = 20) {
  return interpolate(f, [s, s + d], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
}
function exit(f: number, s: number) {
  return interpolate(f, [s, s + 20], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

// ── Slide 1: Title (0-5s, 0-150f) ────────────────────────────────────────
const SlideTitle: React.FC<{ frame: number }> = ({ frame: f }) => (
  <AbsoluteFill style={{ background: C.bg, opacity: exit(f, 130), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 1200px 800px at 50% 50%, rgba(82,84,212,0.1) 0%, transparent 70%)` }} />
    <div style={{ textAlign: 'center', zIndex: 1 }}>
      <div style={{ opacity: fadeIn(f, 10), fontSize: 32, color: C.accentHi, fontFamily: C.mono, letterSpacing: '0.2em', marginBottom: 32 }}>
        🛡️ AGENTGUARD
      </div>
      <div style={{ opacity: fadeIn(f, 30), fontSize: 80, fontWeight: 800, color: C.textBright, fontFamily: C.sans, lineHeight: 1.1, letterSpacing: '-2px', marginBottom: 24 }}>
        Runtime Security<br />for AI Agents
      </div>
      <div style={{ opacity: fadeIn(f, 55), fontSize: 36, color: C.textDim, fontFamily: C.sans }}>
        Seed Round — March 2026
      </div>
    </div>
  </AbsoluteFill>
);

// ── Slide 2: Problem (5-12s, 150-360f) ───────────────────────────────────
const SlideProblem: React.FC<{ frame: number }> = ({ frame: f }) => (
  <AbsoluteFill style={{ background: C.bg, opacity: exit(f, 190) }}>
    <div style={{ padding: '60px 100px' }}>
      <div style={{ opacity: fadeIn(f, 5), fontSize: 20, color: C.accentHi, fontFamily: C.mono, letterSpacing: '0.15em', marginBottom: 16 }}>THE PROBLEM</div>
      <div style={{ opacity: fadeIn(f, 15), fontSize: 56, fontWeight: 700, color: C.textBright, fontFamily: C.sans, marginBottom: 48 }}>
        AI agents are shipping to production<br />with zero security controls
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32 }}>
        {[
          { num: '72%', label: 'of AI agents have no tool-level access controls', icon: '🔓', delay: 40 },
          { num: '$4.2B', label: 'estimated AI incident costs by 2027 (Gartner)', icon: '💸', delay: 70 },
          { num: 'Aug 2026', label: 'EU AI Act enforcement begins — fines up to 7% revenue', icon: '⚖️', delay: 100 },
        ].map((s) => (
          <div key={s.label} style={{
            opacity: fadeIn(f, s.delay), transform: `translateY(${slideUp(f, s.delay)}px)`,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '40px 32px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{s.icon}</div>
            <div style={{ fontSize: 52, fontWeight: 800, color: C.red, fontFamily: C.sans, marginBottom: 12 }}>{s.num}</div>
            <div style={{ fontSize: 24, color: C.textDim, fontFamily: C.sans, lineHeight: 1.4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  </AbsoluteFill>
);

// ── Slide 3: Solution (12-19s, 360-570f) ─────────────────────────────────
const SlideSolution: React.FC<{ frame: number }> = ({ frame: f }) => (
  <AbsoluteFill style={{ background: C.bg, opacity: exit(f, 190) }}>
    <div style={{ padding: '60px 100px' }}>
      <div style={{ opacity: fadeIn(f, 5), fontSize: 20, color: C.accentHi, fontFamily: C.mono, letterSpacing: '0.15em', marginBottom: 16 }}>THE SOLUTION</div>
      <div style={{ opacity: fadeIn(f, 15), fontSize: 56, fontWeight: 700, color: C.textBright, fontFamily: C.sans, marginBottom: 16 }}>
        Like container scanning, but for AI agents
      </div>
      <div style={{ opacity: fadeIn(f, 30), fontSize: 30, color: C.textDim, fontFamily: C.sans, marginBottom: 48 }}>
        Three enforcement points. One platform.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32 }}>
        {[
          { title: 'CI/CD Gate', desc: 'Block unsafe agents before they deploy. Scan tool usage, enforce 100% policy coverage in your pipeline.', icon: '🔬', color: C.accentHi, delay: 50 },
          { title: 'Runtime Guard', desc: 'Sub-millisecond evaluation of every tool call. Block, allow, or escalate to human approval.', icon: '⚡', color: C.green, delay: 80 },
          { title: 'Audit Trail', desc: 'SHA-256 hash chain logs every decision. Generate compliance evidence for EU AI Act, SOC 2, APRA.', icon: '📋', color: C.amber, delay: 110 },
        ].map((s) => (
          <div key={s.title} style={{
            opacity: fadeIn(f, s.delay), transform: `translateY(${slideUp(f, s.delay)}px)`,
            background: C.card, border: `1px solid ${C.border}`, borderTop: `3px solid ${s.color}`, borderRadius: 16, padding: '40px 32px',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{s.icon}</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: C.textBright, fontFamily: C.sans, marginBottom: 12 }}>{s.title}</div>
            <div style={{ fontSize: 24, color: C.textDim, fontFamily: C.sans, lineHeight: 1.5 }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  </AbsoluteFill>
);

// ── Slide 4: Market (19-26s, 570-780f) ───────────────────────────────────
const SlideMarket: React.FC<{ frame: number }> = ({ frame: f }) => {
  const barH = (pct: number, delay: number) => interpolate(f, [delay, delay + 30], [0, pct], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exit(f, 190) }}>
      <div style={{ padding: '60px 100px' }}>
        <div style={{ opacity: fadeIn(f, 5), fontSize: 20, color: C.accentHi, fontFamily: C.mono, letterSpacing: '0.15em', marginBottom: 16 }}>MARKET OPPORTUNITY</div>
        <div style={{ opacity: fadeIn(f, 15), fontSize: 56, fontWeight: 700, color: C.textBright, fontFamily: C.sans, marginBottom: 48 }}>
          $28B AI security market by 2028
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
          {/* Left: Market sizing bars */}
          <div>
            {[
              { label: 'TAM — AI Security', value: '$28B', pct: 100, color: C.accentHi, delay: 40 },
              { label: 'SAM — Agent Runtime Security', value: '$4.2B', pct: 15, color: C.blue, delay: 70 },
              { label: 'SOM — Initial (Regulated Industries)', value: '$840M', pct: 3, color: C.green, delay: 100 },
            ].map((m) => (
              <div key={m.label} style={{ opacity: fadeIn(f, m.delay), marginBottom: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 24, color: C.text, fontFamily: C.sans }}>{m.label}</span>
                  <span style={{ fontSize: 24, color: m.color, fontFamily: C.mono, fontWeight: 700 }}>{m.value}</span>
                </div>
                <div style={{ background: C.card, borderRadius: 8, height: 32, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                  <div style={{ width: `${barH(m.pct, m.delay)}%`, height: '100%', background: m.color, borderRadius: 8 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Right: Why now */}
          <div style={{ opacity: fadeIn(f, 60) }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: C.textBright, fontFamily: C.sans, marginBottom: 24 }}>Why Now</div>
            {[
              { text: 'EU AI Act enforcement begins August 2026', icon: '⚖️', delay: 80 },
              { text: 'Agent frameworks (LangChain, CrewAI) exploding — 10x growth in 12 months', icon: '📈', delay: 100 },
              { text: 'First wave of AI incidents hitting regulated industries', icon: '🚨', delay: 120 },
              { text: 'No incumbent — container security vendors haven\'t pivoted yet', icon: '🎯', delay: 140 },
            ].map((w) => (
              <div key={w.text} style={{
                opacity: fadeIn(f, w.delay),
                display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20,
                fontSize: 24, color: C.text, fontFamily: C.sans, lineHeight: 1.4,
              }}>
                <span style={{ fontSize: 28, flexShrink: 0 }}>{w.icon}</span>
                <span>{w.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Slide 5: Traction (26-33s, 780-990f) ─────────────────────────────────
const SlideTraction: React.FC<{ frame: number }> = ({ frame: f }) => (
  <AbsoluteFill style={{ background: C.bg, opacity: exit(f, 190) }}>
    <div style={{ padding: '60px 100px' }}>
      <div style={{ opacity: fadeIn(f, 5), fontSize: 20, color: C.accentHi, fontFamily: C.mono, letterSpacing: '0.15em', marginBottom: 16 }}>TRACTION & PRODUCT</div>
      <div style={{ opacity: fadeIn(f, 15), fontSize: 56, fontWeight: 700, color: C.textBright, fontFamily: C.sans, marginBottom: 48 }}>
        Built and shipped in 48 hours
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
        {/* Left: Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {[
            { num: 'v0.6', label: 'Production release', color: C.green, delay: 30 },
            { num: '5', label: 'Policy templates', color: C.accentHi, delay: 50 },
            { num: '<1ms', label: 'Evaluation latency', color: C.amber, delay: 70 },
            { num: '116+', label: 'Tests passing', color: C.blue, delay: 90 },
            { num: '3', label: 'SDKs (Node, Python, CLI)', color: C.green, delay: 110 },
            { num: '6', label: 'Live endpoints', color: C.accentHi, delay: 130 },
          ].map((s) => (
            <div key={s.label} style={{
              opacity: fadeIn(f, s.delay), transform: `translateY(${slideUp(f, s.delay)}px)`,
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 44, fontWeight: 800, color: s.color, fontFamily: C.sans }}>{s.num}</div>
              <div style={{ fontSize: 20, color: C.textDim, fontFamily: C.sans, marginTop: 8 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Right: Stack */}
        <div style={{ opacity: fadeIn(f, 50) }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: C.textBright, fontFamily: C.sans, marginBottom: 24 }}>Tech Stack</div>
          {[
            { label: 'Backend', value: 'TypeScript + Express', delay: 60 },
            { label: 'Database', value: 'PostgreSQL (Azure)', delay: 75 },
            { label: 'Auth', value: 'bcrypt + SHA-256 fast lookup', delay: 90 },
            { label: 'Security', value: 'Zod validation + Row-Level Security', delay: 105 },
            { label: 'Audit', value: 'SHA-256 hash chain (tamper-evident)', delay: 120 },
            { label: 'CI/CD', value: 'GitHub Actions + CLI scanner', delay: 135 },
            { label: 'Infra', value: 'Azure Container Apps + Cloudflare', delay: 150 },
            { label: 'Packages', value: 'npm + PyPI (published)', delay: 165 },
          ].map((t) => (
            <div key={t.label} style={{
              opacity: fadeIn(f, t.delay),
              display: 'flex', justifyContent: 'space-between', padding: '10px 0',
              borderBottom: `1px solid ${C.border}`,
              fontSize: 24, fontFamily: C.mono,
            }}>
              <span style={{ color: C.textDim }}>{t.label}</span>
              <span style={{ color: C.text }}>{t.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

// ── Slide 6: Business Model (33-40s, 990-1200f) ─────────────────────────
const SlideBusinessModel: React.FC<{ frame: number }> = ({ frame: f }) => (
  <AbsoluteFill style={{ background: C.bg, opacity: exit(f, 190) }}>
    <div style={{ padding: '60px 100px' }}>
      <div style={{ opacity: fadeIn(f, 5), fontSize: 20, color: C.accentHi, fontFamily: C.mono, letterSpacing: '0.15em', marginBottom: 16 }}>BUSINESS MODEL</div>
      <div style={{ opacity: fadeIn(f, 15), fontSize: 56, fontWeight: 700, color: C.textBright, fontFamily: C.sans, marginBottom: 48 }}>
        Usage-based SaaS + Enterprise tiers
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32 }}>
        {[
          {
            tier: 'Free', price: '$0', period: '/month', color: C.textDim,
            features: ['1,000 evaluations/mo', '1 agent', 'Community support', 'Basic dashboard'],
            delay: 30,
          },
          {
            tier: 'Pro', price: '$99', period: '/month', color: C.accentHi,
            features: ['50,000 evaluations/mo', 'Unlimited agents', 'CI/CD integration', 'Priority support', 'Compliance reports'],
            delay: 60, featured: true,
          },
          {
            tier: 'Enterprise', price: 'Custom', period: '', color: C.amber,
            features: ['Unlimited evaluations', 'On-prem / VPC deploy', 'SOC 2 + EU AI Act reports', 'Dedicated support', 'Custom policies', 'SSO / SAML'],
            delay: 90,
          },
        ].map((t) => (
          <div key={t.tier} style={{
            opacity: fadeIn(f, t.delay), transform: `translateY(${slideUp(f, t.delay)}px)`,
            background: C.card,
            border: `1px solid ${(t as any).featured ? C.accentHi : C.border}`,
            borderRadius: 16, padding: '40px 32px',
            position: 'relative',
          }}>
            {(t as any).featured && (
              <div style={{
                position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                background: C.accent, borderRadius: 100, padding: '4px 20px',
                fontSize: 16, fontFamily: C.mono, color: '#fff', fontWeight: 700,
              }}>MOST POPULAR</div>
            )}
            <div style={{ fontSize: 28, fontWeight: 700, color: t.color, fontFamily: C.sans, marginBottom: 8 }}>{t.tier}</div>
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 48, fontWeight: 800, color: C.textBright, fontFamily: C.sans }}>{t.price}</span>
              <span style={{ fontSize: 24, color: C.textDim, fontFamily: C.sans }}>{t.period}</span>
            </div>
            {t.features.map((feat) => (
              <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 22, color: C.text, fontFamily: C.sans }}>
                <span style={{ color: C.green }}>✓</span> {feat}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  </AbsoluteFill>
);

// ── Slide 7: Ask (40-45s, 1200-1350f) ────────────────────────────────────
const SlideAsk: React.FC<{ frame: number }> = ({ frame: f }) => (
  <AbsoluteFill style={{ background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 1400px 900px at 50% 50%, rgba(82,84,212,0.12) 0%, transparent 70%)` }} />
    <div style={{ textAlign: 'center', zIndex: 1, maxWidth: 1000 }}>
      <div style={{ opacity: fadeIn(f, 10), fontSize: 24, color: C.accentHi, fontFamily: C.mono, letterSpacing: '0.15em', marginBottom: 24 }}>THE ASK</div>
      <div style={{ opacity: fadeIn(f, 25), fontSize: 72, fontWeight: 800, color: C.textBright, fontFamily: C.sans, marginBottom: 20, letterSpacing: '-2px' }}>
        Seed Round
      </div>
      <div style={{ opacity: fadeIn(f, 45), fontSize: 38, color: C.textDim, fontFamily: C.sans, marginBottom: 48, lineHeight: 1.5 }}>
        Hiring engineering + GTM. First-mover in agent runtime security<br />
        before EU AI Act enforcement in August 2026.
      </div>

      <div style={{ opacity: fadeIn(f, 70), display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32, marginBottom: 48 }}>
        {[
          { label: 'Use of Funds', items: ['Engineering (60%)', 'GTM / Sales (25%)', 'Ops / Legal (15%)'] },
          { label: 'Milestones — 12mo', items: ['50 paying customers', 'SOC 2 Type II', '$500K ARR'] },
          { label: 'Competitive Edge', items: ['First to market', 'Runtime + deploy-time', 'Compliance built in'] },
        ].map((col) => (
          <div key={col.label} style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.accentHi, fontFamily: C.sans, marginBottom: 16 }}>{col.label}</div>
            {col.items.map((item) => (
              <div key={item} style={{ fontSize: 24, color: C.text, fontFamily: C.sans, marginBottom: 10, display: 'flex', gap: 10 }}>
                <span style={{ color: C.green }}>→</span> {item}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ opacity: fadeIn(f, 100), display: 'flex', gap: 32, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ background: C.accent, borderRadius: 12, padding: '20px 48px', fontSize: 32, fontFamily: C.sans, fontWeight: 700, color: '#fff' }}>
          Let's Talk
        </div>
        <div style={{ fontSize: 32, fontFamily: C.mono, color: C.accentHi }}>
          agentguard.tech
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

// ── Root ──────────────────────────────────────────────────────────────────
export const InvestorDeck: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {frame < 150 && <SlideTitle frame={frame} />}
      {frame >= 140 && frame < 360 && <SlideProblem frame={frame - 150} />}
      {frame >= 350 && frame < 570 && <SlideSolution frame={frame - 360} />}
      {frame >= 560 && frame < 780 && <SlideMarket frame={frame - 570} />}
      {frame >= 770 && frame < 990 && <SlideTraction frame={frame - 780} />}
      {frame >= 980 && frame < 1200 && <SlideBusinessModel frame={frame - 990} />}
      {frame >= 1190 && <SlideAsk frame={frame - 1200} />}
    </AbsoluteFill>
  );
};
