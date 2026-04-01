#!/usr/bin/env python3
"""Extract inline styles from dashboard/index.html into CSS classes in dashboard.css."""

import os
import re

os.chdir('/Users/hani/Documents/GitHub/AgentGuard')

# ── CSS classes to append ──────────────────────────────────────────────────
CSS_ADDITION = """
/* ══════════════════════════════════════════════════════════════════════════
   EXTRACTED INLINE STYLES
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Logo & Icons ─────────────────────────────────────────────────────── */
.logo-icon { height:40px; width:40px; vertical-align:middle; margin-right:6px; }

/* ── Navigation Badges ────────────────────────────────────────────────── */
.nav-badge { background:#f59e0b; color:white; font-size:0.65rem; font-weight:700; padding:1px 6px; border-radius:10px; margin-left:4px; }
.nav-badge-alert { background:var(--red); color:white; font-size:0.65rem; font-weight:700; padding:1px 6px; border-radius:10px; margin-left:4px; }

/* ── Skip Link ────────────────────────────────────────────────────────── */
.skip-link { position:absolute; left:-9999px; top:0; z-index:9999; padding:8px 16px; background:var(--accent); color:white; font-weight:600; }

/* ── Demo Banner ──────────────────────────────────────────────────────── */
.demo-banner { background:linear-gradient(90deg,#1a1a3e,#0f172a); border-bottom:1px solid rgba(245,158,11,0.4); padding:10px 20px; flex-wrap:wrap; align-items:center; justify-content:center; gap:16px; text-align:center; position:sticky; top:0; z-index:1000; }
.demo-banner-text { color:#e2e8f0; font-size:14px; font-weight:500; }
.demo-banner-strong { color:#f59e0b; }
.demo-banner-dismiss { background:transparent; border:none; color:#64748b; cursor:pointer; font-size:18px; line-height:1; padding:2px 6px; border-radius:4px; }

/* ── Sidebar ──────────────────────────────────────────────────────────── */
.sidebar-spacer { flex:1; }
.sidebar-footer { padding:12px; border-top:1px solid var(--border-dim); font-size:0.78rem; color:var(--text-dim); }
.sidebar-version { font-weight:600; color:var(--accent-hi); }

/* ── API Key Bar ──────────────────────────────────────────────────────── */
.api-key-bar { margin-bottom:16px; padding:12px 16px; background:var(--bg-card); border:1px solid var(--border-dim); border-radius:8px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.api-key-label { font-size:0.78rem; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; }
.api-key-input { flex:1; min-width:200px; padding:8px 12px; background:var(--bg-card2); border:1px solid var(--border); border-radius:6px; color:var(--text-bright); font-family:var(--mono); font-size:0.82rem; outline:none; }

/* ── Status Indicators ────────────────────────────────────────────────── */
.api-status { display:flex; align-items:center; gap:6px; font-size:0.82rem; color:var(--text-dim); }
.api-dot { width:8px; height:8px; border-radius:50%; background:var(--text-dim); }

/* ── Quick Start Cards ────────────────────────────────────────────────── */
.qs-cards-grid { grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; margin-bottom:24px; }
.qs-card-emoji { font-size:1.5rem; margin-bottom:10px; }
.qs-card-title { font-weight:600; color:var(--text-bright); margin-bottom:6px; }
.qs-card-desc { font-size:0.8rem; color:var(--text-dim); margin-bottom:12px; }
.qs-code-box { background:var(--bg-card2); border:1px solid var(--border-dim); border-radius:6px; padding:10px 12px; font-family:var(--mono); font-size:0.78rem; color:var(--accent-hi); display:flex; align-items:center; justify-content:space-between; gap:8px; }
.cicd-code-box { background:var(--bg-card2); border:1px solid var(--border-dim); border-radius:6px; padding:10px 12px; font-family:var(--mono); font-size:0.72rem; color:var(--accent-hi); max-height:88px; overflow:hidden; position:relative; }
.qs-link-arrow { display:flex; align-items:center; gap:6px; font-size:0.82rem; color:var(--accent-hi); }

/* ── Charts ────────────────────────────────────────────────────────────── */
.charts-grid { grid-template-columns:1fr 280px; gap:20px; margin-bottom:20px; }
.chart-container { position:relative; width:100%; height:160px; }
.chart-legend { display:flex; align-items:center; gap:16px; margin-top:8px; font-size:0.75rem; color:var(--text-dim); }
.chart-legend-top { display:flex; align-items:center; gap:16px; margin-top:12px; font-size:0.75rem; color:var(--text-dim); }
.legend-dot-green { display:inline-block; width:10px; height:10px; border-radius:2px; background:var(--green); margin-right:4px; }
.legend-dot-red { display:inline-block; width:10px; height:10px; border-radius:2px; background:var(--red); margin-right:4px; }
.donut-card-body { display:flex; flex-direction:column; align-items:center; padding:16px 20px; }
.donut-legend { display:flex; flex-direction:column; gap:6px; margin-top:12px; font-size:0.8rem; width:100%; }
.bar-chart { display:flex; align-items:flex-end; gap:6px; height:160px; padding:0 4px; }

/* ── Kill Switch ──────────────────────────────────────────────────────── */
.kill-desc { color:var(--text-dim); margin-bottom:24px; max-width:500px; margin-left:auto; margin-right:auto; }
.kill-api-status { font-size:0.8rem; color:var(--text-dim); margin-bottom:16px; }
.kill-status-text { color:var(--text-dim); margin-top:24px; font-size:0.85rem; }

/* ── SDK / Code Blocks ────────────────────────────────────────────────── */
.code-block-display { display:block; background:var(--bg-card2); padding:12px 16px; border-radius:8px; font-family:var(--mono); font-size:0.9rem; color:var(--accent-hi); margin-bottom:12px; }
.code-pre { font-family:var(--mono); font-size:0.8rem; color:var(--text); line-height:1.7; overflow-x:auto; }
.policy-json { font-family:var(--mono); font-size:0.8rem; color:var(--text-dim); overflow-x:auto; max-height:400px; overflow-y:auto; }

/* ── Compliance ───────────────────────────────────────────────────────── */
.comp-layout { display:grid; grid-template-columns:260px 1fr; gap:20px; margin-bottom:24px; align-items:start; }
.comp-donut-body { text-align:center; padding:32px 24px; }
.comp-donut-wrap { position:relative; display:inline-block; width:160px; height:160px; margin-bottom:16px; }
.comp-donut-center { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; }
.comp-score-value { font-size:2.2rem; font-weight:700; color:var(--text-bright); font-family:var(--mono); }
.comp-score-label { font-size:0.9rem; font-weight:600; color:var(--text-dim); }
.comp-updated { font-size:0.75rem; color:var(--text-dim); margin-top:4px; }

/* ── License ──────────────────────────────────────────────────────────── */
.lic-plan-body { text-align:center; padding:32px 20px; }
.lic-plan-badge { display:inline-block; padding:10px 32px; border-radius:40px; font-size:1.35rem; font-weight:700; letter-spacing:0.04em; margin-bottom:16px; }
.lic-plan-sub { color:var(--text-dim); font-size:0.85rem; margin-bottom:20px; }
.lic-key-free { text-align:center; padding:20px 0; }
.lic-key-header { font-size:0.78rem; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px; }
.lic-key-row { display:flex; align-items:center; gap:8px; }
.lic-key-code { flex:1; font-family:var(--mono); font-size:0.85rem; background:var(--bg-card2); padding:10px 14px; border-radius:8px; border:1px solid var(--border-dim); color:var(--text-bright); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.lic-copy-btn { background:var(--accent-dim); border:1px solid var(--border); border-radius:8px; color:var(--accent-hi); cursor:pointer; padding:10px 14px; font-size:0.85rem; white-space:nowrap; font-family:inherit; }
.lic-hint { font-size:0.78rem; color:var(--text-dim); margin-bottom:12px; }
.lic-no-key-text { color:var(--text-dim); font-size:0.85rem; margin-bottom:16px; }
.inline-code { font-family:var(--mono); background:var(--bg-card2); padding:2px 6px; border-radius:4px; }

/* ── Usage Meters ─────────────────────────────────────────────────────── */
.meter-section { margin-bottom:20px; }
.meter-header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px; }
.meter-label { font-size:0.85rem; font-weight:600; color:var(--text-bright); }
.meter-value { font-family:var(--mono); font-size:0.85rem; color:var(--text-dim); }
.progress-track { height:10px; background:var(--bg-card2); border-radius:10px; overflow:hidden; border:1px solid var(--border-dim); }
.progress-track-sm { height:8px; background:var(--bg-card2); border-radius:10px; overflow:hidden; border:1px solid var(--border-dim); }
.progress-bar { height:100%; border-radius:10px; transition:width 0.4s ease,background 0.4s ease; }
.meter-sub { font-size:0.75rem; color:var(--text-dim); margin-top:6px; }

/* ── SIEM ─────────────────────────────────────────────────────────────── */
.siem-btn-row { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
.siem-provider-btn { padding:14px 28px; border:2px solid var(--border); border-radius:10px; background:var(--bg-card2); color:var(--text-dim); font-size:0.95rem; font-weight:600; cursor:pointer; transition:all 0.15s; font-family:inherit; }
.siem-config-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
.siem-actions-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.siem-toggle-group { display:flex; align-items:center; gap:8px; }
.siem-toggle-btn { width:44px; height:24px; border-radius:12px; border:none; cursor:pointer; position:relative; background:var(--border); transition:background 0.2s; }
.siem-toggle-knob { position:absolute; top:2px; left:2px; width:20px; height:20px; border-radius:50%; background:white; transition:left 0.2s; }
.siem-status { margin-top:16px; padding:12px 16px; border-radius:8px; font-size:0.85rem; }
.siem-no-provider { color:var(--text-dim); font-size:0.9rem; }

/* ── Onboarding Wizard ────────────────────────────────────────────────── */
.ob-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.75); backdrop-filter:blur(6px); z-index:1000; align-items:center; justify-content:center; padding:16px; }
.ob-dialog { background:var(--bg-card); border:1px solid var(--border); border-radius:16px; width:100%; max-width:560px; overflow:hidden; box-shadow:0 24px 64px rgba(0,0,0,0.6); }
.ob-header { background:linear-gradient(135deg,rgba(82,84,212,0.3),rgba(99,102,241,0.1)); padding:24px 28px 20px; border-bottom:1px solid var(--border-dim); }
.ob-header-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.ob-title { font-size:1.3rem; font-weight:700; color:var(--text-bright); }
.ob-close-btn { background:none; border:none; cursor:pointer; color:var(--text-dim); font-size:1.2rem; line-height:1; padding:4px; }
.ob-dots-row { display:flex; align-items:center; gap:6px; }
.ob-dot-active { height:8px; border-radius:4px; transition:all 0.2s; background:var(--accent); width:24px; }
.ob-dot { height:8px; border-radius:4px; transition:all 0.2s; background:var(--border); width:8px; }
.ob-step-label { margin-left:8px; font-size:0.75rem; color:var(--text-dim); }
.ob-content { padding:28px; }
.ob-emoji { font-size:2.5rem; margin-bottom:16px; text-align:center; }
.ob-emoji-lg { font-size:3rem; margin-bottom:16px; text-align:center; }
.ob-heading { font-size:1.25rem; font-weight:700; color:var(--text-bright); margin-bottom:12px; text-align:center; }
.ob-heading-tight { font-size:1.25rem; font-weight:700; color:var(--text-bright); margin-bottom:8px; text-align:center; }
.ob-paragraph { color:var(--text-dim); font-size:0.9rem; line-height:1.7; margin-bottom:20px; text-align:center; }
.ob-paragraph-sm { color:var(--text-dim); font-size:0.85rem; margin-bottom:20px; text-align:center; }
.ob-feature-card { background:var(--bg-card2); border:1px solid var(--border-dim); border-radius:8px; padding:14px 16px; display:flex; align-items:flex-start; gap:12px; }
.ob-feature-icon { font-size:1.2rem; flex-shrink:0; }
.ob-feature-title { font-weight:600; color:var(--text-bright); font-size:0.88rem; margin-bottom:3px; }
.ob-feature-desc { font-size:0.8rem; color:var(--text-dim); }
.ob-api-label { display:block; font-size:0.78rem; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px; }
.ob-api-input { width:100%; padding:12px 44px 12px 14px; background:var(--bg-card2); border:1px solid var(--border); border-radius:8px; color:var(--text-bright); font-family:var(--mono); font-size:0.85rem; outline:none; transition:border-color 0.15s; }
.ob-eye-btn { position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--text-dim); font-size:0.9rem; }
.ob-key-error { color:var(--red); font-size:0.78rem; margin-top:6px; }
.ob-info-box { background:rgba(82,84,212,0.08); border:1px solid var(--border); border-radius:8px; padding:12px 14px; font-size:0.8rem; color:var(--text-dim); }
.ob-curl-box { background:#0d0d20; border:1px solid var(--border); border-radius:8px; padding:16px; margin-bottom:12px; position:relative; }
.ob-curl-pre { margin:0; font-family:var(--mono); font-size:0.75rem; color:#a5b4fc; white-space:pre-wrap; word-break:break-all; line-height:1.6; }
.ob-copy-btn { position:absolute; top:10px; right:10px; background:var(--accent-dim); border:1px solid var(--border); border-radius:6px; color:var(--accent-hi); cursor:pointer; padding:5px 10px; font-size:0.75rem; }
.ob-example-box { background:var(--bg-card2); border:1px solid var(--border-dim); border-radius:8px; padding:12px; }
.ob-example-label { font-size:0.75rem; color:var(--text-dim); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.04em; }
.ob-code-green { font-family:var(--mono); font-size:0.78rem; color:var(--green); }
.ob-code-red { font-family:var(--mono); font-size:0.78rem; color:var(--red); }
.ob-next-item { background:var(--bg-card2); border:1px solid var(--border-dim); border-radius:8px; padding:12px 14px; display:flex; align-items:center; gap:12px; }
.ob-next-icon { font-size:1.1rem; }
.ob-next-body { flex:1; }
.ob-next-title { font-weight:600; color:var(--text-bright); font-size:0.85rem; }
.ob-next-desc { font-size:0.78rem; color:var(--text-dim); }
.ob-footer { padding:16px 28px 24px; display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--border-dim); }
.ob-skip-btn { background:none; border:none; cursor:pointer; color:var(--text-dim); font-size:0.82rem; padding:4px 8px; }
.ob-prev-btn { background:var(--bg-card2); border:1px solid var(--border); border-radius:8px; color:var(--text-dim); font-weight:600; font-size:0.85rem; cursor:pointer; padding:10px 18px; font-family:inherit; }
.ob-next-btn { background:var(--accent); border:none; border-radius:8px; color:white; font-weight:600; font-size:0.85rem; cursor:pointer; padding:10px 20px; font-family:inherit; display:inline-flex; align-items:center; gap:6px; }

/* ── Audit ─────────────────────────────────────────────────────────────── */
.date-input { padding:7px 10px; background:var(--bg-card2); border:1px solid var(--border); border-radius:8px; color:var(--text-bright); font-size:0.82rem; outline:none; }
.export-dropdown { position:absolute; right:0; top:calc(100% + 4px); background:var(--bg-card); border:1px solid var(--border); border-radius:8px; min-width:130px; z-index:50; box-shadow:0 8px 24px rgba(0,0,0,0.4); }
.dropdown-item { display:block; width:100%; padding:10px 16px; background:none; border:none; color:var(--text); font-size:0.85rem; cursor:pointer; text-align:left; font-family:inherit; }
.dropdown-item-border { display:block; width:100%; padding:10px 16px; background:none; border:none; color:var(--text); font-size:0.85rem; cursor:pointer; text-align:left; font-family:inherit; border-top:1px solid var(--border-dim); }
.verify-banner { margin-bottom:16px; padding:12px 16px; background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.25); border-radius:8px; font-size:0.85rem; }
.approvals-no-key { margin-bottom:16px; padding:14px 18px; background:rgba(82,84,212,0.08); border:1px solid var(--border); border-radius:10px; font-size:0.85rem; color:var(--text-dim); }

/* ── Alert Rules ──────────────────────────────────────────────────────── */
.alert-rule-form { padding:20px; border-bottom:1px solid var(--border-dim); background:var(--bg-card2); }
.select-full { width:100%; padding:10px 14px; background:var(--bg-card2); border:1px solid var(--border); border-radius:8px; color:var(--text-bright); font-size:0.85rem; outline:none; }

/* ── Data Tables (inline table styling) ───────────────────────────────── */
.data-table { width:100%; border-collapse:collapse; font-size:0.85rem; }
.tr-border { border-bottom:1px solid var(--border); }
.th-left { text-align:left; padding:12px 16px; color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; }
.th-right { text-align:right; padding:12px 16px; color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; }
.th-right-simple { text-align:right; }
.td-empty { text-align:center; color:var(--text-dim); padding:24px; }

/* ── Forms ─────────────────────────────────────────────────────────────── */
.inline-label { font-size:0.78rem; color:var(--text-dim); display:block; margin-bottom:4px; }
.inline-input { width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); font-family:var(--mono); font-size:0.85rem; }
.inline-select { width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); font-size:0.85rem; }
.filter-select { padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); font-size:0.85rem; }
.form-grid-3col { display:grid; grid-template-columns:1fr 1fr auto; gap:12px; align-items:end; }
.form-grid-3col-wide { display:grid; grid-template-columns:2fr 1fr auto; gap:12px; align-items:end; }
.form-grid-4col { display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:12px; align-items:end; }

/* ── Readiness Stats ──────────────────────────────────────────────────── */
.readiness-desc { color:var(--text-dim); margin-bottom:20px; }
.deploy-stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; text-align:center; }
.big-stat { font-size:2rem; font-weight:700; color:var(--text-bright); }
.big-stat-amber { font-size:2rem; font-weight:700; color:var(--amber); }
.big-stat-green { font-size:2rem; font-weight:700; color:var(--green); }
.big-stat-red { font-size:2rem; font-weight:700; color:var(--red); }

/* ── No-Key CTA Blocks ───────────────────────────────────────────────── */
.no-key-cta { text-align:center; padding:48px 24px; color:var(--text-dim); }
.no-key-emoji { font-size:2rem; margin-bottom:12px; }
.no-key-title { font-size:1.1rem; font-weight:600; margin-bottom:8px; }

/* ── Shared Utility-style Classes ─────────────────────────────────────── */
.card-no-mb { margin-bottom:0; }
.card-no-mb-default { margin-bottom:0; cursor:default; }
.card-no-mb-pointer { margin-bottom:0; cursor:pointer; }
.card-mb20 { margin-bottom:20px; }
.card-mt20 { margin-top:20px; }
.card-body-p20 { padding:20px; }
.card-body-flush { padding:0; }
.card-body-chart { padding:16px 20px 12px; }
.card-header-flex { display:flex; align-items:center; justify-content:space-between; }
.flex-row { display:flex; gap:8px; }
.flex-row-center { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.flex-row-actions { display:flex; gap:10px; }
.flex-row-actions-mt { display:flex; gap:10px; margin-top:4px; }
.flex-col-gap10 { display:flex; flex-direction:column; gap:10px; }
.grid-2col { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.grid-2col-mb { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px; }
.grid-2col-form { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.grid-2col-sm { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.grid-2col-controls { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.grid-auto-form { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:12px; }
.grid-gap12 { display:grid; gap:12px; }
.grid-gap10 { display:grid; gap:10px; }
.pos-relative { position:relative; }
.text-ellipsis { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.text-dim { color:var(--text-dim); }
.text-green { color:var(--green); }
.text-xs-dim { font-size:0.75rem; color:var(--text-dim); }
.text-sm-dim { font-size:0.82rem; color:var(--text-dim); }
.text-muted { color:var(--text-dim); font-size:0.85rem; }
.text-muted-sm { font-size:0.8rem; color:var(--text-dim); }
.accent-link { color:var(--accent-hi); }
.stat-sublabel { font-size:0.8rem; color:var(--text-dim); }
.mono-meta { font-family:var(--mono); font-size:0.75rem; color:var(--text-dim); }
.mono-meta-sm { font-family:var(--mono); font-size:0.78rem; color:var(--text-dim); }
.mono-input { font-family:var(--mono); }
.mono-input-sm { font-family:var(--mono); font-size:0.82rem; }
.label-sub { font-weight:400; text-transform:none; letter-spacing:0; }
.form-result { margin-top:12px; }
.form-result-sm { margin-top:10px; }
.btn-full { width:100%; }
.btn-preset { font-size:0.78rem; }
.btn-sm { font-size:0.72rem; padding:4px 10px; }
.btn-sm-active { font-size:0.72rem; padding:4px 10px; border-color:var(--accent); }
.btn-eval { width:100%; padding:12px; font-size:0.95rem; }
.btn-upgrade { width:100%; padding:12px 24px; font-size:0.95rem; background:linear-gradient(135deg,#5254d4,#818cf8); }
.btn-export-flex { display:flex; align-items:center; gap:6px; }
.copy-btn-sm { background:var(--accent-dim); border:none; border-radius:4px; color:var(--accent-hi); cursor:pointer; padding:3px 8px; font-size:0.72rem; flex-shrink:0; }
.copy-btn-bare { background:var(--accent-dim); border:none; border-radius:4px; color:var(--accent-hi); cursor:pointer; padding:3px 8px; font-size:0.72rem; }
.sdk-lang-row { margin-top:8px; display:flex; gap:6px; }
.pre-wrap { margin:0; white-space:pre-wrap; word-break:break-all; }
.pos-bottom-right { position:absolute; bottom:0; right:0; padding:4px 8px; }
.value-green { color:var(--green); }
.value-red { color:var(--red); }
.value-accent { color:var(--accent-hi); }
.value-amber { color:var(--amber); }
.feed-scroll { max-height:320px; overflow-y:auto; }
.feed-scroll-lg { min-height:400px; max-height:600px; overflow-y:auto; }
.empty-state { padding:24px; text-align:center; color:var(--text-dim); }
.empty-state-centered { text-align:center; color:var(--text-dim); padding:40px 0; }
.empty-state-siem { color:var(--text-dim); text-align:center; padding:24px; }
.preset-row { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:20px; }
.field-hint { font-size:0.75rem; color:var(--text-dim); margin-top:4px; }
.policy-meta { font-size:0.82rem; color:var(--text-dim); }
.audit-export-row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.arrow-separator { color:var(--text-dim); font-size:0.82rem; }
.dropdown-caret { font-size:0.75rem; }
.audit-meta { font-size:0.82rem; color:var(--text-dim); }
.form-group-0 { margin-bottom:0; }
.bar-chart-loading { color:var(--text-dim); font-size:0.85rem; align-self:center; }
.stats-grid-mb { margin-bottom:24px; }
.comp-result { margin-bottom:16px; padding:12px 16px; border-radius:8px; font-size:0.85rem; }
.auto-refresh-label { font-size:0.78rem; color:var(--text-dim); }
.siem-label { font-size:0.82rem; color:var(--text-dim); }
.svgtransition { transition:stroke-dasharray 0.6s ease; }
.ob-mb16 { margin-bottom:16px; }
.history-meta { font-size:0.78rem; color:var(--text-dim); }
"""

# ── Style → Class Mapping ──────────────────────────────────────────────
# Format: style_value → (class_to_add, residual_inline_style_or_None)
# If residual is None, the style attribute is removed entirely.
STYLE_MAP = {
    # ── Logo icons ──
    'height:40px;width:40px;vertical-align:middle;margin-right:6px': ('logo-icon', None),

    # ── Nav badges (JS-toggled display:none) ──
    'display:none;background:#f59e0b;color:white;font-size:0.65rem;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:4px': ('nav-badge', 'display:none'),
    'display:none;background:var(--red);color:white;font-size:0.65rem;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:4px': ('nav-badge-alert', 'display:none'),

    # ── Skip link ──
    'position:absolute;left:-9999px;top:0;z-index:9999;padding:8px 16px;background:var(--accent);color:white;font-weight:600': ('skip-link', None),

    # ── Demo banner (JS-toggled) ──
    'display:none;background:linear-gradient(90deg,#1a1a3e,#0f172a);border-bottom:1px solid rgba(245,158,11,0.4);padding:10px 20px;flex-wrap:wrap;align-items:center;justify-content:center;gap:16px;text-align:center;position:sticky;top:0;z-index:1000;': ('demo-banner', 'display:none'),
    'color:#e2e8f0;font-size:14px;font-weight:500;': ('demo-banner-text', None),
    'color:#f59e0b;': ('demo-banner-strong', None),
    'background:transparent;border:none;color:#64748b;cursor:pointer;font-size:18px;line-height:1;padding:2px 6px;border-radius:4px;': ('demo-banner-dismiss', None),

    # ── Sidebar ──
    'padding:12px;border-top:1px solid var(--border-dim);font-size:0.78rem;color:var(--text-dim)': ('sidebar-footer', None),
    'font-weight:600;color:var(--accent-hi)': ('sidebar-version', None),

    # ── API Key Bar ──
    'margin-bottom:16px;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border-dim);border-radius:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap': ('api-key-bar', None),
    'font-size:0.78rem;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em': ('api-key-label', None),
    'flex:1;min-width:200px;padding:8px 12px;background:var(--bg-card2);border:1px solid var(--border);border-radius:6px;color:var(--text-bright);font-family:var(--mono);font-size:0.82rem;outline:none': ('api-key-input', None),

    # ── API status ──
    'display:flex;align-items:center;gap:6px;font-size:0.82rem;color:var(--text-dim)': ('api-status', None),
    'width:8px;height:8px;border-radius:50%;background:var(--text-dim)': ('api-dot', None),

    # ── Quick Start ──
    'display:none;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px': ('qs-cards-grid', 'display:none'),
    'margin-bottom:0;cursor:default': ('card-no-mb-default', None),
    'margin-bottom:0;cursor:pointer': ('card-no-mb-pointer', None),
    'font-size:1.5rem;margin-bottom:10px': ('qs-card-emoji', None),
    'font-weight:600;color:var(--text-bright);margin-bottom:6px': ('qs-card-title', None),
    'font-size:0.8rem;color:var(--text-dim);margin-bottom:12px': ('qs-card-desc', None),
    'background:var(--bg-card2);border:1px solid var(--border-dim);border-radius:6px;padding:10px 12px;font-family:var(--mono);font-size:0.78rem;color:var(--accent-hi);display:flex;align-items:center;justify-content:space-between;gap:8px': ('qs-code-box', None),
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap': ('text-ellipsis', None),
    'background:var(--accent-dim);border:none;border-radius:4px;color:var(--accent-hi);cursor:pointer;padding:3px 8px;font-size:0.72rem;flex-shrink:0': ('copy-btn-sm', None),
    'margin-top:8px;display:flex;gap:6px': ('sdk-lang-row', None),
    'font-size:0.72rem;padding:4px 10px;border-color:var(--accent)': ('btn-sm-active', None),
    'font-size:0.72rem;padding:4px 10px': ('btn-sm', None),
    'background:var(--bg-card2);border:1px solid var(--border-dim);border-radius:6px;padding:10px 12px;font-family:var(--mono);font-size:0.72rem;color:var(--accent-hi);max-height:88px;overflow:hidden;position:relative': ('cicd-code-box', None),
    'margin:0;white-space:pre-wrap;word-break:break-all': ('pre-wrap', None),
    'position:absolute;bottom:0;right:0;padding:4px 8px': ('pos-bottom-right', None),
    'background:var(--accent-dim);border:none;border-radius:4px;color:var(--accent-hi);cursor:pointer;padding:3px 8px;font-size:0.72rem': ('copy-btn-bare', None),
    'display:flex;align-items:center;gap:6px;font-size:0.82rem;color:var(--accent-hi)': ('qs-link-arrow', None),

    # ── Stat values ──
    'color:var(--green)': ('value-green', None),
    'color:var(--red)': ('value-red', None),
    'color:var(--accent-hi)': ('value-accent', None),

    # ── Charts (JS-toggled) ──
    'display:none;grid-template-columns:1fr 280px;gap:20px;margin-bottom:20px': ('charts-grid', 'display:none'),
    'padding:16px 20px 12px': ('card-body-chart', None),
    'position:relative;width:100%;height:160px': ('chart-container', None),
    'display:flex;align-items:center;gap:16px;margin-top:8px;font-size:0.75rem;color:var(--text-dim)': ('chart-legend', None),
    'display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--green);margin-right:4px': ('legend-dot-green', None),
    'display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--red);margin-right:4px': ('legend-dot-red', None),
    'display:flex;flex-direction:column;align-items:center;padding:16px 20px': ('donut-card-body', None),
    'display:flex;flex-direction:column;gap:6px;margin-top:12px;font-size:0.8rem;width:100%': ('donut-legend', None),

    # ── Feed ──
    'max-height:320px;overflow-y:auto': ('feed-scroll', None),
    'min-height:400px;max-height:600px;overflow-y:auto': ('feed-scroll-lg', None),

    # ── Empty states ──
    'text-align:center;color:var(--text-dim);padding:24px': ('td-empty', None),
    'padding:24px;text-align:center;color:var(--text-dim)': ('empty-state', None),
    'text-align:center;color:var(--text-dim);padding:40px 0': ('empty-state-centered', None),
    'color:var(--text-dim);text-align:center;padding:24px': ('empty-state-siem', None),

    # ── Grid layouts ──
    'display:grid;grid-template-columns:1fr 1fr;gap:20px': ('grid-2col', None),
    'display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px': ('grid-2col-mb', None),
    'display:grid;grid-template-columns:1fr 1fr;gap:16px': ('grid-2col-form', None),
    'display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px': ('siem-config-grid', None),
    'display:grid;grid-template-columns:1fr 1fr;gap:10px': ('grid-2col-sm', None),
    'display:grid;grid-template-columns:1fr 1fr;gap:12px': ('grid-2col-controls', None),
    'display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end': ('form-grid-3col', None),
    'display:grid;grid-template-columns:2fr 1fr auto;gap:12px;align-items:end': ('form-grid-3col-wide', None),
    'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;align-items:end': ('form-grid-4col', None),
    'display:grid;grid-template-columns:repeat(4,1fr);gap:16px;text-align:center': ('deploy-stats-grid', None),
    'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px': ('grid-auto-form', None),
    'display:grid;gap:12px': ('grid-gap12', None),
    'display:grid;gap:10px': ('grid-gap10', None),

    # ── Flex ──
    'display:flex;gap:8px': ('flex-row', None),
    'display:flex;gap:8px;align-items:center;flex-wrap:wrap': ('flex-row-center', None),
    'display:flex;gap:10px': ('flex-row-actions', None),
    'display:flex;gap:10px;margin-top:4px': ('flex-row-actions-mt', None),
    'display:flex;flex-direction:column;gap:10px': ('flex-col-gap10', None),
    'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px': ('preset-row', None),
    'display:flex;align-items:center;gap:6px': ('btn-export-flex', None),
    'display:flex;align-items:center;justify-content:space-between': ('card-header-flex', None),
    'display:flex;align-items:center;gap:6px;flex-wrap:wrap': ('audit-export-row', None),
    'display:flex;align-items:center;gap:12px;flex-wrap:wrap': ('siem-actions-row', None),
    'display:flex;align-items:center;gap:8px': ('siem-toggle-group', None),
    'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px': ('meter-header', None),
    'display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap': ('siem-btn-row', None),
    'display:flex;align-items:flex-end;gap:6px;height:160px;padding:0 4px': ('bar-chart', None),
    'display:flex;align-items:center;gap:16px;margin-top:12px;font-size:0.75rem;color:var(--text-dim)': ('chart-legend-top', None),

    # ── Buttons ──
    'width:100%': ('btn-full', None),
    'width:100%;padding:12px;font-size:0.95rem': ('btn-eval', None),
    'width:100%;padding:12px 24px;font-size:0.95rem;background:linear-gradient(135deg,#5254d4,#818cf8)': ('btn-upgrade', None),

    # ── Tables ──
    'width:100%;border-collapse:collapse;font-size:0.85rem': ('data-table', None),
    'border-bottom:1px solid var(--border)': ('tr-border', None),
    'text-align:left;padding:12px 16px;color:var(--text-dim);font-size:0.75rem;text-transform:uppercase': ('th-left', None),
    'text-align:right;padding:12px 16px;color:var(--text-dim);font-size:0.75rem;text-transform:uppercase': ('th-right', None),
    'text-align:right': ('th-right-simple', None),

    # ── Forms ──
    'font-size:0.78rem;color:var(--text-dim);display:block;margin-bottom:4px': ('inline-label', None),
    'width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:var(--mono);font-size:0.85rem': ('inline-input', None),
    'width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.85rem': ('inline-select', None),
    'padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.85rem': ('filter-select', None),
    'width:100%;padding:10px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:8px;color:var(--text-bright);font-size:0.85rem;outline:none': ('select-full', None),

    # ── Cards ──
    'margin-bottom:0': ('card-no-mb', None),
    'margin-bottom:20px': ('card-mb20', None),
    'margin-top:20px': ('card-mt20', None),
    'padding:20px': ('card-body-p20', None),
    'padding:0': ('card-body-flush', None),

    # ── Misc spacing / text ──
    'flex:1': ('sidebar-spacer', None),
    'font-size:0.75rem;color:var(--text-dim)': ('text-xs-dim', None),
    'font-size:0.82rem;color:var(--text-dim)': ('text-sm-dim', None),
    'color:var(--text-dim);font-size:0.82rem': ('arrow-separator', None),
    'font-size:0.8rem;color:var(--text-dim)': ('stat-sublabel', None),
    'font-size:0.78rem;color:var(--text-dim)': ('history-meta', None),
    'color:var(--text-dim)': ('text-dim', None),
    'color:var(--text-dim);font-size:0.85rem': ('text-muted', None),
    'color:var(--text-dim);font-size:0.85rem;align-self:center': ('bar-chart-loading', None),
    'font-family:var(--mono)': ('mono-input', None),
    'font-family:var(--mono);font-size:0.82rem': ('mono-input-sm', None),
    'font-family:var(--mono);font-size:0.75rem;color:var(--text-dim)': ('mono-meta', None),
    'font-family:var(--mono);font-size:0.78rem;color:var(--text-dim)': ('mono-meta-sm', None),
    'font-family:var(--mono);font-size:0.85rem;color:var(--text-dim)': ('meter-value', None),
    'font-size:0.75rem;color:var(--text-dim);margin-top:4px': ('field-hint', None),
    'font-weight:400;text-transform:none;letter-spacing:0': ('label-sub', None),
    'margin-top:12px': ('form-result', None),
    'margin-top:10px': ('form-result-sm', None),
    'position:relative': ('pos-relative', None),
    'font-size:0.78rem': ('btn-preset', None),
    'font-size:0.75rem': ('dropdown-caret', None),
    'margin-bottom:16px': ('ob-mb16', None),
    'margin-bottom:12px': ('lic-key-mb', None),
    'margin-bottom:24px': ('stats-grid-mb', None),

    # ── Readiness ──
    'color:var(--text-dim);margin-bottom:20px': ('readiness-desc', None),
    'font-size:2rem;font-weight:700;color:var(--text-bright)': ('big-stat', None),
    'font-size:2rem;font-weight:700;color:var(--amber)': ('big-stat-amber', None),
    'font-size:2rem;font-weight:700;color:var(--green)': ('big-stat-green', None),
    'font-size:2rem;font-weight:700;color:var(--red)': ('big-stat-red', None),

    # ── Kill Switch ──
    'color:var(--text-dim);margin-bottom:24px;max-width:500px;margin-left:auto;margin-right:auto': ('kill-desc', None),
    'font-size:0.8rem;color:var(--text-dim);margin-bottom:16px': ('kill-api-status', None),
    'color:var(--text-dim);margin-top:24px;font-size:0.85rem': ('kill-status-text', None),

    # ── SDK ──
    'display:block;background:var(--bg-card2);padding:12px 16px;border-radius:8px;font-family:var(--mono);font-size:0.9rem;color:var(--accent-hi);margin-bottom:12px': ('code-block-display', None),
    'font-family:var(--mono);font-size:0.8rem;color:var(--text);line-height:1.7;overflow-x:auto': ('code-pre', None),
    'font-family:var(--mono);font-size:0.8rem;color:var(--text-dim);overflow-x:auto;max-height:400px;overflow-y:auto': ('policy-json', None),

    # ── Audit ──
    'padding:7px 10px;background:var(--bg-card2);border:1px solid var(--border);border-radius:8px;color:var(--text-bright);font-size:0.82rem;outline:none': ('date-input', None),
    'display:none;position:absolute;right:0;top:calc(100% + 4px);background:var(--bg-card);border:1px solid var(--border);border-radius:8px;min-width:130px;z-index:50;box-shadow:0 8px 24px rgba(0,0,0,0.4)': ('export-dropdown', 'display:none'),
    'display:block;width:100%;padding:10px 16px;background:none;border:none;color:var(--text);font-size:0.85rem;cursor:pointer;text-align:left;font-family:inherit': ('dropdown-item', None),
    'display:block;width:100%;padding:10px 16px;background:none;border:none;color:var(--text);font-size:0.85rem;cursor:pointer;text-align:left;font-family:inherit;border-top:1px solid var(--border-dim)': ('dropdown-item-border', None),
    'display:none;margin-bottom:16px;padding:12px 16px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;font-size:0.85rem': ('verify-banner', 'display:none'),
    'display:none;margin-bottom:16px;padding:14px 18px;background:rgba(82,84,212,0.08);border:1px solid var(--border);border-radius:10px;font-size:0.85rem;color:var(--text-dim)': ('approvals-no-key', 'display:none'),

    # ── Create forms (JS-toggled) ──
    'display:none;margin-bottom:20px': ('card-mb20', 'display:none'),

    # ── Analytics ──
    'display:none;text-align:center;padding:48px 24px;color:var(--text-dim)': ('no-key-cta', 'display:none'),
    'font-size:2rem;margin-bottom:12px': ('no-key-emoji', None),
    'font-size:1.1rem;font-weight:600;margin-bottom:8px': ('no-key-title', None),

    # ── Compliance ──
    'display:grid;grid-template-columns:260px 1fr;gap:20px;margin-bottom:24px;align-items:start': ('comp-layout', None),
    'text-align:center;padding:32px 24px': ('comp-donut-body', None),
    'position:relative;display:inline-block;width:160px;height:160px;margin-bottom:16px': ('comp-donut-wrap', None),
    'transition:stroke-dasharray 0.6s ease': ('svgtransition', None),
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center': ('comp-donut-center', None),
    'font-size:2.2rem;font-weight:700;color:var(--text-bright);font-family:var(--mono)': ('comp-score-value', None),
    'font-size:0.9rem;font-weight:600;color:var(--text-dim)': ('comp-score-label', None),

    'display:none;margin-bottom:16px;padding:12px 16px;border-radius:8px;font-size:0.85rem': ('comp-result', 'display:none'),

    # ── License ──
    'text-align:center;padding:32px 20px': ('lic-plan-body', None),
    'display:inline-block;padding:10px 32px;border-radius:40px;font-size:1.35rem;font-weight:700;letter-spacing:0.04em;margin-bottom:16px;background:rgba(34,197,94,0.12);color:#22c55e;border:2px solid rgba(34,197,94,0.3)': ('lic-plan-badge lic-badge-free', None),
    'color:var(--text-dim);font-size:0.85rem;margin-bottom:20px': ('lic-plan-sub', None),
    'text-align:center;padding:20px 0': ('lic-key-free', None),
    'color:var(--text-dim);font-size:0.85rem;margin-bottom:16px': ('lic-no-key-text', None),
    'font-size:0.78rem;color:var(--text-dim);margin-bottom:12px': ('lic-hint', None),
    'font-family:var(--mono);background:var(--bg-card2);padding:2px 6px;border-radius:4px': ('inline-code', None),
    'font-size:0.78rem;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px': ('lic-key-header', None),
    'flex:1;font-family:var(--mono);font-size:0.85rem;background:var(--bg-card2);padding:10px 14px;border-radius:8px;border:1px solid var(--border-dim);color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap': ('lic-key-code', None),
    'background:var(--accent-dim);border:1px solid var(--border);border-radius:8px;color:var(--accent-hi);cursor:pointer;padding:10px 14px;font-size:0.85rem;white-space:nowrap;font-family:inherit': ('lic-copy-btn', None),
    'font-size:0.85rem;font-weight:600;color:var(--text-bright)': ('meter-label', None),
    'height:10px;background:var(--bg-card2);border-radius:10px;overflow:hidden;border:1px solid var(--border-dim)': ('progress-track', None),
    'height:8px;background:var(--bg-card2);border-radius:10px;overflow:hidden;border:1px solid var(--border-dim)': ('progress-track-sm', None),
    'font-size:0.75rem;color:var(--text-dim);margin-top:6px': ('meter-sub', None),

    # ── Progress bars (keep dynamic width+background inline) ──
    'height:100%;width:49.8%;background:var(--green);border-radius:10px;transition:width 0.4s ease,background 0.4s ease': ('progress-bar', 'width:49.8%;background:var(--green)'),
    'height:100%;width:66.7%;background:var(--amber);border-radius:10px;transition:width 0.4s ease,background 0.4s ease': ('progress-bar', 'width:66.7%;background:var(--amber)'),
    'height:100%;width:33.3%;background:var(--green);border-radius:10px;transition:width 0.4s ease,background 0.4s ease': ('progress-bar', 'width:33.3%;background:var(--green)'),

    # ── Alerts ──
    'display:none;padding:20px;border-bottom:1px solid var(--border-dim);background:var(--bg-card2)': ('alert-rule-form', 'display:none'),

    # ── SIEM ──
    'padding:14px 28px;border:2px solid var(--border);border-radius:10px;background:var(--bg-card2);color:var(--text-dim);font-size:0.95rem;font-weight:600;cursor:pointer;transition:all 0.15s;font-family:inherit': ('siem-provider-btn', None),
    'width:44px;height:24px;border-radius:12px;border:none;cursor:pointer;position:relative;background:var(--border);transition:background 0.2s': ('siem-toggle-btn', None),
    'position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:white;transition:left 0.2s': ('siem-toggle-knob', None),
    'margin-top:16px;padding:12px 16px;border-radius:8px;font-size:0.85rem;display:none': ('siem-status', 'display:none'),
    'color:var(--text-dim);font-size:0.9rem': ('siem-no-provider', None),

    # ── Onboarding (JS-toggled overlay) ──
    'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);z-index:1000;align-items:center;justify-content:center;padding:16px': ('ob-overlay', 'display:none'),
    'background:var(--bg-card);border:1px solid var(--border);border-radius:16px;width:100%;max-width:560px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.6)': ('ob-dialog', None),
    'background:linear-gradient(135deg,rgba(82,84,212,0.3),rgba(99,102,241,0.1));padding:24px 28px 20px;border-bottom:1px solid var(--border-dim)': ('ob-header', None),
    'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px': ('ob-header-row', None),
    'font-size:1.3rem;font-weight:700;color:var(--text-bright)': ('ob-title', None),
    'background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:1.2rem;line-height:1;padding:4px': ('ob-close-btn', None),
    'height:8px;border-radius:4px;transition:all 0.2s;background:var(--accent);width:24px': ('ob-dot-active', None),
    'height:8px;border-radius:4px;transition:all 0.2s;background:var(--border);width:8px': ('ob-dot', None),
    'margin-left:8px;font-size:0.75rem;color:var(--text-dim)': ('ob-step-label', None),
    'padding:28px': ('ob-content', None),
    'font-size:2.5rem;margin-bottom:16px;text-align:center': ('ob-emoji', None),
    'font-size:3rem;margin-bottom:16px;text-align:center': ('ob-emoji-lg', None),
    'font-size:1.25rem;font-weight:700;color:var(--text-bright);margin-bottom:12px;text-align:center': ('ob-heading', None),
    'font-size:1.25rem;font-weight:700;color:var(--text-bright);margin-bottom:8px;text-align:center': ('ob-heading-tight', None),
    'color:var(--text-dim);font-size:0.9rem;line-height:1.7;margin-bottom:20px;text-align:center': ('ob-paragraph', None),
    'color:var(--text-dim);font-size:0.85rem;margin-bottom:20px;text-align:center': ('ob-paragraph-sm', None),
    'background:var(--bg-card2);border:1px solid var(--border-dim);border-radius:8px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px': ('ob-feature-card', None),
    'font-size:1.2rem;flex-shrink:0': ('ob-feature-icon', None),
    'font-weight:600;color:var(--text-bright);font-size:0.88rem;margin-bottom:3px': ('ob-feature-title', None),
    'display:block;font-size:0.78rem;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px': ('ob-api-label', None),
    'width:100%;padding:12px 44px 12px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:8px;color:var(--text-bright);font-family:var(--mono);font-size:0.85rem;outline:none;transition:border-color 0.15s': ('ob-api-input', None),
    'position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:0.9rem': ('ob-eye-btn', None),
    'display:none;color:var(--red);font-size:0.78rem;margin-top:6px': ('ob-key-error', 'display:none'),
    'background:rgba(82,84,212,0.08);border:1px solid var(--border);border-radius:8px;padding:12px 14px;font-size:0.8rem;color:var(--text-dim)': ('ob-info-box', None),
    'background:#0d0d20;border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;position:relative': ('ob-curl-box', None),
    'margin:0;font-family:var(--mono);font-size:0.75rem;color:#a5b4fc;white-space:pre-wrap;word-break:break-all;line-height:1.6': ('ob-curl-pre', None),
    'position:absolute;top:10px;right:10px;background:var(--accent-dim);border:1px solid var(--border);border-radius:6px;color:var(--accent-hi);cursor:pointer;padding:5px 10px;font-size:0.75rem': ('ob-copy-btn', None),
    'background:var(--bg-card2);border:1px solid var(--border-dim);border-radius:8px;padding:12px': ('ob-example-box', None),
    'font-family:var(--mono);font-size:0.78rem;color:var(--green)': ('ob-code-green', None),
    'font-family:var(--mono);font-size:0.78rem;color:var(--red)': ('ob-code-red', None),
    'background:var(--bg-card2);border:1px solid var(--border-dim);border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:12px': ('ob-next-item', None),
    'font-size:1.1rem': ('ob-next-icon', None),
    'font-weight:600;color:var(--text-bright);font-size:0.85rem': ('ob-next-title', None),
    'padding:16px 28px 24px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border-dim)': ('ob-footer', None),
    'background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:0.82rem;padding:4px 8px': ('ob-skip-btn', None),
    'display:none;background:var(--bg-card2);border:1px solid var(--border);border-radius:8px;color:var(--text-dim);font-weight:600;font-size:0.85rem;cursor:pointer;padding:10px 18px;font-family:inherit': ('ob-prev-btn', 'display:none'),
    'background:var(--accent);border:none;border-radius:8px;color:white;font-weight:600;font-size:0.85rem;cursor:pointer;padding:10px 20px;font-family:inherit;display:inline-flex;align-items:center;gap:6px': ('ob-next-btn', None),
}

# Note: 'font-size:0.82rem;color:var(--text-dim)' and 'font-size:0.78rem;color:var(--text-dim)' overlap.
# The map uses last-defined value. Let's use separate handling in the code.
# Actually in Python dicts, last value wins. Let me ensure correct naming.
# 'font-size:0.82rem;color:var(--text-dim)' appears 5x - used as text-sm-dim, policy-meta, count-label, siem-label, arrow-separator
# 'font-size:0.78rem;color:var(--text-dim)' appears 8x - used as auto-refresh-label, history-meta, ob-next-desc, lic-key-meta
# Since dict map applies globally, one class name for each. Let me use "text-sm-dim" for 0.82 and keep "history-meta" for 0.78.
# Wait - the dict already has BOTH keys with different values. Let me check overlaps.
# The above dict has:
#   'font-size:0.82rem;color:var(--text-dim)': ('text-sm-dim',...) at line ~362
#   'font-size:0.82rem;color:var(--text-dim)': ('siem-label',...) at line ~395
# The second one overwrites! I need to remove the duplicate.
# Let me fix by keeping just one entry per style value.

# Fix duplicates - remove the siem-label override, keep text-sm-dim
# Actually the dict is defined inline above. Let me verify there's no duplicate key.
# Checking: 'font-size:0.78rem;color:var(--text-dim)' appears twice (history-meta and auto-refresh-label).
# I need to pick ONE class name for each unique style value.

def process_tag(match: re.Match[str]) -> str:
    """Process a single HTML tag, replacing style with class where mapped."""
    full_tag: str = match.group(0)

    # Extract the style attribute value
    style_m = re.search(r'style="([^"]*)"', full_tag)
    if not style_m:
        return full_tag

    style_val = style_m.group(1)

    # Look up in map
    if style_val not in STYLE_MAP:
        return full_tag

    css_class, keep = STYLE_MAP[style_val]

    # Replace or remove the style attribute
    if keep:
        new_tag = full_tag.replace(f'style="{style_val}"', f'style="{keep}"')
    else:
        # Remove style attribute
        new_tag = full_tag.replace(f' style="{style_val}"', '')
        if new_tag == full_tag:
            new_tag = full_tag.replace(f'style="{style_val}"', '')

    # Add the CSS class
    class_m = re.search(r'class="([^"]*)"', new_tag)
    if class_m:
        old_classes = class_m.group(1)
        new_tag = new_tag.replace(f'class="{old_classes}"', f'class="{old_classes} {css_class}"')
    else:
        # Add class after the tag name
        tag_name_m = re.match(r'(<\w+)', new_tag)
        if tag_name_m:
            new_tag = tag_name_m.group(1) + f' class="{css_class}"' + new_tag[tag_name_m.end():]

    return new_tag


# ── Main ──────────────────────────────────────────────────────────────

with open('dashboard/index.html', 'r') as f:
    html = f.read()

initial_count = len(re.findall(r'style="', html))
print(f"Initial inline style count: {initial_count}")

# Process all tags with style attributes
html = re.sub(r'<[a-zA-Z][^>]*style="[^"]*"[^>]*/?>',  process_tag, html, flags=re.DOTALL)

final_count = len(re.findall(r'style="', html))
extracted = initial_count - final_count
print(f"Final inline style count: {final_count}")
print(f"Styles extracted: {extracted}")
print(f"Styles remaining: {final_count}")

with open('dashboard/index.html', 'w') as f:
    _ = f.write(html)

# Append CSS to dashboard.css
with open('dashboard/dashboard.css', 'a') as f:
    _ = f.write(CSS_ADDITION)

print("\nCSS classes appended to dashboard/dashboard.css")
print("Done!")
