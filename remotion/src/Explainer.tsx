import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
} from 'remotion';
import React from 'react';

// ── Design tokens ─────────────────────────────────────────────────────────
const C = {
  bg: '#0a0a1a',
  card: '#111128',
  accent: '#5254d4',
  accentHi: '#818cf8',
  accentDim: 'rgba(82,84,212,0.15)',
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

// ── Helpers ───────────────────────────────────────────────────────────────
function fadeIn(frame: number, start: number, duration = 20) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.ease),
  });
}

function slideUp(frame: number, start: number, duration = 25) {
  return interpolate(frame, [start, start + duration], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
}

function useSpring(frame: number, start: number) {
  const { fps } = useVideoConfig();
  return spring({ frame: frame - start, fps, config: { damping: 14, stiffness: 100 } });
}

// ── Scene 1: Hook (0-8s, frames 0-240) ───────────────────────────────────
const Scene1Hook: React.FC<{ frame: number }> = ({ frame }) => {
  const line1Fade = fadeIn(frame, 10);
  const line1Slide = slideUp(frame, 10);
  const line2Fade = fadeIn(frame, 50);
  const line2Slide = slideUp(frame, 50);
  const tagFade = fadeIn(frame, 100);
  const exitOpacity = interpolate(frame, [200, 230], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: exitOpacity }}>
      {/* Grid background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
        backgroundSize: '80px 80px',
        opacity: 0.3,
      }} />

      <div style={{ textAlign: 'center', maxWidth: 1200, padding: '0 80px', zIndex: 1 }}>
        <div style={{
          opacity: line1Fade,
          transform: `translateY(${line1Slide}px)`,
          fontSize: 96,
          fontFamily: C.sans,
          fontWeight: 800,
          color: C.textBright,
          lineHeight: 1.1,
          letterSpacing: '-2px',
          marginBottom: 32,
        }}>
          Every day, AI agents ship
          <br />
          <span style={{ color: C.red }}>with no security review.</span>
        </div>

        <div style={{
          opacity: line2Fade,
          transform: `translateY(${line2Slide}px)`,
          fontSize: 48,
          fontFamily: C.sans,
          color: C.textDim,
          fontWeight: 400,
          marginBottom: 60,
        }}>
          File writes. Shell commands. Database access. All unchecked.
        </div>

        <div style={{
          opacity: tagFade,
          display: 'inline-block',
          background: C.accentDim,
          border: `1px solid ${C.border}`,
          borderRadius: 100,
          padding: '16px 40px',
          fontSize: 32,
          fontFamily: C.mono,
          color: C.accentHi,
          letterSpacing: '0.05em',
        }}>
          AGENTGUARD
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 2: Problem (8-16s, frames 240-480) ──────────────────────────────
const Scene2Problem: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame;
  const titleFade = fadeIn(f, 10);
  const card1 = fadeIn(f, 30);
  const card2 = fadeIn(f, 60);
  const card3 = fadeIn(f, 90);
  const exitOpacity = interpolate(f, [210, 240], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const tools = [
    { name: 'shell_exec', args: 'rm -rf /data/users/*', risk: 'CRITICAL', color: C.red },
    { name: 'file_write', args: '/etc/passwd content=...', risk: 'HIGH', color: C.red },
    { name: 'http_post', args: 'https://external-api.com/exfil', risk: 'HIGH', color: C.amber },
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exitOpacity }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
        backgroundSize: '80px 80px', opacity: 0.3,
      }} />

      <div style={{ padding: '100px 160px', zIndex: 1 }}>
        <div style={{ opacity: titleFade, fontSize: 64, fontWeight: 700, color: C.textBright, fontFamily: C.sans, marginBottom: 16 }}>
          Your agent just called these tools.
        </div>
        <div style={{ opacity: titleFade, fontSize: 32, color: C.textDim, fontFamily: C.sans, marginBottom: 80 }}>
          Was anyone watching?
        </div>

        {tools.map((tool, i) => (
          <div key={tool.name} style={{
            opacity: [card1, card2, card3][i],
            background: C.card,
            border: `1px solid ${tool.color}44`,
            borderLeft: `4px solid ${tool.color}`,
            borderRadius: 12,
            padding: '32px 40px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 36, fontFamily: C.mono, color: tool.color, fontWeight: 600 }}>
                {tool.name}
              </div>
              <div style={{ fontSize: 26, fontFamily: C.mono, color: C.textDim, marginTop: 8 }}>
                args: "{tool.args}"
              </div>
            </div>
            <div style={{
              background: `${tool.color}22`,
              border: `1px solid ${tool.color}`,
              borderRadius: 8,
              padding: '10px 24px',
              fontSize: 26,
              fontFamily: C.mono,
              color: tool.color,
              fontWeight: 700,
            }}>
              {tool.risk}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 3: Solution intro (16-22s, frames 480-660) ──────────────────────
const Scene3Solution: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame;
  const fade1 = fadeIn(f, 10);
  const fade2 = fadeIn(f, 60);
  const fade3 = fadeIn(f, 110);
  const exitOpacity = interpolate(f, [150, 180], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: exitOpacity }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 1200px 800px at 50% 50%, ${C.accentDim} 0%, transparent 70%)`,
      }} />

      <div style={{ textAlign: 'center', maxWidth: 1100, zIndex: 1 }}>
        <div style={{ opacity: fade1, fontSize: 40, color: C.accentHi, fontFamily: C.mono, letterSpacing: '0.2em', marginBottom: 32, textTransform: 'uppercase' }}>
          Introducing
        </div>
        <div style={{ opacity: fade2, fontSize: 120, fontWeight: 800, color: C.textBright, fontFamily: C.sans, letterSpacing: '-4px', lineHeight: 1 }}>
          AgentGuard
        </div>
        <div style={{ opacity: fade3, fontSize: 44, color: C.textDim, fontFamily: C.sans, marginTop: 40, fontWeight: 400, lineHeight: 1.4 }}>
          Like container scanning,<br />but for AI agents.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 4: Three pillars (22-36s, frames 660-1080) ─────────────────────
const Scene4Pillars: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame;

  const pillars = [
    {
      icon: '🔬',
      title: 'CI/CD Gate',
      subtitle: 'Block before deploy',
      desc: 'Scans agent code, validates every tool against your security policy. Pipeline fails if coverage < 100%.',
      code: 'agentguard validate .',
      color: C.accentHi,
      delay: 20,
    },
    {
      icon: '⚡',
      title: 'Runtime Enforcement',
      subtitle: 'Sub-millisecond evaluation',
      desc: 'Every tool call evaluated in real-time. Block dangerous actions, require human approval for sensitive ops.',
      code: 'result: "block" ← shell_exec',
      color: C.green,
      delay: 80,
    },
    {
      icon: '📋',
      title: 'Audit Trail',
      subtitle: 'Tamper-evident log',
      desc: 'SHA-256 hash chain records every decision. Generate compliance evidence for EU AI Act, SOC 2, APRA.',
      code: 'hash: sha256(prev + event)',
      color: C.amber,
      delay: 140,
    },
  ];

  const titleFade = fadeIn(f, 10);
  const exitOpacity = interpolate(f, [380, 420], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exitOpacity }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
        backgroundSize: '80px 80px', opacity: 0.2,
      }} />

      <div style={{ padding: '80px 100px', zIndex: 1 }}>
        <div style={{ opacity: titleFade, textAlign: 'center', marginBottom: 70 }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: C.textBright, fontFamily: C.sans }}>
            Three enforcement points.
          </div>
          <div style={{ fontSize: 32, color: C.textDim, fontFamily: C.sans, marginTop: 16 }}>
            Deploy-time. Runtime. Compliance.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 40 }}>
          {pillars.map((p) => {
            const cardFade = fadeIn(f, p.delay);
            const cardSlide = slideUp(f, p.delay);
            return (
              <div key={p.title} style={{
                opacity: cardFade,
                transform: `translateY(${cardSlide}px)`,
                background: C.card,
                border: `1px solid ${C.border}`,
                borderTop: `3px solid ${p.color}`,
                borderRadius: 16,
                padding: '48px 40px',
              }}>
                <div style={{ fontSize: 56, marginBottom: 20 }}>{p.icon}</div>
                <div style={{ fontSize: 40, fontWeight: 700, color: C.textBright, fontFamily: C.sans, marginBottom: 8 }}>
                  {p.title}
                </div>
                <div style={{ fontSize: 24, color: p.color, fontFamily: C.mono, marginBottom: 24 }}>
                  {p.subtitle}
                </div>
                <div style={{ fontSize: 26, color: C.textDim, fontFamily: C.sans, lineHeight: 1.5, marginBottom: 32 }}>
                  {p.desc}
                </div>
                <div style={{
                  background: '#0a0a1a',
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: '14px 20px',
                  fontSize: 22,
                  fontFamily: C.mono,
                  color: p.color,
                }}>
                  {p.code}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 5: Live demo (36-42s, frames 1080-1260) ─────────────────────────
const Scene5Demo: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame;
  const termFade = fadeIn(f, 10);

  const lines = [
    { text: '$ agentguard validate ./src', color: C.textDim, delay: 20 },
    { text: '', color: C.textDim, delay: 35 },
    { text: '  Scanning 47 files...', color: C.textDim, delay: 50 },
    { text: '', color: C.textDim, delay: 65 },
    { text: '  ✅  file_read         → monitor   (covered)', color: C.green, delay: 80 },
    { text: '  ✅  file_write        → block     (covered)', color: C.green, delay: 100 },
    { text: '  ✅  db_query          → monitor   (covered)', color: C.green, delay: 120 },
    { text: '  ❌  shell_exec        → —         (uncovered)', color: C.red, delay: 140 },
    { text: '  ❌  http_post         → —         (uncovered)', color: C.red, delay: 155 },
    { text: '', color: C.textDim, delay: 170 },
    { text: '  Coverage: 60% (3/5 tools)', color: C.amber, delay: 185 },
    { text: '', color: C.textDim, delay: 200 },
    { text: '  ❌ FAIL — Deploy blocked. Add policies for uncovered tools.', color: C.red, delay: 215 },
  ];

  const exitOpacity = interpolate(f, [155, 180], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exitOpacity, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 1400 }}>
        <div style={{ opacity: fadeIn(f, 5), textAlign: 'center', marginBottom: 50 }}>
          <div style={{ fontSize: 52, fontWeight: 700, color: C.textBright, fontFamily: C.sans }}>
            See it in action.
          </div>
        </div>

        <div style={{
          opacity: termFade,
          background: '#050510',
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          overflow: 'hidden',
        }}>
          {/* Terminal titlebar */}
          <div style={{ background: '#1a1a2e', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#ff5f57' }} />
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#ffbd2e' }} />
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#28c941' }} />
            <div style={{ marginLeft: 16, fontSize: 22, fontFamily: C.mono, color: C.textDim }}>
              Terminal — agentguard validate
            </div>
          </div>
          {/* Terminal body */}
          <div style={{ padding: '40px 50px', minHeight: 400 }}>
            {lines.map((line, i) => (
              <div key={i} style={{
                opacity: fadeIn(f, line.delay),
                fontSize: 28,
                fontFamily: C.mono,
                color: line.color,
                lineHeight: 1.6,
              }}>
                {line.text || '\u00A0'}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 6: CTA (42-45s, frames 1260-1350) ───────────────────────────────
const Scene6CTA: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame;
  const fade1 = fadeIn(f, 15);
  const fade2 = fadeIn(f, 45);
  const fade3 = fadeIn(f, 75);

  return (
    <AbsoluteFill style={{ background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 1400px 900px at 50% 50%, ${C.accentDim} 0%, transparent 70%)`,
      }} />

      <div style={{ textAlign: 'center', zIndex: 1 }}>
        <div style={{
          opacity: fade1,
          fontSize: 88,
          fontWeight: 800,
          color: C.textBright,
          fontFamily: C.sans,
          letterSpacing: '-2px',
          marginBottom: 24,
        }}>
          Ship agents safely.
        </div>
        <div style={{
          opacity: fade2,
          fontSize: 42,
          color: C.textDim,
          fontFamily: C.sans,
          marginBottom: 80,
        }}>
          Enforce security at deploy-time and runtime.
        </div>

        <div style={{ opacity: fade3, display: 'flex', gap: 32, justifyContent: 'center', alignItems: 'center' }}>
          <div style={{
            background: C.accent,
            borderRadius: 12,
            padding: '24px 56px',
            fontSize: 36,
            fontFamily: C.sans,
            fontWeight: 700,
            color: '#fff',
          }}>
            Get Started Free
          </div>
          <div style={{
            fontSize: 36,
            fontFamily: C.mono,
            color: C.accentHi,
          }}>
            agentguard.tech
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Root composition ──────────────────────────────────────────────────────
export const Explainer: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {/* Scene 1: Hook 0-240 */}
      {frame < 240 && <Scene1Hook frame={frame} />}

      {/* Scene 2: Problem 240-480 */}
      {frame >= 220 && frame < 480 && <Scene2Problem frame={frame - 240} />}

      {/* Scene 3: Solution 480-660 */}
      {frame >= 460 && frame < 660 && <Scene3Solution frame={frame - 480} />}

      {/* Scene 4: Pillars 660-1080 */}
      {frame >= 640 && frame < 1080 && <Scene4Pillars frame={frame - 660} />}

      {/* Scene 5: Demo 1080-1260 */}
      {frame >= 1060 && frame < 1260 && <Scene5Demo frame={frame - 1080} />}

      {/* Scene 6: CTA 1260-1350 */}
      {frame >= 1240 && <Scene6CTA frame={frame - 1260} />}
    </AbsoluteFill>
  );
};
