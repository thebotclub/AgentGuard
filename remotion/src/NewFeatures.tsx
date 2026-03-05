import { AbsoluteFill, staticFile, useVideoConfig, Text, Interpolate, spring, delayRender, continueRender } from 'remotion';
import React, { useState, useEffect } from 'react';

const colors = {
  bg: '#0a0a0f',
  accent: '#00d4aa',
  accent2: '#7c3aed',
  text: '#ffffff',
  text2: '#94a3b8',
  red: '#ef4444',
  green: '#22c55e',
};

const FeatureCard: React.FC<{ title: string; desc: string; icon: string; delay: number }> = ({ title, desc, icon, delay }) => {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)',
      borderRadius: 16,
      padding: 24,
      border: '1px solid rgba(255,255,255,0.1)',
      flex: 1,
      minWidth: 280,
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <Text style={{ fontSize: 24, fontWeight: 700, color: colors.text, marginBottom: 8 }}>{title}</Text>
      <Text style={{ fontSize: 16, color: colors.text2, lineHeight: 1.5 }}>{desc}</Text>
    </div>
  );
};

export const NewFeatures: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = 0;
  
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <div style={{ padding: 60, textAlign: 'center' }}>
        <Text style={{ fontSize: 48, fontWeight: 800, color: colors.accent, marginBottom: 16 }}>
          AgentGuard v0.7.2
        </Text>
        <Text style={{ fontSize: 24, color: colors.text2 }}>
          New Enterprise Features
        </Text>
      </div>

      {/* Features Grid */}
      <div style={{ 
        display: 'flex', 
        gap: 24, 
        padding: '0 40px',
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        <FeatureCard 
          icon="🔑"
          title="Key Rotation"
          desc="Instantly rotate API keys. Old key invalidated immediately — security best practice."
          delay={0}
        />
        <FeatureCard 
          icon="📋"
          title="Policy API"
          desc="GET/PUT policies via API. Policy as code — version control your rules."
          delay={30}
        />
        <FeatureCard 
          icon="👤"
          title="HITL Approvals"
          desc="Human-in-the-loop for high-risk operations. Require approval before execution."
          delay={60}
        />
        <FeatureCard 
          icon="🤖"
          title="Auto-Register"
          desc="Agents can self-provision security. Zero config — just install SDK."
          delay={90}
        />
      </div>

      {/* CTA */}
      <div style={{ 
        position: 'absolute', 
        bottom: 80, 
        left: 0, 
        right: 0, 
        textAlign: 'center' 
      }}>
        <Text style={{ fontSize: 20, color: colors.text }}>
          agentguard.tech
        </Text>
      </div>
    </AbsoluteFill>
  );
};
