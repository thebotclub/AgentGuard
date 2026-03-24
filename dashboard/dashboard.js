// ── Config ──────────────────────────────────────────────
// Auto-detect API base URL:
//   - If running on agentguard.tech / app.agentguard.tech → use production API
//   - If running locally (localhost / 127.0.0.1 / non-production) → use same origin
const _isProductionHost = ['agentguard.tech', 'app.agentguard.tech'].some(
  h => window.location.hostname === h || window.location.hostname.endsWith('.' + h)
);
const API_BASE = _isProductionHost ? 'https://api.agentguard.tech' : window.location.origin;
const API_PRIMARY = API_BASE;
const API_FALLBACK = API_BASE;
let API = API_BASE; // Updated after health check if needed

let sessionId = null;
let allEvents = [];
let killActive = false;
let totalLatency = 0;
let evalCount = 0;
let storedApiKey = null;

// ── API Key Management ─────────────────────────────────
function saveApiKey(key) {
  storedApiKey = key.trim();
  if (storedApiKey) {
    try { localStorage.setItem('ag_dashboard_api_key', storedApiKey); } catch {}
    document.getElementById('api-key-input').value = storedApiKey;
  }
  loadApiKey();
  // Hide no-key banner once a key is entered
  var demoBanner = document.getElementById('demo-banner');
  if (demoBanner && storedApiKey) demoBanner.style.display = 'none';
  // Trigger data reload
  if (storedApiKey) {
    loadDashboardStats();
    loadDashboardFeed();
    loadUsageStats();
    loadAuditTrail();
    loadApprovals();
  }
}

function loadApiKey() {
  try {
    var saved = localStorage.getItem('ag_dashboard_api_key');
    if (saved) {
      storedApiKey = saved;
      document.getElementById('api-key-input').value = saved;
    }
  } catch {}

  // Check URL hash for key passed from landing page signup
  // Format: app.agentguard.tech/#key=ag_live_xxx
  if (!storedApiKey) {
    try {
      var hash = window.location.hash;
      if (hash) {
        var params = new URLSearchParams(hash.substring(1));
        var hashKey = params.get('key');
        if (hashKey && hashKey.startsWith('ag_live_')) {
          storedApiKey = hashKey;
          document.getElementById('api-key-input').value = hashKey;
          try { localStorage.setItem('ag_dashboard_api_key', hashKey); } catch {}
          // Clear hash from URL (don't leave key visible)
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
    } catch {}
  }

  // Check URL query param as fallback (?key=ag_live_xxx)
  if (!storedApiKey) {
    try {
      var urlKey = new URLSearchParams(window.location.search).get('key');
      if (urlKey && urlKey.startsWith('ag_live_')) {
        storedApiKey = urlKey;
        document.getElementById('api-key-input').value = urlKey;
        try { localStorage.setItem('ag_dashboard_api_key', urlKey); } catch {}
        // Clear query param from URL
        history.replaceState(null, '', window.location.pathname);
      }
    } catch {}
  }
}

function getApiHeaders() {
  var headers = { 'Content-Type': 'application/json' };
  if (storedApiKey) {
    headers['X-API-Key'] = storedApiKey;
  }
  return headers;
}

// ── Load Usage Stats from API ───────────────────────────
async function loadUsageStats() {
  if (!storedApiKey) return; // Need API key for real data
  
  for (var i = 0; i < 2; i++) {
    var baseUrl = i === 0 ? API_PRIMARY : API_FALLBACK;
    try {
      var r = await fetch(baseUrl + '/api/v1/usage', {
        headers: getApiHeaders(),
        signal: AbortSignal.timeout(10000)
      });
      if (r.ok) {
        var data = await r.json();
        // Update stats
        document.getElementById('stat-total').textContent = data.totalEvaluations || 0;
        document.getElementById('stat-allowed').textContent = data.allowed || 0;
        document.getElementById('stat-blocked').textContent = data.blocked || 0;
        var total = data.totalEvaluations || 1;
        document.getElementById('stat-allow-pct').textContent = Math.round(data.allowed / total * 100) + '%';
        document.getElementById('stat-block-pct').textContent = Math.round(data.blocked / total * 100) + '%';
        document.getElementById('stat-latency').textContent = (data.avgLatencyMs || 0) + 'ms';
        return;
      }
    } catch {}
  }
}

// ── Load Audit Trail from API ──────────────────────────
async function loadAuditTrail() {
  if (!storedApiKey) return;
  
  for (var i = 0; i < 2; i++) {
    var baseUrl = i === 0 ? API_PRIMARY : API_FALLBACK;
    try {
      var r = await fetch(baseUrl + '/api/v1/audit', {
        headers: getApiHeaders(),
        signal: AbortSignal.timeout(10000)
      });
      if (r.ok) {
        var data = await r.json();
        var events = data.events || [];
        document.getElementById('audit-count').textContent = events.length;
        
        var tbody = document.getElementById('audit-tbody');
        if (events.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-dim);padding:24px">No audit events yet</td></tr>';
          return;
        }
        
        tbody.innerHTML = events.map(function(e, idx) {
          var res = e.result || e.decision || '';
          var badgeClass = res === 'allow' ? 'badge-allow' : res === 'block' ? 'badge-block' : 'badge-monitor';
          return '<tr>' +
            '<td style="font-family:var(--mono);font-size:0.82rem">' + (idx + 1) + '</td>' +
            '<td style="font-family:var(--mono);font-size:0.82rem;color:var(--text-dim)">' + (e.createdAt || e.timestamp || '').replace('T', ' ').slice(0, 19) + '</td>' +
            '<td style="font-family:var(--mono);font-size:0.82rem">' + esc(e.tool || '') + '</td>' +
            '<td><span class="badge ' + badgeClass + '">' + esc(res) + '</span></td>' +
            '<td style="font-family:var(--mono);font-size:0.82rem;color:var(--text-dim)">' + esc(e.ruleId || e.matchedRuleId || '—') + '</td>' +
            '<td style="font-family:var(--mono);font-size:0.82rem;color:' + ((e.riskScore || 0) > 50 ? 'var(--red)' : 'var(--green)') + '">' + (e.riskScore || 0) + '</td>' +
            '<td style="font-family:var(--mono);font-size:0.82rem;color:var(--accent-hi)">' + (e.durationMs || 0) + 'ms</td>' +
            '<td style="font-family:var(--mono);font-size:0.75rem;color:var(--text-dim)">' + (e.hash || '—') + '</td>' +
            '</tr>';
        }).join('');
        return;
      }
    } catch {}
  }
}

// ── Verify Integrity ───────────────────────────────────
async function verifyIntegrity() {
  if (!storedApiKey) {
    alert('Please enter your API key first');
    return;
  }
  
  var btn = document.getElementById('verify-btn');
  btn.disabled = true;
  btn.textContent = 'Verifying...';
  
  var resultEl = document.getElementById('verify-result');
  resultEl.style.display = 'none';
  
  for (var i = 0; i < 2; i++) {
    var baseUrl = i === 0 ? API_PRIMARY : API_FALLBACK;
    try {
      var r = await fetch(baseUrl + '/api/v1/audit/verify', {
        headers: getApiHeaders(),
        signal: AbortSignal.timeout(15000)
      });
      if (r.ok) {
        var data = await r.json();
        resultEl.style.display = 'block';
        if (data.valid) {
          resultEl.style.background = 'rgba(34,197,94,0.08)';
          resultEl.style.borderColor = 'rgba(34,197,94,0.25)';
          resultEl.innerHTML = '✓ <strong>Audit trail integrity verified</strong> — ' + data.message + ' (' + data.eventsVerified + ' events verified)';
        } else {
          resultEl.style.background = 'rgba(239,68,68,0.08)';
          resultEl.style.borderColor = 'rgba(239,68,68,0.25)';
          resultEl.innerHTML = '✕ <strong>Integrity check failed</strong> — ' + data.message;
        }
        btn.disabled = false;
        btn.textContent = '🔒 Verify Integrity';
        return;
      }
    } catch {}
  }
  
  resultEl.style.display = 'block';
  resultEl.style.background = 'rgba(245,158,11,0.08)';
  resultEl.style.borderColor = 'rgba(245,158,11,0.25)';
  resultEl.innerHTML = '⚠ Could not verify integrity — API may be unavailable';
  btn.disabled = false;
  btn.textContent = '🔒 Verify Integrity';
}

// ── XSS Escape Helper ───────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Mobile Nav ───────────────────────────────────────────
function openMobileNav() {
  document.getElementById('mobile-nav-overlay').classList.add('open');
  document.getElementById('mobile-nav-drawer').classList.add('open');
}
function closeMobileNav() {
  document.getElementById('mobile-nav-overlay').classList.remove('open');
  document.getElementById('mobile-nav-drawer').classList.remove('open');
}

// ── Agents Management ───────────────────────────────────
function showCreateAgent() {
  var el = document.getElementById('create-agent-form');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function loadAgents() {
  if (!storedApiKey) { document.getElementById('agents-tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:24px">Enter your API key to manage agents</td></tr>'; return; }
  try {
    var r = await fetch(API + '/api/v1/agents', { headers: getApiHeaders(), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();
    var agents = data.agents || [];
    var tbody = document.getElementById('agents-tbody');
    if (agents.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:24px">No agents created yet</td></tr>'; return; }
    tbody.innerHTML = agents.map(function(a) {
      return '<tr style="border-bottom:1px solid var(--border-dim)">' +
        '<td style="padding:12px 16px;font-weight:600;color:var(--text-bright)">' + esc(a.name) + '</td>' +
        '<td style="padding:12px 16px;font-family:var(--mono);font-size:0.82rem;color:var(--accent-hi)">' + esc(a.policyScope || '—') + '</td>' +
        '<td style="padding:12px 16px"><span class="badge badge-allow">' + esc(a.status || 'active') + '</span></td>' +
        '<td style="padding:12px 16px;font-size:0.82rem;color:var(--text-dim)">' + (a.createdAt || '').replace('T', ' ').slice(0, 19) + '</td>' +
        '<td style="padding:12px 16px;text-align:right"><button class="btn btn-ghost" style="color:var(--red);font-size:0.78rem" onclick="deleteAgent(\'' + esc(a.id) + '\')">Delete</button></td>' +
        '</tr>';
    }).join('');
  } catch (e) { document.getElementById('agents-tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red);padding:24px">Failed to load agents</td></tr>'; }
}

async function loadReadiness() {
  if (!storedApiKey) { document.getElementById('readiness-tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:24px">Enter your API key to view readiness</td></tr>'; return; }
  try {
    var r = await fetch(API + '/api/v1/agents', { headers: getApiHeaders(), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();
    var agents = data.agents || [];
    
    var stats = { registered: 0, validated: 0, certified: 0, unscoped: 0 };
    agents.forEach(function(a) {
      var status = a.status || 'registered';
      stats.registered++;
      if (status === 'validated') stats.validated++;
      else if (status === 'certified') stats.certified++;
      if (!a.policyScope) stats.unscoped++;
    });
    document.getElementById('stat-registered').textContent = stats.registered;
    document.getElementById('stat-validated').textContent = stats.validated;
    document.getElementById('stat-certified').textContent = stats.certified;
    document.getElementById('stat-unscoped').textContent = stats.unscoped;
    
    var tbody = document.getElementById('readiness-tbody');
    if (agents.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:24px">No agents to display</td></tr>'; return; }
    tbody.innerHTML = agents.map(function(a) {
      var status = a.status || 'registered';
      var badgeClass = status === 'certified' ? 'badge-allow' : status === 'validated' ? 'badge-monitor' : 'badge-block';
      var certDate = a.certifiedAt ? a.certifiedAt.replace('T', ' ').slice(0, 10) : '—';
      var expDate = a.certificationExpiresAt ? a.certificationExpiresAt.replace('T', ' ').slice(0, 10) : '—';
      var coverage = a.validationCoverage !== null && a.validationCoverage !== undefined ? a.validationCoverage + '%' : '—';
      return '<tr style="border-bottom:1px solid var(--border-dim)">' +
        '<td style="padding:12px 16px;font-weight:600;color:var(--text-bright)">' + esc(a.name) + '</td>' +
        '<td style="padding:12px 16px"><span class="badge ' + badgeClass + '">' + esc(status) + '</span></td>' +
        '<td style="padding:12px 16px;font-family:var(--mono);color:var(--accent-hi)">' + coverage + '</td>' +
        '<td style="padding:12px 16px;font-size:0.82rem;color:var(--text-dim)">' + certDate + '</td>' +
        '<td style="padding:12px 16px;font-size:0.82rem;color:var(--text-dim)">' + expDate + '</td>' +
        '<td style="padding:12px 16px;text-align:right"><button class="btn btn-ghost" style="font-size:0.78rem" onclick="validateAgent(\'' + esc(a.id) + '\')">Validate</button></td>' +
        '</tr>';
    }).join('');
  } catch (e) { document.getElementById('readiness-tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red);padding:24px">Failed to load readiness data</td></tr>'; }
}

async function validateAgent(id) {
  if (!confirm('Run validation for this agent?')) return;
  try {
    var r = await fetch(API + '/api/v1/agents/' + id + '/validate', { method: 'POST', headers: getApiHeaders(), signal: AbortSignal.timeout(15000) });
    var data = await r.json();
    if (r.ok && data.valid) { alert('✅ Agent validated! Coverage: ' + data.coverage + '%'); loadReadiness(); }
    else { alert('❌ Validation failed: ' + (data.error || 'Unknown error')); }
  } catch (e) { alert('Error: ' + e.message); }
}

async function createAgent() {
  var name = document.getElementById('agent-name').value.trim();
  var scope = document.getElementById('agent-scope').value.trim();
  if (!name) { alert('Agent name is required'); return; }
  try {
    var r = await fetch(API + '/api/v1/agents', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify({ name: name, policy_scope: scope || undefined }) });
    var data = await r.json();
    if (r.ok) {
      document.getElementById('agent-create-result').innerHTML = '<div style="padding:12px;background:rgba(34,197,94,0.08);border-radius:8px;border:1px solid rgba(34,197,94,0.25)"><strong>Agent created!</strong> Key: <code style="font-family:var(--mono);color:var(--accent-hi);user-select:all">' + esc(data.apiKey) + '</code><br><span style="font-size:0.78rem;color:var(--text-dim)">Save this key — it won\'t be shown again.</span></div>';
      document.getElementById('agent-name').value = '';
      document.getElementById('agent-scope').value = '';
      loadAgents();
    } else { document.getElementById('agent-create-result').innerHTML = '<div style="color:var(--red)">' + esc(data.error || 'Failed') + '</div>'; }
  } catch { document.getElementById('agent-create-result').innerHTML = '<div style="color:var(--red)">API error</div>'; }
}

async function deleteAgent(id) {
  if (!confirm('Delete this agent? This will revoke its API key immediately.')) return;
  try {
    await fetch(API + '/api/v1/agents/' + id, { method: 'DELETE', headers: getApiHeaders() });
    loadAgents();
  } catch {}
}

// ── Webhooks Management ─────────────────────────────────
function showCreateWebhook() {
  var el = document.getElementById('create-webhook-form');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function loadWebhooks() {
  if (!storedApiKey) { document.getElementById('webhooks-tbody').innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:24px">Enter your API key to manage webhooks</td></tr>'; return; }
  try {
    var r = await fetch(API + '/api/v1/webhooks', { headers: getApiHeaders(), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();
    var hooks = data.webhooks || [];
    var tbody = document.getElementById('webhooks-tbody');
    if (hooks.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:24px">No webhooks configured</td></tr>'; return; }
    tbody.innerHTML = hooks.map(function(w) {
      return '<tr style="border-bottom:1px solid var(--border-dim)">' +
        '<td style="padding:12px 16px;font-family:var(--mono);font-size:0.82rem;max-width:300px;overflow:hidden;text-overflow:ellipsis">' + esc(w.url) + '</td>' +
        '<td style="padding:12px 16px">' + (w.events || []).map(function(e) { return '<span class="badge badge-block" style="margin:2px">' + esc(e) + '</span>'; }).join('') + '</td>' +
        '<td style="padding:12px 16px;font-size:0.82rem;color:var(--text-dim)">' + (w.createdAt || '').replace('T', ' ').slice(0, 19) + '</td>' +
        '<td style="padding:12px 16px;text-align:right"><button class="btn btn-ghost" style="color:var(--red);font-size:0.78rem" onclick="deleteWebhook(\'' + esc(w.id) + '\')">Delete</button></td>' +
        '</tr>';
    }).join('');
  } catch { document.getElementById('webhooks-tbody').innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--red);padding:24px">Failed to load webhooks</td></tr>'; }
}

async function createWebhook() {
  var url = document.getElementById('webhook-url').value.trim();
  var sel = document.getElementById('webhook-events');
  var events = Array.from(sel.selectedOptions).map(function(o) { return o.value; });
  if (!url) { alert('Webhook URL is required'); return; }
  try {
    var r = await fetch(API + '/api/v1/webhooks', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify({ url: url, events: events }) });
    var data = await r.json();
    if (r.ok) {
      document.getElementById('webhook-create-result').innerHTML = '<div style="color:var(--green)">✓ Webhook added</div>';
      document.getElementById('webhook-url').value = '';
      loadWebhooks();
    } else { document.getElementById('webhook-create-result').innerHTML = '<div style="color:var(--red)">' + esc(data.error || 'Failed') + '</div>'; }
  } catch { document.getElementById('webhook-create-result').innerHTML = '<div style="color:var(--red)">API error</div>'; }
}

async function deleteWebhook(id) {
  if (!confirm('Delete this webhook?')) return;
  try { await fetch(API + '/api/v1/webhooks/' + id, { method: 'DELETE', headers: getApiHeaders() }); loadWebhooks(); } catch {}
}

// ── Rate Limits Management ──────────────────────────────
function showCreateRateLimit() {
  var el = document.getElementById('create-ratelimit-form');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function loadRateLimits() {
  if (!storedApiKey) { document.getElementById('ratelimits-tbody').innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:24px">Enter your API key to manage rate limits</td></tr>'; return; }
  try {
    var r = await fetch(API + '/api/v1/rate-limits', { headers: getApiHeaders(), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();
    var limits = data.rateLimits || data.rate_limits || [];
    var tbody = document.getElementById('ratelimits-tbody');
    if (limits.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:24px">No rate limits configured</td></tr>'; return; }
    tbody.innerHTML = limits.map(function(l) {
      var windowStr = l.window_seconds >= 3600 ? (l.window_seconds / 3600) + 'h' : l.window_seconds >= 60 ? (l.window_seconds / 60) + 'min' : l.window_seconds + 's';
      return '<tr style="border-bottom:1px solid var(--border-dim)">' +
        '<td style="padding:12px 16px;font-family:var(--mono);font-size:0.85rem">' + windowStr + '</td>' +
        '<td style="padding:12px 16px;font-family:var(--mono);font-size:0.85rem;color:var(--accent-hi)">' + l.max_requests + '</td>' +
        '<td style="padding:12px 16px;font-size:0.85rem;color:var(--text-dim)">' + esc(l.agent_id || 'All agents') + '</td>' +
        '<td style="padding:12px 16px;text-align:right"><button class="btn btn-ghost" style="color:var(--red);font-size:0.78rem" onclick="deleteRateLimit(\'' + esc(l.id) + '\')">Delete</button></td>' +
        '</tr>';
    }).join('');
  } catch { document.getElementById('ratelimits-tbody').innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--red);padding:24px">Failed to load rate limits</td></tr>'; }
}

async function createRateLimit() {
  var win = parseInt(document.getElementById('rl-window').value);
  var max = parseInt(document.getElementById('rl-max').value);
  var agent = document.getElementById('rl-agent').value.trim();
  try {
    var body = { windowSeconds: win, maxRequests: max };
    if (agent) body.agentId = agent;
    var r = await fetch(API + '/api/v1/rate-limits', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(body) });
    if (r.ok) { loadRateLimits(); document.getElementById('create-ratelimit-form').style.display = 'none'; }
  } catch {}
}

async function deleteRateLimit(id) {
  if (!confirm('Remove this rate limit?')) return;
  try { await fetch(API + '/api/v1/rate-limits/' + id, { method: 'DELETE', headers: getApiHeaders() }); loadRateLimits(); } catch {}
}

// ── Cost Attribution ────────────────────────────────────
async function loadCosts() {
  if (!storedApiKey) { document.getElementById('costs-tbody').innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px">Enter your API key to view costs</td></tr>'; return; }
  var period = document.getElementById('cost-period').value;
  var groupBy = document.getElementById('cost-groupby').value;
  document.getElementById('cost-col-label').textContent = groupBy === 'agent' ? 'Agent' : groupBy === 'tool' ? 'Tool' : 'Date';
  try {
    var r = await fetch(API + '/api/v1/costs/summary?period=' + period + '&groupBy=' + groupBy, { headers: getApiHeaders(), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();
    var totals = data.totals || {};
    document.getElementById('cost-total').textContent = '$' + (totals.totalCost || 0).toFixed(2);
    document.getElementById('cost-events').textContent = totals.eventCount || 0;
    document.getElementById('cost-avg').textContent = '$' + ((totals.totalCost || 0) / Math.max(totals.eventCount || 1, 1)).toFixed(4);
    var breakdown = data.breakdown || [];
    var tbody = document.getElementById('costs-tbody');
    if (breakdown.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px">No cost data for this period</td></tr>'; return; }
    tbody.innerHTML = breakdown.map(function(b) {
      return '<tr style="border-bottom:1px solid var(--border-dim)">' +
        '<td style="padding:12px 16px;font-weight:600;color:var(--text-bright)">' + esc(b.key || b.agent_id || b.tool || b.date || '—') + '</td>' +
        '<td style="padding:12px 16px;text-align:right;font-family:var(--mono);color:var(--accent-hi)">$' + (b.total_cost || b.cost || 0).toFixed(4) + '</td>' +
        '<td style="padding:12px 16px;text-align:right;font-family:var(--mono);color:var(--text-dim)">' + (b.event_count || b.count || 0) + '</td>' +
        '</tr>';
    }).join('');
  } catch { document.getElementById('costs-tbody').innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--red);padding:24px">Failed to load costs</td></tr>'; }
}

// ── Dashboard Stats (Phase 2) ───────────────────────────
async function loadDashboardStats() {
  if (!storedApiKey) return;
  try {
    var r = await fetch(API + '/api/v1/dashboard/stats', { headers: getApiHeaders(), signal: AbortSignal.timeout(10000) });
    if (!r.ok) return;
    var data = await r.json();
    var evals = data.evaluations || {};
    var total24h = evals.last24h || evals.last_24h || 0;
    document.getElementById('stat-total').textContent = total24h;
    // Sum allowed/blocked from hourly breakdown
    var hours = data.evaluationsByHour || [];
    var allowed = 0, blocked = 0;
    hours.forEach(function(h) { allowed += (h.allowed || 0); blocked += (h.blocked || 0); });
    document.getElementById('stat-allowed').textContent = allowed;
    document.getElementById('stat-blocked').textContent = blocked;
    var denom = Math.max(total24h, 1);
    document.getElementById('stat-allow-pct').textContent = Math.round((allowed / denom) * 100) + '%';
    document.getElementById('stat-block-pct').textContent = Math.round((blocked / denom) * 100) + '%';
    if (data.avgLatencyMs !== undefined) document.getElementById('stat-latency').textContent = data.avgLatencyMs.toFixed(2) + 'ms';
    // Update sidebar engine info
    var info = document.getElementById('sidebar-engine-info');
    if (info) info.innerHTML = 'Agents: ' + (data.activeAgents24h || 0) + ' active<br>Block rate: ' + (data.blockRatePercent || 0) + '%';
    // Render charts
    renderCharts(data);
  } catch {}
}

// ── Charts ───────────────────────────────────────────────
function renderCharts(data) {
  var hours = data.evaluationsByHour || [];
  if (!hours.length) return;

  // Show the charts row
  var row = document.getElementById('charts-row');
  row.style.display = 'grid';

  // ── Bar Chart ────────────────────────────────────────
  var svg = document.getElementById('chart-bar-svg');
  var W = 800, H = 160, pad = { top: 12, bottom: 28, left: 6, right: 6 };
  var innerW = W - pad.left - pad.right;
  var innerH = H - pad.top - pad.bottom;

  // Ensure we have 24 buckets (fill gaps with zeros)
  var nowHour = new Date().getUTCHours();
  var buckets = [];
  for (var i = 0; i < 24; i++) {
    var h = (nowHour - 23 + i + 24) % 24;
    var found = null;
    for (var j = 0; j < hours.length; j++) {
      if ((hours[j].hour % 24) === h) { found = hours[j]; break; }
    }
    buckets.push(found || { hour: h, total: 0, allowed: 0, blocked: 0, monitored: 0 });
  }

  var maxVal = 1;
  for (var i = 0; i < buckets.length; i++) {
    var t = (buckets[i].allowed || 0) + (buckets[i].blocked || 0) + (buckets[i].monitored || 0);
    if (t > maxVal) maxVal = t;
  }

  var n = buckets.length;
  var gap = 3;
  var barW = Math.max(2, (innerW - (n - 1) * gap) / n);
  var svgParts = [];

  // Grid lines
  var gridSteps = 3;
  for (var g = 0; g <= gridSteps; g++) {
    var gy = pad.top + innerH - Math.round((g / gridSteps) * innerH);
    svgParts.push('<line x1="' + pad.left + '" y1="' + gy + '" x2="' + (W - pad.right) + '" y2="' + gy +
      '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>');
  }

  for (var i = 0; i < n; i++) {
    var b = buckets[i];
    var x = pad.left + i * (barW + gap);
    var allowed = b.allowed || 0;
    var blocked = b.blocked || 0;
    var total = allowed + blocked + (b.monitored || 0);
    var totalH = Math.round((total / maxVal) * innerH);
    var allowedH = total > 0 ? Math.round((allowed / total) * totalH) : 0;
    var blockedH = totalH - allowedH;
    var baseY = pad.top + innerH;

    // Stacked bar: allowed (green) on bottom, blocked (red) on top
    if (allowedH > 0) {
      svgParts.push('<rect x="' + x.toFixed(1) + '" y="' + (baseY - allowedH) + '" width="' + barW.toFixed(1) + '" height="' + allowedH +
        '" fill="#22c55e" rx="1" opacity="0.85"/>');
    }
    if (blockedH > 0) {
      svgParts.push('<rect x="' + x.toFixed(1) + '" y="' + (baseY - allowedH - blockedH) + '" width="' + barW.toFixed(1) + '" height="' + blockedH +
        '" fill="#ef4444" rx="1" opacity="0.85"/>');
    }

    // Hour label every 4 bars
    if (i % 4 === 0) {
      var label = String(b.hour).padStart(2, '0') + 'h';
      svgParts.push('<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (H - 6) + '" fill="rgba(148,163,184,0.7)" font-size="9" text-anchor="middle">' + label + '</text>');
    }
  }

  svg.innerHTML = svgParts.join('');

  // Update meta
  var totalAllowed = 0, totalBlocked = 0;
  for (var i = 0; i < buckets.length; i++) { totalAllowed += (buckets[i].allowed || 0); totalBlocked += (buckets[i].blocked || 0); }
  var meta = document.getElementById('chart-bar-meta');
  if (meta) meta.textContent = (totalAllowed + totalBlocked) + ' total · peak ' + maxVal;

  // ── Donut Chart ──────────────────────────────────────
  var dSvg = document.getElementById('chart-donut-svg');
  var monitored = 0;
  for (var i = 0; i < buckets.length; i++) { monitored += (buckets[i].monitored || 0); }
  var grandTotal = totalAllowed + totalBlocked + monitored;

  if (grandTotal === 0) {
    dSvg.innerHTML = '<text x="70" y="70" fill="var(--text-dim)" font-size="11" text-anchor="middle" dominant-baseline="middle">No data</text>';
    document.getElementById('chart-donut-legend').innerHTML = '';
    return;
  }

  var cx = 70, cy = 70, r = 52, strokeW = 18;
  var circumference = 2 * Math.PI * r;
  var segments = [
    { label: 'Allowed', value: totalAllowed, color: '#22c55e' },
    { label: 'Blocked', value: totalBlocked, color: '#ef4444' },
    { label: 'Monitored', value: monitored, color: '#818cf8' }
  ].filter(function(s) { return s.value > 0; });

  var dParts = [];
  // Background circle
  dParts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="' + strokeW + '"/>');

  var offset = 0; // start at top: rotate -90deg via transform
  for (var i = 0; i < segments.length; i++) {
    var frac = segments[i].value / grandTotal;
    var dash = frac * circumference;
    var gap2 = circumference - dash;
    dParts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + segments[i].color +
      '" stroke-width="' + strokeW + '" stroke-dasharray="' + dash.toFixed(2) + ' ' + gap2.toFixed(2) +
      '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" opacity="0.9"/>');
    offset += dash;
  }

  // Centre label: biggest segment %
  var bigSeg = segments[0];
  for (var i = 1; i < segments.length; i++) { if (segments[i].value > bigSeg.value) bigSeg = segments[i]; }
  var bigPct = Math.round((bigSeg.value / grandTotal) * 100);
  dParts.push('<text x="' + cx + '" y="' + (cy - 7) + '" fill="' + bigSeg.color + '" font-size="20" font-weight="700" text-anchor="middle" dominant-baseline="middle">' + bigPct + '%</text>');
  dParts.push('<text x="' + cx + '" y="' + (cy + 12) + '" fill="rgba(148,163,184,0.8)" font-size="9" text-anchor="middle">' + bigSeg.label + '</text>');

  dSvg.innerHTML = dParts.join('');

  // Legend
  var legend = document.getElementById('chart-donut-legend');
  legend.innerHTML = segments.map(function(s) {
    var pct = Math.round((s.value / grandTotal) * 100);
    return '<div style="display:flex;align-items:center;justify-content:space-between">' +
      '<span style="display:flex;align-items:center;gap:6px">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + s.color + ';flex-shrink:0"></span>' +
        '<span style="color:var(--text-dim)">' + s.label + '</span>' +
      '</span>' +
      '<span style="font-family:var(--mono);font-size:0.78rem;color:var(--text-bright)">' + pct + '%</span>' +
    '</div>';
  }).join('');
}

async function loadDashboardFeed() {
  if (!storedApiKey) return;
  try {
    var r = await fetch(API + '/api/v1/dashboard/feed?limit=10', { headers: getApiHeaders(), signal: AbortSignal.timeout(10000) });
    if (!r.ok) return;
    var data = await r.json();
    var events = data.events || [];
    if (events.length === 0) return;
    var feed = document.getElementById('recent-feed');
    feed.innerHTML = '';
    events.forEach(function(e) {
      var colors = { allow: 'var(--green)', block: 'var(--red)', monitor: 'var(--accent-hi)', hitl_required: 'var(--amber)' };
      var result = e.result || e.decision || '';
      var c = colors[result] || 'var(--text-dim)';
      var time = (e.createdAt || e.timestamp || '').replace('T', ' ').slice(11, 19);
      var div = document.createElement('div');
      div.className = 'feed-item';
      div.innerHTML = '<div class="feed-dot" style="background:' + c + '"></div>' +
        '<div class="feed-time">' + esc(time) + '</div>' +
        '<div class="feed-content"><div class="feed-tool">' + esc(e.tool || '') + ' → <span style="color:' + c + ';font-weight:600">' + esc(result.toUpperCase()) + '</span></div>' +
        '<div class="feed-rule">' + esc(e.ruleId || e.matchedRuleId || 'default') + ' · risk ' + (e.riskScore || 0) + ' · ' + (e.durationMs || 0) + 'ms</div></div>';
      feed.appendChild(div);
    });
  } catch {}
}

// ── License Page ─────────────────────────────────────────

// Stored raw license key (unmasked) for copy functionality
var _licenseKeyRaw = null;

var LICENSE_FEATURES = [
  { key: 'evaluate',  label: 'Core evaluate',          tier: 'Free',       free: true },
  { key: 'audit',     label: 'Audit trail',             tier: 'Free',       free: true },
  { key: 'hitl',      label: 'HITL approvals',          tier: 'Free',       free: true },
  { key: 'siem',      label: 'SIEM export',             tier: 'Pro+',       free: false },
  { key: 'sso',       label: 'SSO / SAML',              tier: 'Pro+',       free: false },
  { key: 'a2a',       label: 'Multi-agent A2A',         tier: 'Pro+',       free: false },
  { key: 'anomaly',   label: 'ML anomaly detection',    tier: 'Enterprise', free: false },
];

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function licUsageColor(pct) {
  if (pct >= 80) return 'var(--red)';
  if (pct >= 60) return 'var(--amber)';
  return 'var(--green)';
}

function renderLicenseFeatures(enabledKeys) {
  var el = document.getElementById('lic-features-list');
  if (!el) return;
  el.innerHTML = LICENSE_FEATURES.map(function(f) {
    var enabled = enabledKeys ? enabledKeys.includes(f.key) : f.free;
    var icon = enabled ? '✅' : '🔒';
    var tierCls = f.tier === 'Free' ? 'lic-feature-tier-free' : f.tier === 'Pro+' ? 'lic-feature-tier-pro' : 'lic-feature-tier-ent';
    var lockedCls = enabled ? '' : ' lic-feature-locked';
    return '<div class="lic-feature-row' + lockedCls + '">' +
      '<span class="lic-feature-icon">' + icon + '</span>' +
      '<span class="lic-feature-name">' + esc(f.label) + '</span>' +
      '<span class="lic-feature-tier ' + tierCls + '">' + esc(f.tier) + '</span>' +
    '</div>';
  }).join('');
}

function renderUsageHistory(history) {
  var tbody = document.getElementById('lic-history-body');
  if (!tbody) return;
  if (!history || !history.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:20px">No history available</td></tr>';
    return;
  }
  tbody.innerHTML = history.map(function(row) {
    var pct = row.limit > 0 ? Math.round(row.events / row.limit * 100) : 0;
    var color = licUsageColor(pct);
    return '<tr>' +
      '<td style="font-weight:500">' + esc(row.month) + '</td>' +
      '<td style="text-align:right;font-family:var(--mono)">' + (row.events || 0).toLocaleString() + '</td>' +
      '<td style="text-align:right">' +
        '<span style="font-family:var(--mono);font-weight:600;color:' + color + '">' + pct + '%</span>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function applyLicenseStatus(data) {
  // Plan badge
  var badge = document.getElementById('lic-plan-badge');
  var sub = document.getElementById('lic-plan-sub');
  var tier = (data.tier || 'free').toLowerCase();
  if (badge) {
    badge.textContent = tier === 'enterprise' ? 'Enterprise' : tier === 'pro' ? 'Pro Plan' : 'Free Plan';
    badge.className = '';
    badge.style.cssText = 'display:inline-block;padding:10px 32px;border-radius:40px;font-size:1.35rem;font-weight:700;letter-spacing:0.04em;margin-bottom:16px';
    if (tier === 'enterprise') {
      badge.style.background = 'rgba(245,158,11,0.12)';
      badge.style.color = '#f59e0b';
      badge.style.border = '2px solid rgba(245,158,11,0.3)';
    } else if (tier === 'pro') {
      badge.style.background = 'rgba(99,102,241,0.12)';
      badge.style.color = '#818cf8';
      badge.style.border = '2px solid rgba(99,102,241,0.3)';
    } else {
      badge.style.background = 'rgba(34,197,94,0.12)';
      badge.style.color = '#22c55e';
      badge.style.border = '2px solid rgba(34,197,94,0.3)';
    }
  }
  if (sub) {
    var subText = {
      free:       '100,000 events/month · 3 agents · 30-day retention',
      pro:        '500,000 events/month · 25 agents · 90-day retention',
      enterprise: 'Unlimited events · custom seats · custom retention'
    };
    sub.textContent = subText[tier] || subText.free;
  }

  // Hide upgrade CTA for paid tiers
  var ctaBtn = document.querySelector('#page-license .btn-primary');
  if (ctaBtn && tier !== 'free') ctaBtn.style.display = 'none';

  // License key section
  var freeSec = document.getElementById('lic-key-section-free');
  var proSec = document.getElementById('lic-key-section-pro');
  if (data.licenseKey) {
    _licenseKeyRaw = data.licenseKey;
    var masked = data.licenseKey.length > 12
      ? data.licenseKey.slice(0, 8) + '•'.repeat(data.licenseKey.length - 12) + data.licenseKey.slice(-4)
      : data.licenseKey;
    var keyDisplay = document.getElementById('lic-key-display');
    if (keyDisplay) keyDisplay.textContent = masked;
    var meta = document.getElementById('lic-key-meta');
    if (meta) {
      meta.innerHTML =
        (data.expiresAt ? '<div style="margin-bottom:4px">Expires: <strong>' + new Date(data.expiresAt).toLocaleDateString() + '</strong></div>' : '') +
        (data.tenantId  ? '<div>Tenant: <code style="font-family:var(--mono);font-size:0.78rem">' + esc(data.tenantId) + '</code></div>' : '');
    }
    if (freeSec) freeSec.style.display = 'none';
    if (proSec)  proSec.style.display  = 'block';
  } else {
    if (freeSec) freeSec.style.display = 'block';
    if (proSec)  proSec.style.display  = 'none';
  }

  // Features
  renderLicenseFeatures(data.features || null);
}

function applyUsageData(data) {
  var eventsUsed  = data.eventsUsed  || 0;
  var eventsLimit = data.eventsLimit || 25000;
  var agentsUsed  = data.agentsUsed  || 0;
  var agentsLimit = data.agentsLimit || 3;
  var hitlUsed    = data.hitlUsed    || 0;
  var hitlLimit   = data.hitlLimit   || 3;
  var daysLeft    = data.daysUntilReset || 0;

  // Events bar
  var evtPct = Math.min(Math.round(eventsUsed / eventsLimit * 100), 100);
  var evtBar = document.getElementById('lic-events-bar');
  var evtLbl = document.getElementById('lic-events-label');
  var evtSub = document.getElementById('lic-events-sub');
  if (evtBar) { evtBar.style.width = evtPct + '%'; evtBar.style.background = licUsageColor(evtPct); }
  if (evtLbl) evtLbl.textContent = eventsUsed.toLocaleString() + ' / ' + eventsLimit.toLocaleString();
  if (evtSub) evtSub.textContent = evtPct + '% used · resets in ' + daysLeft + ' days';

  // Agents bar
  var agPct = Math.min(Math.round(agentsUsed / agentsLimit * 100), 100);
  var agBar = document.getElementById('lic-agents-bar');
  var agLbl = document.getElementById('lic-agents-label');
  if (agBar) { agBar.style.width = agPct + '%'; agBar.style.background = licUsageColor(agPct); }
  if (agLbl) agLbl.textContent = agentsUsed + ' / ' + agentsLimit;

  // HITL bar
  var hitlPct = Math.min(Math.round(hitlUsed / hitlLimit * 100), 100);
  var hitlBar = document.getElementById('lic-hitl-bar');
  var hitlLbl = document.getElementById('lic-hitl-label');
  if (hitlBar) { hitlBar.style.width = hitlPct + '%'; hitlBar.style.background = licUsageColor(hitlPct); }
  if (hitlLbl) hitlLbl.textContent = hitlUsed + ' / ' + hitlLimit;

  // Usage period
  var period = document.getElementById('lic-usage-period');
  if (period && data.periodStart && data.periodEnd) {
    period.textContent = new Date(data.periodStart).toLocaleDateString() + ' – ' + new Date(data.periodEnd).toLocaleDateString();
  }

  // History
  renderUsageHistory(data.history || null);
}

function licenseDefaultData() {
  // Demo/fallback data so the page always looks good
  var now = new Date();
  var history = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var events = Math.floor(Math.random() * 18000) + 3000;
    history.push({ month: MONTHS[d.getMonth()] + ' ' + d.getFullYear(), events: events, limit: 25000 });
  }
  return {
    status: {
      tier: 'free',
      licenseKey: null,
      features: ['evaluate', 'audit', 'hitl'],
    },
    usage: {
      eventsUsed: 12450,
      eventsLimit: 25000,
      agentsUsed: 2,
      agentsLimit: 3,
      hitlUsed: 1,
      hitlLimit: 3,
      daysUntilReset: 12,
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      periodEnd:   new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString(),
      history: history,
    }
  };
}

async function loadLicenseData() {
  var defaults = licenseDefaultData();

  // Always render defaults first for instant feedback
  applyLicenseStatus(defaults.status);
  applyUsageData(defaults.usage);

  if (!storedApiKey) return; // No key — use demo data

  // Try to fetch real data from API
  try {
    var headers = getApiHeaders();
    var [statusRes, usageRes] = await Promise.all([
      fetch(API_PRIMARY + '/api/v1/license/status',  { headers: headers, signal: AbortSignal.timeout(8000) }),
      fetch(API_PRIMARY + '/api/v1/license/usage',   { headers: headers, signal: AbortSignal.timeout(8000) }),
    ]);
    if (statusRes.ok) {
      var statusData = await statusRes.json();
      applyLicenseStatus(statusData);
    }
    if (usageRes.ok) {
      var usageData = await usageRes.json();
      applyUsageData(usageData);
    }
  } catch {
    // Silently fall back to demo data already rendered
  }
}

function refreshLicenseData() { loadLicenseData(); }

function copyLicenseKey() {
  var key = _licenseKeyRaw || document.getElementById('lic-key-display')?.textContent || '';
  if (!key || key.includes('•')) return;
  navigator.clipboard.writeText(key).then(function() {
    var btn = document.querySelector('#lic-key-section-pro button');
    if (btn) { var orig = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(function() { btn.textContent = orig; }, 1500); }
  }).catch(function() {});
}

// ── Init ─────────────────────────────────────────────────
async function init() {
  // Load stored API key
  loadApiKey();
  
  // Show cold-start warning immediately
  document.getElementById('cold-start-banner').classList.add('visible');

  // Try primary API URL first, fall back to Azure direct
  let apiOnline = false;
  for (const url of [API_PRIMARY, API_FALLBACK]) {
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        API = url;
        const d = await r.json();
        apiOnline = true;
        document.getElementById('api-dot').style.background = 'var(--green)';
        document.getElementById('api-status').innerHTML =
          `<span style="width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block"></span> API Online (${Math.round(d.uptime)}s uptime)`;

        // Sync kill switch state from API
        if (d.killSwitch === true) {
          killActive = true;
          updateKillSwitchUI();
        }
        break;
      }
    } catch {}
  }

  if (!apiOnline) {
    document.getElementById('api-dot').style.background = 'var(--red)';
    document.getElementById('api-status').innerHTML =
      `<span style="width:8px;height:8px;border-radius:50%;background:var(--red);display:inline-block"></span> API warming up — try again in 15s`;
  } else {
    document.getElementById('cold-start-banner').classList.remove('visible');
  }

  // Show/hide no-key banner
  var demoBanner = document.getElementById('demo-banner');
  if (demoBanner) {
    demoBanner.style.display = (!storedApiKey) ? 'flex' : 'none';
  }

  // Load real data if API key is available
  if (storedApiKey) {
    loadDashboardStats();
    loadDashboardFeed();
    loadUsageStats();
    loadAuditTrail();
    loadApprovals();
  }

  // Create session
  try {
    const r = await fetch(`${API}/api/v1/playground/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const d = await r.json();
    sessionId = d.sessionId;
    renderPolicy(d.policy);
  } catch {}

  // Load policy page: uses authenticated endpoint if key available
  await loadPolicyPage();

  // Fetch live kill switch state
  try {
    const r = await fetch(`${API}/api/v1/killswitch`);
    const d = await r.json();
    killActive = d.active;
    updateKillSwitchUI();
    document.getElementById('kill-api-status').textContent = d.message || '';
  } catch {}
}

// ── Load Policy Page ─────────────────────────────────────
async function loadPolicyPage() {
  // If we have an API key, load the tenant custom policy
  if (storedApiKey) {
    try {
      var r = await fetch(API + '/api/v1/policy', { headers: getApiHeaders(), signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        var d = await r.json();
        var policy = d.policy || {};
        document.getElementById('policy-json').textContent = JSON.stringify(policy, null, 2);
        if (policy.rules) renderPolicyRules(policy.rules);
        var header = document.querySelector('#page-policy .card-header h2');
        if (header) header.textContent = (policy.id || 'tenant-policy') + (d.isCustom ? ' (custom)' : ' (default)');
        var sub = document.querySelector('#page-policy .card-header span');
        if (sub) sub.textContent = (policy.rules ? policy.rules.length : 0) + ' rules · default: ' + (policy.default || 'allow');
        return;
      }
    } catch {}
  }
  // Fallback: playground (public) policy
  try {
    const r = await fetch(`${API}/api/v1/playground/policy`);
    const d = await r.json();
    document.getElementById('policy-json').textContent = JSON.stringify(d.policy, null, 2);
    renderPolicyRules(d.policy.rules);
  } catch {
    document.getElementById('policy-rules').innerHTML =
      '<div style="padding:24px;text-align:center;color:var(--text-dim)">Could not load policy. <button class="btn btn-ghost" onclick="loadPolicyPage()" style="margin-left:8px">Retry</button></div>';
  }
}

function renderPolicy(p) {
  const rulesHtml = p.rules.map(r => `
    <div style="padding:6px 0;border-top:1px solid var(--border-dim);display:flex;align-items:center;gap:8px">
      <span class="badge badge-${esc(r.action)}">${esc(r.action)}</span>
      <span style="color:var(--text-bright);font-weight:600">${esc(r.id)}</span>
    </div>`).join('');

  document.getElementById('overview-policy').innerHTML = `
    <div style="font-family:var(--mono);font-size:0.85rem">
      <div style="margin-bottom:8px"><span style="color:var(--text-dim)">ID:</span> <span style="color:var(--text-bright)">${esc(p.id)}</span></div>
      <div style="margin-bottom:8px"><span style="color:var(--text-dim)">Rules:</span> <span style="color:var(--accent-hi)">${esc(String(p.ruleCount))}</span></div>
      <div style="margin-bottom:12px"><span style="color:var(--text-dim)">Default:</span> <span class="badge badge-${esc(p.default)}">${esc(p.default)}</span></div>
      ${rulesHtml}
    </div>`;
}

function renderPolicyRules(rules) {
  document.getElementById('policy-rules').innerHTML = rules.map(r => `
    <div class="policy-rule">
      <div class="rule-id">${esc(r.id)}</div>
      <span class="badge badge-${esc(r.action)}">${esc(r.action)}</span>
      <span class="badge badge-${esc(r.severity)}">${esc(r.severity)}</span>
      <div class="rule-desc">${esc(r.description)}</div>
    </div>`).join('');
}

// ── Navigation ──────────────────────────────────────────
function showPage(id, evt) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  // Update title
  const titles = { overview: 'Dashboard', live: 'Live Feed', evaluate: 'Evaluate', policy: 'Policies', audit: 'Audit Trail', killswitch: 'Kill Switch', sdk: 'SDK & API', agents: 'Agents', readiness: 'Deployment Readiness', webhooks: 'Webhooks', ratelimits: 'Rate Limits', costs: 'Costs', analytics: 'Analytics', compliance: 'Compliance', mcp: 'MCP Servers', license: 'License & Usage', alerts: 'Alerts', siem: 'SIEM Configuration' };
  document.title = `AgentGuard — ${titles[id] || id}`;
  // Mark active nav item
  if (evt && evt.target) {
    evt.target.closest('.nav-item')?.classList.add('active');
  } else {
    // Fallback: find nav item by onclick content
    document.querySelectorAll('.nav-item').forEach(n => {
      if (n.getAttribute('onclick') && n.getAttribute('onclick').includes(`'${id}'`)) {
        n.classList.add('active');
      }
    });
  }
  // Close mobile nav if open
  closeMobileNav();
  
  // Reload data when switching to certain pages
  if (id === 'overview' && storedApiKey) { loadDashboardStats(); loadDashboardFeed(); loadUsageStats(); }
  if (id === 'audit' && storedApiKey) { loadAuditTrail(); }
  if (id === 'agents') { loadAgents(); }
  if (id === 'readiness') { loadReadiness(); }
  if (id === 'webhooks') { loadWebhooks(); }
  if (id === 'ratelimits') { loadRateLimits(); }
  if (id === 'costs') { loadCosts(); }
  if (id === 'analytics') { loadAnalytics(); }
  if (id === 'compliance') { loadCompliance(); }
  if (id === 'mcp') { loadMcpServers(); }
  if (id === 'license') { loadLicenseData(); }
  if (id === 'alerts') { loadAlerts(); loadAlertRules(); }
  if (id === 'siem') { loadSiemStatus(); }
}

// ── Evaluate ────────────────────────────────────────────
function loadPreset(tool, params) {
  document.getElementById('eval-tool').value = tool;
  document.getElementById('eval-params').value = JSON.stringify(params, null, 2);
}

async function doEvaluate() {
  const tool = document.getElementById('eval-tool').value.trim();
  const paramsStr = document.getElementById('eval-params').value.trim();
  const resultEl = document.getElementById('eval-result');
  const btn = document.getElementById('eval-btn');

  if (!tool) {
    resultEl.innerHTML = '<div style="color:var(--red)">Tool name is required</div>';
    return;
  }
  let params = {};
  try {
    params = paramsStr ? JSON.parse(paramsStr) : {};
  } catch {
    resultEl.innerHTML = '<div style="color:var(--red)">Invalid JSON parameters</div>';
    return;
  }

  // Kill switch: still call the real API (which will also block)
  // But show immediate feedback
  if (killActive) {
    resultEl.innerHTML = `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:1.5rem;font-weight:700;color:var(--red);margin-bottom:8px">✕ BLOCKED</div>
        <div style="font-family:var(--mono);font-size:0.85rem;color:var(--text-dim);margin-bottom:4px">rule: KILL_SWITCH</div>
        <div style="color:var(--text-dim);font-size:0.85rem;margin-bottom:20px">Global kill switch is ACTIVE — all agent actions are blocked.</div>
      </div>`;
    evalCount++;
    const event = {
      time: new Date(), tool: esc(tool), params, result: 'block',
      ruleId: 'KILL_SWITCH', riskScore: 1000,
      reason: 'Kill switch active', durationMs: 0,
      hash: 'killswitch'
    };
    allEvents.push(event);
    updateStats();
    addFeedItem(event);
    addAuditRow(event);
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Evaluating...';
  const t0 = performance.now();

  try {
    const r = await fetch(`${API}/api/v1/playground/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, tool, params })
    });
    const data = await r.json();
    const roundTrip = Math.round(performance.now() - t0);
    renderResult(data, tool, params, roundTrip);
  } catch (e) {
    resultEl.innerHTML =
      `<div style="color:var(--red)">API Error: Connection failed</div>` +
      `<div style="color:var(--text-dim);margin-top:8px">API may be cold-starting. Try again in 15s.</div>`;
    document.getElementById('cold-start-banner').classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Evaluate';
  }
}

function updateStats() {
  let allowed = 0, blocked = 0;
  allEvents.forEach(e => {
    if (e.result === 'allow') allowed++;
    else if (e.result === 'block') blocked++;
  });
  document.getElementById('stat-total').textContent = allEvents.length;
  document.getElementById('stat-allowed').textContent = allowed;
  document.getElementById('stat-blocked').textContent = blocked;
  document.getElementById('stat-allow-pct').textContent = allEvents.length ? `${Math.round(allowed / allEvents.length * 100)}%` : '—';
  document.getElementById('stat-block-pct').textContent = allEvents.length ? `${Math.round(blocked / allEvents.length * 100)}%` : '—';
}

function renderResult(data, tool, params, roundTrip) {
  const d = data.decision;
  const colors = { allow: 'var(--green)', block: 'var(--red)', monitor: 'var(--accent-hi)', require_approval: 'var(--amber)' };
  const icons = { allow: '✓ ALLOWED', block: '✕ BLOCKED', monitor: '◉ MONITORED', require_approval: '⏸ APPROVAL REQUIRED' };
  const c = colors[d.result] || 'var(--text)';

  evalCount++;
  totalLatency += d.durationMs;
  const avgLatency = (totalLatency / evalCount).toFixed(2);

  // Use esc() for all API-derived text values (XSS prevention)
  const safeResult = esc(d.result || '');
  const safeRule = d.matchedRuleId ? esc(d.matchedRuleId) : '';
  const safeReason = esc(d.reason || 'Default action applied');
  const safeIcon = icons[d.result] || esc(d.result);

  document.getElementById('eval-result').innerHTML = `
    <div style="text-align:center;padding:24px 0">
      <div style="font-size:1.5rem;font-weight:700;color:${c};margin-bottom:8px">${safeIcon}</div>
      ${safeRule ? `<div style="font-family:var(--mono);font-size:0.85rem;color:var(--text-dim);margin-bottom:4px">rule: ${safeRule}</div>` : ''}
      <div style="color:var(--text-dim);font-size:0.85rem;margin-bottom:20px">${safeReason}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      <div style="text-align:center;padding:12px;background:var(--bg-card2);border-radius:8px">
        <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:4px">RISK SCORE</div>
        <div style="font-family:var(--mono);font-size:1.2rem;font-weight:700;color:${d.riskScore > 50 ? 'var(--red)' : d.riskScore > 0 ? 'var(--amber)' : 'var(--green)'}">${d.riskScore}</div>
      </div>
      <div style="text-align:center;padding:12px;background:var(--bg-card2);border-radius:8px">
        <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:4px">ENGINE LATENCY</div>
        <div style="font-family:var(--mono);font-size:1.2rem;font-weight:700;color:var(--accent-hi)">${d.durationMs}ms</div>
      </div>
      <div style="text-align:center;padding:12px;background:var(--bg-card2);border-radius:8px">
        <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:4px">ROUND TRIP</div>
        <div style="font-family:var(--mono);font-size:1.2rem;font-weight:700;color:var(--text)">${roundTrip}ms</div>
      </div>
    </div>
    <details style="margin-top:12px">
      <summary style="color:var(--text-dim);font-size:0.82rem;cursor:pointer">Raw JSON</summary>
      <pre style="font-family:var(--mono);font-size:0.78rem;color:var(--text-dim);margin-top:8px;overflow-x:auto"></pre>
    </details>`;

  // Safe JSON rendering via textContent (no innerHTML for JSON data)
  const pre = document.getElementById('eval-result').querySelector('details pre');
  if (pre) pre.textContent = JSON.stringify(d, null, 2);

  document.getElementById('eval-latency').textContent = `${roundTrip}ms`;
  document.getElementById('stat-latency').textContent = avgLatency + 'ms';

  const event = {
    time: new Date(),
    tool: esc(tool),
    params,
    result: d.result,
    ruleId: d.matchedRuleId ? esc(d.matchedRuleId) : null,
    riskScore: d.riskScore,
    reason: esc(d.reason || ''),
    durationMs: d.durationMs,
    hash: null // will be computed async
  };
  allEvents.push(event);
  updateStats();
  addFeedItem(event);
  addAuditRow(event);

  // Compute real hash via Web Crypto API
  computeAuditHash(event);
}

// Compute SHA-256 hash of audit event using Web Crypto API
async function computeAuditHash(event) {
  try {
    const data = `${event.tool}|${event.result}|${event.time.toISOString()}`;
    const encoded = new TextEncoder().encode(data);
    const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
    const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    event.hash = hashHex.slice(0, 16);
    // Update audit row hash cell
    const rows = document.getElementById('audit-tbody').querySelectorAll('tr');
    // The most recently added row is at the top (afterbegin insertion)
    if (rows.length > 0) {
      const hashCell = rows[0].cells[7];
      if (hashCell) hashCell.textContent = event.hash + '...';
    }
  } catch {}
}

function addFeedItem(event) {
  const colors = { allow: 'var(--green)', block: 'var(--red)', monitor: 'var(--accent-hi)', require_approval: 'var(--amber)' };
  const c = colors[event.result] || 'var(--text-dim)';
  const time = event.time.toLocaleTimeString();

  ['recent-feed', 'live-feed'].forEach(id => {
    const el = document.getElementById(id);
    if (el.querySelector('[style*="text-align:center"]')) el.innerHTML = '';

    const div = document.createElement('div');
    div.className = 'feed-item feed-new';

    const dot = document.createElement('div');
    dot.className = 'feed-dot';
    dot.style.background = c;

    const timeEl = document.createElement('div');
    timeEl.className = 'feed-time';
    timeEl.textContent = time;

    const content = document.createElement('div');
    content.className = 'feed-content';

    const toolEl = document.createElement('div');
    toolEl.className = 'feed-tool';
    toolEl.textContent = event.tool + ' → ';
    const resultSpan = document.createElement('span');
    resultSpan.style.cssText = `color:${c};font-weight:600`;
    resultSpan.textContent = event.result.toUpperCase();
    toolEl.appendChild(resultSpan);

    const ruleEl = document.createElement('div');
    ruleEl.className = 'feed-rule';
    ruleEl.textContent = `${event.ruleId || 'default'} · risk ${event.riskScore} · ${event.durationMs}ms`;

    content.appendChild(toolEl);
    content.appendChild(ruleEl);
    div.appendChild(dot);
    div.appendChild(timeEl);
    div.appendChild(content);
    el.insertBefore(div, el.firstChild);
  });
}

function addAuditRow(event) {
  const tbody = document.getElementById('audit-tbody');
  if (tbody.querySelector('[colspan]')) tbody.innerHTML = '';
  const colors = { allow: 'badge-allow', block: 'badge-block', monitor: 'badge-monitor', require_approval: 'badge-require_approval' };
  const idx = allEvents.length;

  const tr = document.createElement('tr');

  function td(text, extraStyle) {
    const el = document.createElement('td');
    el.style.cssText = 'font-family:var(--mono);font-size:0.82rem' + (extraStyle ? ';' + extraStyle : '');
    el.textContent = String(text);
    return el;
  }

  tr.appendChild(td(idx));
  tr.appendChild(td(event.time.toLocaleTimeString(), 'color:var(--text-dim)'));
  tr.appendChild(td(event.tool));

  // Decision badge
  const badgeTd = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `badge ${colors[event.result] || ''}`;
  badge.textContent = event.result;
  badgeTd.appendChild(badge);
  tr.appendChild(badgeTd);

  tr.appendChild(td(event.ruleId || '—', 'color:var(--text-dim)'));
  tr.appendChild(td(event.riskScore, `color:${event.riskScore > 50 ? 'var(--red)' : 'var(--green)'}`));
  tr.appendChild(td(event.durationMs + 'ms', 'color:var(--accent-hi)'));
  tr.appendChild(td(event.hash ? event.hash + '...' : 'computing...', 'font-size:0.75rem;color:var(--text-dim)'));

  tbody.insertBefore(tr, tbody.firstChild);
  document.getElementById('audit-count').textContent = allEvents.length;
}

function clearFeed() {
  document.getElementById('live-feed').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-dim)">Feed cleared</div>';
}

// ── Kill Switch — calls real API ────────────────────────
async function toggleKillSwitch() {
  const btn = document.getElementById('kill-btn');
  const statusEl = document.getElementById('kill-api-status');
  btn.disabled = true;
  btn.style.opacity = '0.6';
  statusEl.textContent = 'Contacting API...';

  const newState = !killActive;
  try {
    const r = await fetch(`${API}/api/v1/killswitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: newState })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    killActive = d.active;
    statusEl.textContent = d.message || '';
  } catch (e) {
    // If API is unavailable, still toggle local state with clear warning
    killActive = newState;
    statusEl.textContent = '⚠️ API unreachable — local state only. Reload to sync.';
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
    updateKillSwitchUI();
  }
}

function updateKillSwitchUI() {
  const btn = document.getElementById('kill-btn');
  const status = document.getElementById('kill-status');
  if (!btn || !status) return;
  if (killActive) {
    btn.classList.add('active');
    btn.innerHTML = '⚠️ ACTIVE<br><span style="font-size:0.8rem">Click to deactivate</span>';
    status.innerHTML = 'Status: <span style="color:var(--red);font-weight:700">ACTIVE — All agents blocked</span>';
  } else {
    btn.classList.remove('active');
    btn.innerHTML = 'KILL<br>SWITCH';
    status.innerHTML = 'Status: <span style="color:var(--green)">Inactive</span>';
  }
}


// ── Analytics ────────────────────────────────────────────
async function loadAnalytics() {
  var noKey = document.getElementById('an-no-key');
  if (!storedApiKey) {
    noKey.style.display = 'block';
    document.getElementById('an-tools-tbody').innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px">Enter your API key above</td></tr>';
    document.getElementById('an-agents-tbody').innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--text-dim);padding:24px">Enter your API key above</td></tr>';
    return;
  }
  noKey.style.display = 'none';
  var period = document.getElementById('analytics-period').value;

  try {
    var r = await fetch(API + '/api/v1/analytics/usage?period=' + period, {
      headers: getApiHeaders(), signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();

    // Big number cards
    var total = data.totalCalls || data.total || 0;
    var blocked = data.blocked || 0;
    var blockRate = total > 0 ? (blocked / total * 100) : 0;
    document.getElementById('an-total').textContent = total.toLocaleString();
    document.getElementById('an-total-sub').textContent = 'in ' + period;

    var brEl = document.getElementById('an-block-rate');
    brEl.textContent = blockRate.toFixed(1) + '%';
    brEl.style.color = blockRate < 20 ? 'var(--green)' : blockRate < 50 ? 'var(--amber)' : 'var(--red)';

    document.getElementById('an-agents').textContent = (data.uniqueAgents || data.unique_agents || 0).toLocaleString();
    var lat = data.avgLatencyMs || data.avg_latency_ms || 0;
    document.getElementById('an-latency').textContent = lat > 0 ? lat.toFixed(2) + 'ms' : '—';

    // CSS bar chart
    renderAnalyticsBarChart(data.dailyVolume || data.daily_volume || []);

    // Top tools
    var tools = data.topTools || data.top_tools || [];
    var tbody = document.getElementById('an-tools-tbody');
    if (tools.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px">No tool data yet</td></tr>';
    } else {
      tbody.innerHTML = tools.map(function(t) {
        var br = t.calls > 0 ? ((t.blocked || 0) / t.calls * 100).toFixed(1) : '0.0';
        var brColor = parseFloat(br) < 20 ? 'var(--green)' : parseFloat(br) < 50 ? 'var(--amber)' : 'var(--red)';
        return '<tr><td style="font-family:var(--mono)">' + esc(t.tool || t.name || '') +
          '</td><td style="text-align:right;font-family:var(--mono);color:var(--accent-hi)">' + (t.calls || t.count || 0).toLocaleString() +
          '</td><td style="text-align:right;font-family:var(--mono);color:' + brColor + '">' + br + '%</td></tr>';
      }).join('');
    }

    // Agent activity
    var agents = data.agentActivity || data.agents || [];
    var atbody = document.getElementById('an-agents-tbody');
    if (agents.length === 0) {
      atbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--text-dim);padding:24px">No agent data yet</td></tr>';
    } else {
      atbody.innerHTML = agents.map(function(a) {
        return '<tr><td>' + esc(a.agent || a.name || a.agentId || '') +
          '</td><td style="text-align:right;font-family:var(--mono);color:var(--accent-hi)">' + (a.calls || a.count || 0).toLocaleString() + '</td></tr>';
      }).join('');
    }

  } catch(e) {
    // Render demo state if API not available
    renderAnalyticsDemoState(period);
  }
}

function renderAnalyticsBarChart(days) {
  var container = document.getElementById('an-bar-chart');
  if (!days || days.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem;width:100%;text-align:center;align-self:center">No daily volume data</div>';
    document.getElementById('an-chart-meta').textContent = '';
    return;
  }

  var maxVal = 1;
  days.forEach(function(d) { var t = (d.allowed||0)+(d.blocked||0); if(t>maxVal) maxVal=t; });

  var html = '';
  var grandTotal = 0;
  days.forEach(function(d) {
    var allowed = d.allowed || 0;
    var blocked = d.blocked || 0;
    var total = allowed + blocked;
    grandTotal += total;
    var pct = (total / maxVal * 100);
    var allowedPct = total > 0 ? (allowed / total * 100) : 0;
    var blockedPct = 100 - allowedPct;
    var label = d.date || d.day || '';
    if (label.length >= 10) label = label.slice(5, 10); // MM-DD

    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;min-width:24px" title="' + esc(d.date||d.day||'') + ': ' + total + ' calls">' +
      '<div style="width:100%;max-width:32px;display:flex;flex-direction:column;height:' + pct.toFixed(1) + '%;min-height:' + (total>0?'4px':'0') + ';border-radius:3px 3px 0 0;overflow:hidden">' +
        (blockedPct > 0 ? '<div style="flex:' + blockedPct + ';background:var(--red);opacity:0.85"></div>' : '') +
        (allowedPct > 0 ? '<div style="flex:' + allowedPct + ';background:var(--green);opacity:0.85"></div>' : '') +
      '</div>' +
      '<div style="font-size:0.65rem;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:32px">' + esc(label) + '</div>' +
    '</div>';
  });

  container.innerHTML = html;
  document.getElementById('an-chart-meta').textContent = grandTotal.toLocaleString() + ' total · ' + days.length + ' days';
}

function renderAnalyticsDemoState(period) {
  // Show placeholder demo data when API unavailable (no real data leakage)
  document.getElementById('an-total').textContent = '—';
  document.getElementById('an-block-rate').textContent = '—';
  document.getElementById('an-agents').textContent = '—';
  document.getElementById('an-latency').textContent = '—';
  document.getElementById('an-chart-meta').textContent = 'API unavailable';
  document.getElementById('an-bar-chart').innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem;width:100%;text-align:center;align-self:center">Connect your API key and ensure API is online</div>';
  document.getElementById('an-tools-tbody').innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px">API unavailable</td></tr>';
  document.getElementById('an-agents-tbody').innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--text-dim);padding:24px">API unavailable</td></tr>';
}

// ── Compliance ───────────────────────────────────────────
const OWASP_CONTROLS = [
  { id:'llm01', name:'LLM01: Prompt Injection', desc:'Guards against adversarial inputs' },
  { id:'llm02', name:'LLM02: Insecure Output', desc:'Validates agent output before action' },
  { id:'llm03', name:'LLM03: Training Data Poisoning', desc:'Monitors for data poisoning signals' },
  { id:'llm04', name:'LLM04: Model DoS', desc:'Rate limiting and resource controls' },
  { id:'llm05', name:'LLM05: Supply Chain', desc:'MCP server & plugin provenance checks' },
  { id:'llm06', name:'LLM06: Sensitive Info Disclosure', desc:'PII detection and redaction' },
  { id:'llm07', name:'LLM07: Insecure Plugin Design', desc:'Tool permission boundary enforcement' },
  { id:'llm08', name:'LLM08: Excessive Agency', desc:'Least-privilege action enforcement' },
  { id:'llm09', name:'LLM09: Overreliance', desc:'Human-in-the-loop for critical ops' },
  { id:'llm10', name:'LLM10: Model Theft', desc:'API key & model access controls' }
];

async function loadCompliance() {
  var noKey = document.getElementById('comp-no-key');
  if (!storedApiKey) {
    noKey.style.display = 'block';
    document.getElementById('comp-controls-grid').style.display = 'none';
    document.getElementById('comp-score-text').textContent = '—';
    document.getElementById('comp-score-label').textContent = 'Connect your API key';
    return;
  }
  noKey.style.display = 'none';
  document.getElementById('comp-controls-grid').style.display = 'grid';

  try {
    var r = await fetch(API + '/api/v1/compliance/owasp/latest', {
      headers: getApiHeaders(), signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();
    renderComplianceData(data);
  } catch(e) {
    // Render skeleton controls so UI is always useful
    renderComplianceControls(OWASP_CONTROLS.map(function(c) {
      return { id: c.id, status: 'unknown' };
    }));
    document.getElementById('comp-score-text').textContent = '—';
    document.getElementById('comp-score-label').textContent = 'API unavailable';
  }
}

function renderComplianceData(data) {
  var score = data.score || data.overallScore || 0;
  var controls = data.controls || [];

  // Animate donut
  var arc = document.getElementById('comp-donut-arc');
  var circumference = 2 * Math.PI * 60; // r=60
  var frac = score / 10;
  arc.setAttribute('stroke-dasharray', (frac * circumference).toFixed(2) + ' ' + circumference.toFixed(2));
  arc.setAttribute('stroke', score >= 8 ? 'var(--green)' : score >= 5 ? 'var(--amber)' : 'var(--red)');

  var scoreEl = document.getElementById('comp-score-text');
  scoreEl.textContent = score.toFixed ? score.toFixed(1) : score;
  scoreEl.style.color = score >= 8 ? 'var(--green)' : score >= 5 ? 'var(--amber)' : 'var(--red)';

  document.getElementById('comp-score-label').textContent = score >= 8 ? '✅ Production Ready' : score >= 5 ? '⚠️ Partial Coverage' : '❌ Needs Attention';

  var updated = data.generatedAt || data.updatedAt || data.created_at || '';
  if (updated) document.getElementById('comp-updated').textContent = 'Updated: ' + updated.replace('T', ' ').slice(0, 19);

  // Merge API controls with our static definitions for names
  var merged = OWASP_CONTROLS.map(function(def) {
    var found = controls.find(function(c) { return c.id === def.id || c.control === def.id; });
    return Object.assign({}, def, found || {});
  });

  // Fill any extra controls from API that aren't in our list
  controls.forEach(function(c) {
    var existing = merged.find(function(m) { return m.id === (c.id||c.control); });
    if (!existing) merged.push(c);
  });

  renderComplianceControls(merged);

  // Show PDF download button if report URL exists
  var pdfLink = document.getElementById('comp-pdf-link');
  if (data.reportUrl || data.report_url) {
    pdfLink.href = data.reportUrl || data.report_url;
    pdfLink.style.display = 'inline-block';
  }
}

function renderComplianceControls(controls) {
  var grid = document.getElementById('comp-controls-grid');
  grid.innerHTML = controls.map(function(c) {
    var status = c.status || c.coverage || 'unknown';
    var icon = status === 'covered' ? '✅' : status === 'partial' ? '⚠️' : status === 'not_covered' || status === 'missing' ? '❌' : '❓';
    var color = status === 'covered' ? 'var(--green)' : status === 'partial' ? 'var(--amber)' : status === 'not_covered' || status === 'missing' ? 'var(--red)' : 'var(--text-dim)';
    var borderColor = status === 'covered' ? 'rgba(34,197,94,0.25)' : status === 'partial' ? 'rgba(245,158,11,0.25)' : status === 'not_covered' || status === 'missing' ? 'rgba(239,68,68,0.25)' : 'var(--border-dim)';
    var name = c.name || c.id || '';
    var desc = c.desc || c.description || '';
    return '<div style="background:var(--bg-card2);border:1px solid ' + borderColor + ';border-radius:8px;padding:14px 16px">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<span style="font-size:1.1rem">' + icon + '</span>' +
        '<span style="font-weight:600;font-size:0.82rem;color:var(--text-bright)">' + esc(name) + '</span>' +
      '</div>' +
      '<div style="font-size:0.75rem;color:var(--text-dim)">' + esc(desc) + '</div>' +
      (c.details ? '<div style="font-size:0.72rem;color:' + color + ';margin-top:6px">' + esc(c.details) + '</div>' : '') +
    '</div>';
  }).join('');
}

async function generateComplianceReport() {
  if (!storedApiKey) { alert('Please enter your API key first'); return; }
  var btn = document.getElementById('comp-gen-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';
  var resultEl = document.getElementById('comp-gen-result');
  resultEl.style.display = 'none';

  try {
    var r = await fetch(API + '/api/v1/compliance/owasp/generate', {
      method: 'POST', headers: getApiHeaders(),
      body: JSON.stringify({}), signal: AbortSignal.timeout(30000)
    });
    var data = await r.json();
    if (r.ok) {
      resultEl.style.display = 'block';
      resultEl.style.background = 'rgba(34,197,94,0.08)';
      resultEl.style.border = '1px solid rgba(34,197,94,0.25)';
      resultEl.textContent = '✅ Report generated successfully' + (data.reportId ? ' — ID: ' + data.reportId : '');
      if (data.reportUrl || data.report_url) {
        var pdfLink = document.getElementById('comp-pdf-link');
        pdfLink.href = data.reportUrl || data.report_url;
        pdfLink.style.display = 'inline-block';
      }
      // Reload latest compliance after generation
      loadCompliance();
    } else {
      resultEl.style.display = 'block';
      resultEl.style.background = 'rgba(239,68,68,0.08)';
      resultEl.style.border = '1px solid rgba(239,68,68,0.25)';
      resultEl.textContent = '❌ ' + (data.error || 'Failed to generate report');
    }
  } catch(e) {
    resultEl.style.display = 'block';
    resultEl.style.background = 'rgba(245,158,11,0.08)';
    resultEl.style.border = '1px solid rgba(245,158,11,0.25)';
    resultEl.textContent = '⚠️ API unavailable. Try again shortly.';
  } finally {
    btn.disabled = false;
    btn.textContent = '📄 Generate Report';
  }
}

// ── MCP Servers ──────────────────────────────────────────
function showMcpForm() {
  document.getElementById('mcp-add-form').style.display = 'block';
  document.getElementById('mcp-name').focus();
}
function hideMcpForm() {
  document.getElementById('mcp-add-form').style.display = 'none';
  document.getElementById('mcp-add-result').innerHTML = '';
}

async function loadMcpServers() {
  var noKey = document.getElementById('mcp-no-key');
  var tbody = document.getElementById('mcp-tbody');

  if (!storedApiKey) {
    noKey.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:24px">Enter your API key above</td></tr>';
    return;
  }
  noKey.style.display = 'none';
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:16px">Loading…</td></tr>';

  try {
    var r = await fetch(API + '/api/v1/mcp/servers', {
      headers: getApiHeaders(), signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();
    var servers = data.servers || data.mcpServers || data || [];
    if (!Array.isArray(servers)) servers = [];

    if (servers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:24px">No MCP servers registered yet. Click "+ Add Server" to register one.</td></tr>';
      return;
    }

    tbody.innerHTML = servers.map(function(s) {
      var allowed = (s.allowedTools || s.allowed_tools || []).join(', ') || '<span style="color:var(--text-dim)">all</span>';
      var blocked = (s.blockedTools || s.blocked_tools || []).join(', ') || '<span style="color:var(--text-dim)">none</span>';
      var tools = (s.tools || []).join(', ') || allowed;
      return '<tr>' +
        '<td style="font-weight:600;color:var(--text-bright)">' + esc(s.name || '') + '</td>' +
        '<td style="font-family:var(--mono);font-size:0.8rem;color:var(--accent-hi);max-width:200px;overflow:hidden;text-overflow:ellipsis">' + esc(s.url || '') + '</td>' +
        '<td style="font-size:0.8rem">' + (tools ? esc(tools).slice(0, 60) + (tools.length > 60 ? '…' : '') : allowed) + '</td>' +
        '<td style="font-size:0.8rem;color:var(--red)">' + blocked + '</td>' +
        '<td style="text-align:right"><button class="btn btn-danger" style="font-size:0.78rem;padding:5px 12px" onclick="deleteMcpServer(' + JSON.stringify(esc(s.id||s.name||'')) + ')">Delete</button></td>' +
      '</tr>';
    }).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red);padding:24px">Failed to load MCP servers — ' + esc(e.message) + '</td></tr>';
  }
}

async function addMcpServer() {
  var name = document.getElementById('mcp-name').value.trim();
  var url = document.getElementById('mcp-url').value.trim();
  var allowedRaw = document.getElementById('mcp-allowed').value.trim();
  var blockedRaw = document.getElementById('mcp-blocked').value.trim();
  var resultEl = document.getElementById('mcp-add-result');

  if (!name) { resultEl.innerHTML = '<div style="color:var(--red)">Server name is required</div>'; return; }
  if (!url) { resultEl.innerHTML = '<div style="color:var(--red)">Server URL is required</div>'; return; }

  var body = { name: name, url: url };
  if (allowedRaw) body.allowedTools = allowedRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  if (blockedRaw) body.blockedTools = blockedRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

  try {
    var r = await fetch(API + '/api/v1/mcp/servers', {
      method: 'POST', headers: getApiHeaders(),
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
    });
    var data = await r.json();
    if (r.ok) {
      resultEl.innerHTML = '<div style="color:var(--green)">✅ Server registered successfully</div>';
      document.getElementById('mcp-name').value = '';
      document.getElementById('mcp-url').value = '';
      document.getElementById('mcp-allowed').value = '';
      document.getElementById('mcp-blocked').value = '';
      setTimeout(function() { hideMcpForm(); }, 1200);
      loadMcpServers();
    } else {
      resultEl.innerHTML = '<div style="color:var(--red)">❌ ' + esc(data.error || data.message || 'Failed to register server') + '</div>';
    }
  } catch(e) {
    resultEl.innerHTML = '<div style="color:var(--red)">❌ API error: ' + esc(e.message) + '</div>';
  }
}

async function deleteMcpServer(id) {
  if (!confirm('Delete this MCP server? This action cannot be undone.')) return;
  try {
    var r = await fetch(API + '/api/v1/mcp/servers/' + encodeURIComponent(id), {
      method: 'DELETE', headers: getApiHeaders(), signal: AbortSignal.timeout(10000)
    });
    if (r.ok || r.status === 204) {
      loadMcpServers();
    } else {
      var data = await r.json().catch(function() { return {}; });
      alert('Failed to delete: ' + (data.error || 'Unknown error'));
    }
  } catch(e) {
    alert('API error: ' + e.message);
  }
}


// ── Audit Export ─────────────────────────────────────────
function toggleExportDropdown() {
  var dd = document.getElementById('export-dropdown');
  dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  var dd = document.getElementById('export-dropdown');
  var btn = document.getElementById('export-btn');
  if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
    dd.style.display = 'none';
  }
});

function downloadAuditExport(format) {
  document.getElementById('export-dropdown').style.display = 'none';
  if (!storedApiKey) { alert('Please enter your API key first'); return; }
  var from = document.getElementById('audit-from').value;
  var to = document.getElementById('audit-to').value;
  var url = API + '/api/v1/audit/export?format=' + format;
  if (from) url += '&from=' + encodeURIComponent(from);
  if (to) url += '&to=' + encodeURIComponent(to + 'T23:59:59Z');

  // Trigger download
  var a = document.createElement('a');
  a.href = url;
  a.download = 'agentguard-audit-' + new Date().toISOString().slice(0,10) + '.' + format;
  // Add auth header via fetch + blob for APIs that require auth header
  fetch(url, { headers: getApiHeaders() }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.blob();
  }).then(function(blob) {
    var objUrl = URL.createObjectURL(blob);
    a.href = objUrl;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(objUrl); }, 2000);
  }).catch(function(e) {
    alert('Export failed: ' + e.message + '\n(API may not support this endpoint yet)');
  });
}

// ── Alerts ────────────────────────────────────────────────
var _alertsData = [];
var _alertsTimer = null;
var _siemEnabled = false;
var _siemProvider = null;

function severityIcon(sev) {
  if (!sev) return 'ℹ️';
  var s = sev.toLowerCase();
  if (s === 'critical') return '🔴';
  if (s === 'warning') return '🟡';
  return 'ℹ️';
}

function severityBadgeStyle(sev) {
  if (!sev) return 'background:rgba(59,130,246,0.12);color:var(--blue)';
  var s = sev.toLowerCase();
  if (s === 'critical') return 'background:rgba(239,68,68,0.12);color:var(--red)';
  if (s === 'warning') return 'background:rgba(245,158,11,0.12);color:var(--amber)';
  return 'background:rgba(59,130,246,0.12);color:var(--blue)';
}

async function loadAlerts() {
  var filterSev = document.getElementById('alert-filter-severity') ? document.getElementById('alert-filter-severity').value : 'all';
  var filterStatus = document.getElementById('alert-filter-status') ? document.getElementById('alert-filter-status').value : 'active';
  var listEl = document.getElementById('alerts-list');
  if (!listEl) return;

  // Clear previous timer
  if (_alertsTimer) { clearTimeout(_alertsTimer); _alertsTimer = null; }

  var url = API + '/api/v1/alerts?status=' + filterStatus;
  if (filterSev !== 'all') url += '&severity=' + filterSev;

  var alerts = [];
  try {
    var r = await fetch(url, { headers: getApiHeaders(), signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      var data = await r.json();
      alerts = data.alerts || data || [];
    }
  } catch {}

  // Fallback: demo data if API unavailable
  if (!Array.isArray(alerts) || alerts.length === 0) {
    alerts = getDemoAlerts(filterStatus, filterSev);
  }

  _alertsData = alerts;
  renderAlerts(alerts);
  updateAlertsBadge(alerts);

  // Schedule auto-refresh every 30s
  _alertsTimer = setTimeout(loadAlerts, 30000);
}

function getDemoAlerts(filterStatus, filterSev) {
  var all = [
    { id:'a1', severity:'critical', metric:'block_rate', currentValue:78, threshold:50, triggeredAt: new Date(Date.now()-180000).toISOString(), agent:'booking-agent', status:'active', message:'Block rate exceeded threshold' },
    { id:'a2', severity:'warning', metric:'latency_p99', currentValue:420, threshold:300, triggeredAt: new Date(Date.now()-600000).toISOString(), agent:'search-agent', status:'active', message:'P99 latency above threshold' },
    { id:'a3', severity:'info', metric:'hitl_queue_depth', currentValue:8, threshold:10, triggeredAt: new Date(Date.now()-3600000).toISOString(), agent:'finance-agent', status:'resolved', message:'HITL queue depth high' },
    { id:'a4', severity:'critical', metric:'eval_error_rate', currentValue:12, threshold:5, triggeredAt: new Date(Date.now()-900000).toISOString(), agent:'data-agent', status:'active', message:'Evaluation error rate critical' },
  ];
  var result = all.filter(function(a) {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (filterSev !== 'all' && a.severity !== filterSev) return false;
    return true;
  });
  return result;
}

function renderAlerts(alerts) {
  var listEl = document.getElementById('alerts-list');
  var countEl = document.getElementById('alerts-count-label');
  if (!listEl) return;

  if (!alerts || alerts.length === 0) {
    listEl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-dim)">✅ No alerts matching current filters</div>';
    if (countEl) countEl.textContent = '0 alerts';
    return;
  }

  if (countEl) countEl.textContent = alerts.length + ' alert' + (alerts.length !== 1 ? 's' : '');

  listEl.innerHTML = alerts.map(function(a) {
    var icon = severityIcon(a.severity);
    var badgeStyle = severityBadgeStyle(a.severity);
    var timeAgo = formatTimeAgo(a.triggeredAt || a.created_at || '');
    var isActive = (a.status || 'active') === 'active';
    return '<div style="padding:16px 20px;border-bottom:1px solid var(--border-dim);display:flex;align-items:flex-start;gap:16px">' +
      '<div style="flex-shrink:0;padding-top:2px">' + icon + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">' +
          '<span style="font-weight:600;color:var(--text-bright);font-size:0.9rem">' + esc(a.metric || 'unknown') + '</span>' +
          '<span style="padding:2px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;font-family:var(--mono);' + badgeStyle + '">' + esc(a.severity || 'info') + '</span>' +
          (isActive ? '<span style="padding:2px 8px;border-radius:20px;font-size:0.72rem;background:rgba(239,68,68,0.1);color:var(--red)">active</span>' : '<span style="padding:2px 8px;border-radius:20px;font-size:0.72rem;background:rgba(34,197,94,0.1);color:var(--green)">resolved</span>') +
        '</div>' +
        '<div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:4px">' + esc(a.message || '') + '</div>' +
        '<div style="display:flex;align-items:center;gap:16px;font-size:0.78rem;color:var(--text-dim);flex-wrap:wrap">' +
          '<span>Value: <strong style="color:var(--amber);font-family:var(--mono)">' + esc(String(a.currentValue || a.value || '—')) + '</strong> vs threshold <strong style="font-family:var(--mono)">' + esc(String(a.threshold || '—')) + '</strong></span>' +
          '<span>Triggered: ' + timeAgo + '</span>' +
          '<span>Agent: <strong style="color:var(--accent-hi)">' + esc(a.agent || a.agentId || '—') + '</strong></span>' +
        '</div>' +
      '</div>' +
      (isActive ? '<button class="btn btn-ghost" onclick="acknowledgeAlert(\'' + esc(a.id) + '\')" style="flex-shrink:0;font-size:0.78rem;padding:6px 12px">Acknowledge</button>' : '') +
    '</div>';
  }).join('');
}

function updateAlertsBadge(alerts) {
  var critical = (alerts || []).filter(function(a) { return a.severity === 'critical' && (a.status || 'active') === 'active'; }).length;
  ['desktop-alerts-badge', 'mobile-alerts-badge'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (critical > 0) {
      el.style.display = 'inline-block';
      el.textContent = critical;
    } else {
      el.style.display = 'none';
    }
  });
}

function filterAlerts() { loadAlerts(); }

async function acknowledgeAlert(id) {
  try {
    var r = await fetch(API + '/api/v1/alerts/' + encodeURIComponent(id) + '/acknowledge', {
      method: 'POST', headers: getApiHeaders(), signal: AbortSignal.timeout(8000)
    });
    if (r.ok || r.status === 204) {
      loadAlerts();
    } else {
      // Optimistic UI update even if API not available
      _alertsData = _alertsData.filter(function(a) { return a.id !== id; });
      renderAlerts(_alertsData);
    }
  } catch {
    // Optimistic: remove from local data
    _alertsData = _alertsData.filter(function(a) { return a.id !== id; });
    renderAlerts(_alertsData);
  }
}

async function loadAlertRules() {
  var listEl = document.getElementById('alert-rules-list');
  if (!listEl) return;

  var rules = [];
  try {
    var r = await fetch(API + '/api/v1/alerts/rules', { headers: getApiHeaders(), signal: AbortSignal.timeout(8000) });
    if (r.ok) { var data = await r.json(); rules = data.rules || data || []; }
  } catch {}

  if (!Array.isArray(rules) || rules.length === 0) {
    rules = getDemoAlertRules();
  }

  renderAlertRules(rules);
}

function getDemoAlertRules() {
  return [
    { id:'r1', metric:'block_rate', condition:'gt', threshold:50, windowMinutes:5, severity:'critical', enabled:true },
    { id:'r2', metric:'latency_p99', condition:'gt', threshold:300, windowMinutes:10, severity:'warning', enabled:true },
    { id:'r3', metric:'eval_error_rate', condition:'gt', threshold:5, windowMinutes:5, severity:'critical', enabled:false },
    { id:'r4', metric:'hitl_queue_depth', condition:'gt', threshold:10, windowMinutes:1, severity:'info', enabled:true },
  ];
}

function renderAlertRules(rules) {
  var listEl = document.getElementById('alert-rules-list');
  if (!listEl) return;
  if (!rules || rules.length === 0) {
    listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-dim)">No alert rules configured</div>';
    return;
  }

  var condLabels = { gt:'>', lt:'<', gte:'≥', lte:'≤', eq:'=' };

  listEl.innerHTML = rules.map(function(rule) {
    var icon = severityIcon(rule.severity);
    var enabled = rule.enabled !== false;
    return '<div style="padding:14px 20px;border-bottom:1px solid var(--border-dim);display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<span>' + icon + '</span>' +
      '<div style="flex:1;min-width:180px">' +
        '<div style="font-weight:600;color:var(--text-bright);font-size:0.88rem;font-family:var(--mono)">' + esc(rule.metric || '') + '</div>' +
        '<div style="font-size:0.78rem;color:var(--text-dim);margin-top:2px">' +
          esc(condLabels[rule.condition] || rule.condition || '') + ' ' + esc(String(rule.threshold)) +
          ' · window: ' + esc(String(rule.windowMinutes || 5)) + 'min' +
          ' · ' + esc(rule.severity || '') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<label style="font-size:0.78rem;color:var(--text-dim)">' + (enabled ? 'Enabled' : 'Disabled') + '</label>' +
        '<button onclick="toggleAlertRule(\'' + esc(rule.id) + '\',' + !enabled + ')"' +
          ' style="width:40px;height:22px;border-radius:11px;border:none;cursor:pointer;position:relative;background:' + (enabled ? 'var(--accent)' : 'var(--border)') + ';transition:background 0.2s" aria-label="Toggle rule">' +
          '<span style="position:absolute;top:2px;left:' + (enabled ? '20px' : '2px') + ';width:18px;height:18px;border-radius:50%;background:white;transition:left 0.2s"></span>' +
        '</button>' +
      '</div>' +
      '<button class="btn btn-danger" onclick="deleteAlertRule(\'' + esc(rule.id) + '\')" style="font-size:0.78rem;padding:5px 12px">Delete</button>' +
    '</div>';
  }).join('');
}

function toggleCreateRuleForm() {
  var el = document.getElementById('create-rule-form');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function createAlertRule() {
  var metric = document.getElementById('rule-metric').value.trim();
  var condition = document.getElementById('rule-condition').value;
  var threshold = parseFloat(document.getElementById('rule-threshold').value);
  var window = parseInt(document.getElementById('rule-window').value) || 5;
  var severity = document.getElementById('rule-severity').value;
  var resultEl = document.getElementById('create-rule-result');

  if (!metric) { resultEl.innerHTML = '<span style="color:var(--red)">Metric is required</span>'; return; }
  if (isNaN(threshold)) { resultEl.innerHTML = '<span style="color:var(--red)">Threshold must be a number</span>'; return; }

  var body = { metric, condition, threshold, windowMinutes: window, severity };
  try {
    var r = await fetch(API + '/api/v1/alerts/rules', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    if (r.ok || r.status === 201) {
      resultEl.innerHTML = '<span style="color:var(--green)">✅ Rule created</span>';
      document.getElementById('rule-metric').value = '';
      document.getElementById('rule-threshold').value = '';
      document.getElementById('rule-window').value = '';
      setTimeout(function() { toggleCreateRuleForm(); document.getElementById('create-rule-result').innerHTML = ''; loadAlertRules(); }, 1200);
    } else {
      var d = await r.json().catch(function() { return {}; });
      resultEl.innerHTML = '<span style="color:var(--red)">❌ ' + esc(d.error || 'Failed to create rule') + '</span>';
    }
  } catch(e) {
    resultEl.innerHTML = '<span style="color:var(--amber)">⚠️ API unavailable — rule not persisted</span>';
    setTimeout(function() { toggleCreateRuleForm(); loadAlertRules(); }, 1500);
  }
}

async function toggleAlertRule(id, enabled) {
  try {
    await fetch(API + '/api/v1/alerts/rules/' + encodeURIComponent(id), {
      method: 'PUT', headers: getApiHeaders(), body: JSON.stringify({ enabled }), signal: AbortSignal.timeout(8000)
    });
  } catch {}
  loadAlertRules();
}

async function deleteAlertRule(id) {
  if (!confirm('Delete this alert rule?')) return;
  try {
    await fetch(API + '/api/v1/alerts/rules/' + encodeURIComponent(id), { method: 'DELETE', headers: getApiHeaders(), signal: AbortSignal.timeout(8000) });
  } catch {}
  loadAlertRules();
}

function formatTimeAgo(isoString) {
  if (!isoString) return '—';
  var diff = Math.round((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

// ── SIEM ──────────────────────────────────────────────────
function selectSiemProvider(provider) {
  _siemProvider = provider;
  document.getElementById('siem-splunk-config').style.display = provider === 'splunk' ? 'block' : 'none';
  document.getElementById('siem-sentinel-config').style.display = provider === 'sentinel' ? 'block' : 'none';
  document.getElementById('siem-actions').style.display = 'block';
  document.getElementById('siem-no-provider').style.display = 'none';

  // Highlight selected button
  ['splunk', 'sentinel'].forEach(function(p) {
    var btn = document.getElementById('siem-btn-' + p);
    if (!btn) return;
    if (p === provider) {
      btn.style.borderColor = 'var(--accent)';
      btn.style.color = 'var(--accent-hi)';
      btn.style.background = 'var(--accent-dim)';
    } else {
      btn.style.borderColor = 'var(--border)';
      btn.style.color = 'var(--text-dim)';
      btn.style.background = 'var(--bg-card2)';
    }
  });

  // Load existing config for this provider
  loadSiemProviderConfig(provider);
}

async function loadSiemProviderConfig(provider) {
  try {
    var r = await fetch(API + '/api/v1/siem/' + provider + '/configure', { headers: getApiHeaders(), signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      var data = await r.json();
      if (provider === 'splunk' && data.hecUrl) {
        document.getElementById('splunk-hec-url').value = data.hecUrl;
        document.getElementById('splunk-token').value = data.token ? '••••••••' : '';
      }
      if (provider === 'sentinel') {
        if (data.workspaceId) document.getElementById('sentinel-workspace-id').value = data.workspaceId;
        if (data.sharedKey) document.getElementById('sentinel-shared-key').value = '••••••••';
      }
      if (data.enabled !== undefined) {
        _siemEnabled = data.enabled;
        updateSiemToggleUI();
      }
    }
  } catch {}
}

async function saveSiemConfig() {
  if (!_siemProvider) { alert('Please select a SIEM provider first'); return; }
  var body = {};
  if (_siemProvider === 'splunk') {
    body.hecUrl = document.getElementById('splunk-hec-url').value.trim();
    var tok = document.getElementById('splunk-token').value.trim();
    if (tok && tok !== '••••••••') body.token = tok;
    if (!body.hecUrl) { alert('HEC URL is required'); return; }
  } else {
    body.workspaceId = document.getElementById('sentinel-workspace-id').value.trim();
    var key = document.getElementById('sentinel-shared-key').value.trim();
    if (key && key !== '••••••••') body.sharedKey = key;
    if (!body.workspaceId) { alert('Workspace ID is required'); return; }
  }

  var indicator = document.getElementById('siem-status-indicator');
  indicator.style.display = 'block';
  indicator.style.background = 'rgba(99,102,241,0.08)';
  indicator.style.border = '1px solid var(--border)';
  indicator.textContent = '⏳ Saving...';

  try {
    var r = await fetch(API + '/api/v1/siem/' + _siemProvider + '/configure', {
      method: 'POST', headers: getApiHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
    });
    if (r.ok) {
      indicator.style.background = 'rgba(34,197,94,0.08)';
      indicator.style.border = '1px solid rgba(34,197,94,0.25)';
      indicator.textContent = '✅ Configuration saved';
      loadSiemStatus();
    } else {
      var d = await r.json().catch(function() { return {}; });
      indicator.style.background = 'rgba(239,68,68,0.08)';
      indicator.style.border = '1px solid rgba(239,68,68,0.25)';
      indicator.textContent = '❌ ' + esc(d.error || 'Failed to save');
    }
  } catch(e) {
    indicator.style.background = 'rgba(245,158,11,0.08)';
    indicator.style.border = '1px solid rgba(245,158,11,0.25)';
    indicator.textContent = '⚠️ API unavailable — configuration not saved';
  }
}

async function testSiemConnection() {
  if (!_siemProvider) return;
  var btn = document.getElementById('siem-test-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Testing...';
  var indicator = document.getElementById('siem-status-indicator');
  indicator.style.display = 'block';

  try {
    var r = await fetch(API + '/api/v1/siem/' + _siemProvider + '/test', {
      method: 'POST', headers: getApiHeaders(), body: JSON.stringify({}), signal: AbortSignal.timeout(15000)
    });
    var data = await r.json().catch(function() { return {}; });
    if (r.ok && (data.success || data.connected)) {
      indicator.style.background = 'rgba(34,197,94,0.08)';
      indicator.style.border = '1px solid rgba(34,197,94,0.25)';
      indicator.style.color = '';
      indicator.textContent = '✅ Connection successful — SIEM is reachable';
    } else {
      indicator.style.background = 'rgba(239,68,68,0.08)';
      indicator.style.border = '1px solid rgba(239,68,68,0.25)';
      indicator.style.color = '';
      indicator.textContent = '❌ Connection failed: ' + esc(data.error || data.message || 'Unknown error');
    }
  } catch(e) {
    indicator.style.background = 'rgba(245,158,11,0.08)';
    indicator.style.border = '1px solid rgba(245,158,11,0.25)';
    indicator.textContent = '⚠️ Could not reach API to test connection';
  } finally {
    btn.disabled = false;
    btn.textContent = '🔌 Test Connection';
  }
}

function toggleSiemEnabled() {
  _siemEnabled = !_siemEnabled;
  updateSiemToggleUI();
  if (_siemProvider) {
    fetch(API + '/api/v1/siem/' + _siemProvider + '/configure', {
      method: 'POST', headers: getApiHeaders(), body: JSON.stringify({ enabled: _siemEnabled })
    }).catch(function() {});
  }
}

function updateSiemToggleUI() {
  var btn = document.getElementById('siem-toggle-btn');
  var knob = document.getElementById('siem-toggle-knob');
  if (!btn || !knob) return;
  btn.style.background = _siemEnabled ? 'var(--accent)' : 'var(--border)';
  knob.style.left = _siemEnabled ? '22px' : '2px';
}

async function loadSiemStatus() {
  var listEl = document.getElementById('siem-integrations-list');
  if (!listEl) return;

  var integrations = [];
  for (var p of ['splunk', 'sentinel']) {
    try {
      var r = await fetch(API + '/api/v1/siem/' + p + '/configure', { headers: getApiHeaders(), signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        var data = await r.json();
        data._provider = p;
        integrations.push(data);
      }
    } catch {}
  }

  if (integrations.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-dim)">No SIEM integrations configured yet. Select a provider above to get started.</div>';
    return;
  }

  listEl.innerHTML = integrations.map(function(i) {
    var providerIcon = i._provider === 'splunk' ? '🟠' : '🔵';
    var providerName = i._provider === 'splunk' ? 'Splunk' : 'Azure Sentinel';
    var status = i.status || (i.enabled ? 'connected' : 'disabled');
    var statusColor = status === 'connected' ? 'var(--green)' : status === 'error' ? 'var(--red)' : 'var(--text-dim)';
    var statusDot = status === 'connected' ? '🟢' : status === 'error' ? '🔴' : '⚫';
    return '<div style="display:flex;align-items:center;gap:16px;padding:16px 20px;border-bottom:1px solid var(--border-dim);flex-wrap:wrap">' +
      '<span style="font-size:1.5rem">' + providerIcon + '</span>' +
      '<div style="flex:1;min-width:120px">' +
        '<div style="font-weight:600;color:var(--text-bright)">' + providerName + '</div>' +
        '<div style="font-size:0.78rem;color:var(--text-dim);margin-top:2px">' + esc(i.hecUrl || i.workspaceId || 'Configured') + '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;font-size:0.85rem;color:' + statusColor + '">' + statusDot + ' ' + esc(status) + '</div>' +
      '<button class="btn btn-ghost" onclick="selectSiemProvider(\'' + i._provider + '\')" style="font-size:0.78rem">Configure</button>' +
      '<button class="btn btn-danger" onclick="deleteSiemConfig(\'' + i._provider + '\')" style="font-size:0.78rem">Remove</button>' +
    '</div>';
  }).join('');
}

async function deleteSiemConfig(provider) {
  if (!confirm('Remove ' + provider + ' SIEM configuration?')) return;
  try {
    await fetch(API + '/api/v1/siem/' + provider + '/configure', { method: 'DELETE', headers: getApiHeaders() });
  } catch {}
  loadSiemStatus();
}

// Boot
init();

// ── Onboarding Wizard ──────────────────────────────────────────────────────

var ONBOARDING_KEY = 'ag_onboarding_complete';
var onboardingStep = 1;
var totalSteps = 4;

function isOnboardingComplete() {
  try {
    return !!localStorage.getItem(ONBOARDING_KEY);
  } catch { return false; }
}

function markOnboardingComplete() {
  try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch {}
}

function maybeShowOnboarding() {
  if (!isOnboardingComplete() && !storedApiKey) {
    showOnboarding();
  } else {
    showQuickStart();
  }
}

function showOnboarding() {
  document.getElementById('onboarding-overlay').style.display = 'flex';
  setOnboardingStep(1);
}

function closeOnboarding(complete) {
  document.getElementById('onboarding-overlay').style.display = 'none';
  if (complete) {
    markOnboardingComplete();
  }
  showQuickStart();
}

function showQuickStart() {
  document.getElementById('quickstart-cards').style.display = 'grid';
}

function setOnboardingStep(step) {
  onboardingStep = Math.max(1, Math.min(step, totalSteps));
  // Hide all steps
  for (var i = 1; i <= totalSteps; i++) {
    var el = document.getElementById('ob-step-' + i);
    if (el) el.style.display = 'none';
  }
  var current = document.getElementById('ob-step-' + onboardingStep);
  if (current) current.style.display = 'block';
  // Update progress dots
  for (var i = 1; i <= totalSteps; i++) {
    var dot = document.getElementById('ob-dot-' + i);
    if (dot) {
      dot.style.background = i === onboardingStep ? 'var(--accent)' : 'var(--border)';
      dot.style.width = i === onboardingStep ? '24px' : '8px';
    }
  }
  // Update nav buttons
  var prevBtn = document.getElementById('ob-prev');
  var nextBtn = document.getElementById('ob-next');
  var skipBtn = document.getElementById('ob-skip');
  if (prevBtn) prevBtn.style.display = onboardingStep > 1 ? 'inline-flex' : 'none';
  if (nextBtn) {
    nextBtn.textContent = onboardingStep === totalSteps ? 'Go to Dashboard →' : 'Next →';
  }
  if (skipBtn) skipBtn.style.display = onboardingStep < totalSteps ? 'inline-block' : 'none';

  // Step-specific logic
  if (onboardingStep === 3) updateEvalCurl();
}

function onboardingNext() {
  if (onboardingStep === 2) {
    // Validate API key on step 2
    var keyInput = document.getElementById('ob-api-key');
    var key = keyInput ? keyInput.value.trim() : '';
    if (!key) {
      var err = document.getElementById('ob-key-error');
      if (err) { err.textContent = 'Please enter your API key'; err.style.display = 'block'; }
      return;
    }
    if (!key.startsWith('ag_live_') && !key.startsWith('ag_agent_')) {
      var err = document.getElementById('ob-key-error');
      if (err) { err.textContent = 'API keys start with ag_live_... — check your signup email'; err.style.display = 'block'; }
      return;
    }
    saveApiKey(key);
    var err = document.getElementById('ob-key-error');
    if (err) err.style.display = 'none';
  }
  if (onboardingStep < totalSteps) {
    setOnboardingStep(onboardingStep + 1);
  } else {
    closeOnboarding(true);
  }
}

function onboardingPrev() {
  if (onboardingStep > 1) setOnboardingStep(onboardingStep - 1);
}

function updateEvalCurl() {
  var key = storedApiKey || 'YOUR_API_KEY';
  var cmd = 'curl -X POST https://api.agentguard.tech/api/v1/evaluate \\\n  -H "x-api-key: ' + key + '" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"tool":"file_read","params":{"path":"/var/log/app.log"}}\'';
  var el = document.getElementById('ob-curl-cmd');
  if (el) el.textContent = cmd;
}

function copyOnboardingCurl() {
  var el = document.getElementById('ob-curl-cmd');
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(function() {
    var btn = document.getElementById('ob-curl-copy');
    if (btn) { btn.textContent = '✅ Copied!'; setTimeout(function() { btn.textContent = '📋 Copy'; }, 2000); }
  });
}

function copyToClipboard(elemId, btn) {
  var el = document.getElementById(elemId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent || el.innerText).then(function() {
    if (btn) { var orig = btn.textContent; btn.textContent = '✅'; setTimeout(function() { btn.textContent = orig; }, 2000); }
  });
}

function switchSdkLang(lang) {
  var cmds = {
    npm: 'npm install @agentguard/sdk',
    pip: 'pip install agentguard',
    curl: 'curl https://api.agentguard.tech/health'
  };
  var el = document.getElementById('sdk-install-cmd');
  if (el) el.textContent = cmds[lang] || cmds.npm;
  ['npm','pip','curl'].forEach(function(l) {
    var btn = document.getElementById('sdk-btn-' + l);
    if (btn) {
      btn.style.borderColor = l === lang ? 'var(--accent)' : 'var(--border)';
      btn.style.color = l === lang ? 'var(--accent-hi)' : 'var(--text-dim)';
    }
  });
}

// Call after init so onboarding check happens after API key is loaded
setTimeout(maybeShowOnboarding, 100);
</script>
