// Professional agent observability dashboard.
// - Persists every agent run to Supabase (`agent_logs` table).
// - Reads from Supabase on each poll (in-memory ring buffer is fallback).
// - DOM is diff-patched on each tick — no innerHTML wipe → no flicker.

const express = require('express');
const router = express.Router();

const logger = require('../utils/logger');
const supa = require('../utils/supabaseLogger');

// ---- JSON API --------------------------------------------------------

router.get('/api/logs', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 150, 500);
  const agent = req.query.agent && req.query.agent !== 'all' ? String(req.query.agent) : null;
  const status = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
  const since = req.query.since ? String(req.query.since) : null;

  let logs = await supa.fetchLogs({ limit, agent, status, since });
  if (!logs.length) {
    logs = logger.recent(limit).filter((l) => {
      if (agent && l.agent !== agent) return false;
      if (status && l.status !== status) return false;
      return true;
    });
  }
  res.json({ ok: true, count: logs.length, logs });
});

router.get('/api/logs/stats', async (req, res) => {
  const since = req.query.since ? String(req.query.since) : null;
  const stats = (await supa.fetchStats({ since })) || { total: 0, ok: 0, errors: 0, tokens: 0, avgLatency: 0, agents: {} };
  res.json({ ok: true, stats });
});

router.get('/api/logs/:id', async (req, res) => {
  const id = String(req.params.id);
  const local = logger.recent(500).find((l) => l.id === id);
  if (local) return res.json({ ok: true, log: local });
  const rows = await supa.fetchLogs({ limit: 500 });
  const found = rows.find((l) => l.id === id);
  if (!found) return res.status(404).json({ ok: false });
  res.json({ ok: true, log: found });
});

router.post('/api/logs/clear', async (_req, res) => {
  logger.clear();
  await supa.clearLogs();
  res.json({ ok: true });
});

// ---- HTML dashboard --------------------------------------------------

router.get('/logs', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(HTML);
});

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>WordQuest · Agent Trace Console</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #07090f;
    --bg-grad: radial-gradient(1200px 600px at 80% -10%, rgba(34,197,94,0.08), transparent),
                radial-gradient(900px 500px at -10% 100%, rgba(59,130,246,0.08), transparent);
    --panel: #0d1320;
    --panel-2: #0f1626;
    --panel-3: #131c30;
    --border: rgba(255,255,255,0.06);
    --border-strong: rgba(255,255,255,0.12);
    --text: #e8ecf3;
    --muted: #8a93a6;
    --dim: #5a6478;
    --accent: #22c55e;
    --accent-2: #34d399;
    --warn: #f59e0b;
    --err: #ef4444;
    --info: #60a5fa;
    --purple: #a78bfa;
    --pink: #f472b6;
    --shadow: 0 24px 60px -20px rgba(0,0,0,0.7);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
  body { background: var(--bg); background-image: var(--bg-grad); min-height: 100vh; }

  .app { max-width: 1480px; margin: 0 auto; padding: 28px 28px 64px; }

  /* ---- top bar ---- */
  .topbar {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 24px; gap: 16px;
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .logo {
    width: 44px; height: 44px; border-radius: 12px;
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 60%, #15803d 100%);
    display: grid; place-items: center;
    box-shadow: 0 8px 24px -8px rgba(34,197,94,0.5), inset 0 1px 0 rgba(255,255,255,0.2);
    font-size: 22px;
  }
  .title { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; }
  .subtitle { font-size: 12px; color: var(--muted); font-weight: 500; margin-top: 2px; letter-spacing: 0.02em; }

  .topbar-actions { display: flex; align-items: center; gap: 10px; }
  .live-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent); box-shadow: 0 0 12px var(--accent);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  .live-chip {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 7px 12px; border-radius: 999px;
    background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25);
    color: #86efac; font-size: 12px; font-weight: 600;
  }
  .btn {
    padding: 9px 14px; border-radius: 10px;
    background: var(--panel-2); border: 1px solid var(--border-strong); color: var(--text);
    font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn:hover { background: var(--panel-3); border-color: rgba(255,255,255,0.18); }
  .btn-danger { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #fca5a5; }
  .btn-danger:hover { background: rgba(239,68,68,0.2); }

  /* ---- stats grid ---- */
  .stats {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px;
  }
  .stat {
    background: var(--panel); border: 1px solid var(--border); border-radius: 16px;
    padding: 18px 20px; position: relative; overflow: hidden;
    box-shadow: var(--shadow);
  }
  .stat::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
    background: var(--accent);
  }
  .stat.err::before { background: var(--err); }
  .stat.info::before { background: var(--info); }
  .stat.purple::before { background: var(--purple); }
  .stat-label { font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
  .stat-value { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .stat-sub { font-size: 12px; color: var(--dim); margin-top: 4px; font-weight: 500; }

  /* ---- agent strip ---- */
  .section-label { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin: 8px 0 12px; }
  .agent-strip {
    display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 22px;
  }
  .agent-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-radius: 999px;
    background: var(--panel); border: 1px solid var(--border);
    font-size: 13px; font-weight: 600; cursor: pointer;
    transition: all 0.15s ease; color: var(--text);
  }
  .agent-pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dim); }
  .agent-pill[data-active="1"] { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.35); color: #86efac; }
  .agent-pill[data-active="1"] .dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
  .agent-pill:hover { background: var(--panel-2); }
  .agent-pill .count { font-size: 11px; color: var(--muted); font-weight: 600; padding: 1px 6px; border-radius: 6px; background: rgba(255,255,255,0.04); }

  /* ---- filters ---- */
  .filters {
    display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap;
  }
  .filters input, .filters select {
    background: var(--panel); border: 1px solid var(--border); color: var(--text);
    border-radius: 10px; padding: 9px 12px; font: inherit; font-size: 13px;
    outline: none; transition: border-color 0.15s;
  }
  .filters input { min-width: 260px; }
  .filters input:focus, .filters select:focus { border-color: rgba(34,197,94,0.5); }
  .seg {
    display: inline-flex; padding: 3px; background: var(--panel); border: 1px solid var(--border);
    border-radius: 10px; gap: 2px;
  }
  .seg button {
    padding: 7px 12px; border-radius: 8px; background: transparent; border: none; color: var(--muted);
    font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .seg button[data-active="1"] { background: var(--panel-3); color: var(--text); }

  /* ---- table ---- */
  .table-wrap {
    background: var(--panel); border: 1px solid var(--border); border-radius: 16px;
    overflow: hidden; box-shadow: var(--shadow);
  }
  .table-head {
    display: grid;
    grid-template-columns: 130px 150px 1fr 90px 90px 110px 90px;
    padding: 12px 18px; gap: 12px;
    border-bottom: 1px solid var(--border);
    font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
    background: rgba(255,255,255,0.015);
  }
  #rows { display: flex; flex-direction: column; }
  .row {
    display: grid;
    grid-template-columns: 130px 150px 1fr 90px 90px 110px 90px;
    padding: 14px 18px; gap: 12px; align-items: center;
    border-bottom: 1px solid var(--border);
    cursor: pointer; transition: background 0.12s;
    font-size: 13px;
  }
  .row:hover { background: rgba(255,255,255,0.02); }
  .row[data-expanded="1"] { background: rgba(34,197,94,0.04); }
  .row .col-time { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .row .col-agent { font-weight: 600; }
  .row .col-prompt { color: var(--muted); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row .col-latency, .row .col-tokens { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-variant-numeric: tabular-nums; }
  .row .col-status { display: flex; }
  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
  }
  .badge.ok { background: rgba(34,197,94,0.12); color: #86efac; }
  .badge.err { background: rgba(239,68,68,0.12); color: #fca5a5; }
  .badge .b-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .model-tag {
    font-size: 11px; color: var(--dim); font-family: 'JetBrains Mono', monospace; font-weight: 500;
  }

  /* ---- expanded detail ---- */
  .detail {
    grid-column: 1 / -1; padding: 16px 22px 22px; background: var(--panel-2);
    border-top: 1px solid var(--border); animation: slideIn 0.18s ease;
  }
  @keyframes slideIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 1100px) { .detail-grid { grid-template-columns: 1fr; } }
  .detail-block {
    background: var(--panel-3); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px;
  }
  .detail-label { font-size: 10px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
  .detail-label .copy { color: var(--info); cursor: pointer; font-size: 11px; text-transform: none; letter-spacing: 0; font-weight: 600; }
  .detail-body {
    font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.55;
    color: #c9d3e3; white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow-y: auto;
  }
  .detail-body.err { color: #fca5a5; }
  .meta-row { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 10px; font-size: 12px; color: var(--muted); }
  .meta-row b { color: var(--text); font-weight: 600; }

  /* ---- empty ---- */
  .empty { padding: 56px 20px; text-align: center; color: var(--muted); }
  .empty .em-icon { font-size: 38px; margin-bottom: 8px; opacity: 0.6; }
  .empty .em-title { font-size: 15px; color: var(--text); font-weight: 600; margin-bottom: 4px; }
  .empty .em-sub { font-size: 13px; color: var(--muted); }

  /* scrollbar */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

  @media (max-width: 900px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
    .table-head, .row { grid-template-columns: 90px 110px 1fr 70px 70px; }
    .row .col-tokens, .table-head .col-tokens { display: none; }
    .row .col-status, .table-head .col-status { display: none; }
  }
</style>
</head>
<body>
<div class="app">
  <div class="topbar">
    <div class="brand">
      <div class="logo">🧠</div>
      <div>
        <div class="title">Agent Trace Console</div>
        <div class="subtitle">WordQuest · 9 cooperating agents · live observability</div>
      </div>
    </div>
    <div class="topbar-actions">
      <span class="live-chip"><span class="live-dot"></span> Live · Supabase synced</span>
      <button class="btn btn-danger" id="btn-clear">Clear</button>
    </div>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-label">Total Runs</div><div class="stat-value" id="s-total">—</div><div class="stat-sub" id="s-total-sub">across all agents</div></div>
    <div class="stat info"><div class="stat-label">Success Rate</div><div class="stat-value" id="s-ok">—</div><div class="stat-sub" id="s-ok-sub">— successful</div></div>
    <div class="stat err"><div class="stat-label">Errors</div><div class="stat-value" id="s-err">—</div><div class="stat-sub" id="s-err-sub">— error rate</div></div>
    <div class="stat purple"><div class="stat-label">Avg Latency</div><div class="stat-value" id="s-lat">—</div><div class="stat-sub" id="s-lat-sub">— total tokens used</div></div>
  </div>

  <div class="section-label">Agents</div>
  <div class="agent-strip" id="agent-strip"></div>

  <div class="filters">
    <input id="f-search" type="text" placeholder="Search prompt, response, error..." />
    <div class="seg" id="f-status">
      <button data-status="all" data-active="1">All</button>
      <button data-status="ok">Success</button>
      <button data-status="error">Errors</button>
    </div>
    <div class="seg" id="f-range">
      <button data-range="all" data-active="1">All time</button>
      <button data-range="1h">1h</button>
      <button data-range="24h">24h</button>
      <button data-range="7d">7d</button>
    </div>
  </div>

  <div class="table-wrap">
    <div class="table-head">
      <div>Time</div><div>Agent</div><div>Prompt</div><div>Latency</div><div>Tokens</div><div>Model</div><div class="col-status">Status</div>
    </div>
    <div id="rows"></div>
    <div id="empty" class="empty" style="display:none;">
      <div class="em-icon">⚡</div>
      <div class="em-title">No traces yet</div>
      <div class="em-sub">Trigger an agent — calls appear here in real time.</div>
    </div>
  </div>
</div>

<script>
  const KNOWN_AGENTS = [
    'difficultyAgent','levelGeneratorAgent','refereeAgent','rewardAgent',
    'tutorAgent','commentatorAgent','coachAgent','quizAgent',
  ];
  const HIDDEN_AGENTS = new Set(['chaalbaazAgent']);
  const state = {
    agent: 'all',
    status: 'all',
    range: 'all',
    search: '',
    paused: false,
    expanded: new Set(),
    rowsById: new Map(),
  };

  function fmtTime(iso) {
    const d = new Date(iso); if (isNaN(d)) return '—';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function sinceParam() {
    if (state.range === 'all') return null;
    const ms = state.range === '1h' ? 3600e3 : state.range === '24h' ? 86400e3 : 7*86400e3;
    return new Date(Date.now() - ms).toISOString();
  }
  function rowMatches(log) {
    if (HIDDEN_AGENTS.has(log.agent)) return false;
    if (state.agent !== 'all' && log.agent !== state.agent) return false;
    if (state.status !== 'all' && log.status !== state.status) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const hay = ((log.prompt||'') + ' ' + (log.response||'') + ' ' + (log.error||'') + ' ' + (log.agent||'')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function rowHTML(log) {
    const tokens = log.tokens && log.tokens.total ? log.tokens.total : 0;
    const status = log.status === 'ok'
      ? '<span class="badge ok"><span class="b-dot"></span>OK</span>'
      : '<span class="badge err"><span class="b-dot"></span>ERR</span>';
    return \`
      <div class="col-time">\${fmtTime(log.timestamp)}</div>
      <div class="col-agent">\${escapeHtml(log.agent)}</div>
      <div class="col-prompt">\${escapeHtml((log.prompt || log.error || '').slice(0, 200))}</div>
      <div class="col-latency">\${log.durationMs || 0}ms</div>
      <div class="col-tokens">\${tokens.toLocaleString()}</div>
      <div class="model-tag">\${escapeHtml(log.model || '—')}</div>
      <div class="col-status">\${status}</div>
    \`;
  }
  function detailHTML(log) {
    const promptBlock = log.prompt
      ? '<div class="detail-block"><div class="detail-label">Prompt <span class="copy" data-copy="' + escapeHtml(log.id) + '-p">Copy</span></div><div class="detail-body" id="p-' + escapeHtml(log.id) + '">' + escapeHtml(log.prompt) + '</div></div>'
      : '';
    const respBlock = log.status === 'ok' && log.response
      ? '<div class="detail-block"><div class="detail-label">Response <span class="copy" data-copy="' + escapeHtml(log.id) + '-r">Copy</span></div><div class="detail-body" id="r-' + escapeHtml(log.id) + '">' + escapeHtml(log.response) + '</div></div>'
      : '';
    const errBlock = log.error
      ? '<div class="detail-block"><div class="detail-label">Error</div><div class="detail-body err">' + escapeHtml(log.error) + '</div></div>'
      : '';
    const meta = '<div class="meta-row">' +
      '<span>ID <b>' + escapeHtml(log.id) + '</b></span>' +
      '<span>Status <b>' + escapeHtml(log.status) + '</b></span>' +
      '<span>Latency <b>' + (log.durationMs||0) + 'ms</b></span>' +
      (log.tokens ? '<span>Prompt tokens <b>' + (log.tokens.prompt||0) + '</b></span><span>Completion tokens <b>' + (log.tokens.completion||0) + '</b></span>' : '') +
      '</div>';
    return '<div class="detail"><div class="detail-grid">' + promptBlock + (respBlock || errBlock) + '</div>' + meta + '</div>';
  }

  function ensureRow(log) {
    let row = state.rowsById.get(log.id);
    if (!row) {
      row = document.createElement('div');
      row.className = 'row';
      row.dataset.id = log.id;
      row.innerHTML = rowHTML(log);
      row.addEventListener('click', () => toggleExpand(log.id));
      state.rowsById.set(log.id, row);
    } else {
      // diff-patch inner cells only if changed (avoid flicker)
      const next = rowHTML(log);
      if (row.dataset.hash !== next) {
        row.innerHTML = next;
        row.addEventListener('click', () => toggleExpand(log.id));
      }
    }
    row.dataset.hash = rowHTML(log);
    if (state.expanded.has(log.id)) {
      row.dataset.expanded = '1';
      let det = row.querySelector('.detail');
      const html = detailHTML(log);
      if (!det) {
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        row.appendChild(wrap.firstElementChild);
      }
    } else {
      row.dataset.expanded = '0';
      const det = row.querySelector('.detail');
      if (det) det.remove();
    }
    return row;
  }

  function toggleExpand(id) {
    if (state.expanded.has(id)) state.expanded.delete(id);
    else state.expanded.add(id);
    renderRows(window.__lastLogs || []);
  }

  function renderRows(logs) {
    const filtered = logs.filter(rowMatches);
    const container = document.getElementById('rows');
    const empty = document.getElementById('empty');
    if (filtered.length === 0) {
      container.innerHTML = '';
      state.rowsById.clear();
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    const seen = new Set();
    let prevSibling = null;
    for (const log of filtered) {
      const row = ensureRow(log);
      seen.add(log.id);
      const expected = prevSibling ? prevSibling.nextElementSibling : container.firstElementChild;
      if (row !== expected) {
        container.insertBefore(row, expected || null);
      }
      prevSibling = row;
    }
    // remove rows that fell off
    for (const [id, row] of state.rowsById.entries()) {
      if (!seen.has(id)) { row.remove(); state.rowsById.delete(id); }
    }
  }

  function renderAgents(logs) {
    const strip = document.getElementById('agent-strip');
    const counts = {};
    for (const a of KNOWN_AGENTS) counts[a] = 0;
    for (const l of logs) counts[l.agent] = (counts[l.agent] || 0) + 1;

    const wanted = ['all', ...KNOWN_AGENTS];
    let html = '';
    for (const name of wanted) {
      const label = name === 'all' ? 'All agents' : name.replace(/Agent$/, '');
      const c = name === 'all' ? logs.length : (counts[name] || 0);
      const active = state.agent === name ? '1' : '0';
      html += '<div class="agent-pill" data-agent="' + name + '" data-active="' + active + '"><span class="dot"></span>' + escapeHtml(label) + '<span class="count">' + c + '</span></div>';
    }
    if (strip.dataset.last !== html) {
      strip.innerHTML = html;
      strip.dataset.last = html;
      strip.querySelectorAll('.agent-pill').forEach((el) => {
        el.addEventListener('click', () => {
          state.agent = el.dataset.agent;
          tick(true);
        });
      });
    }
  }

  function setStat(id, val, sub) {
    const el = document.getElementById(id);
    if (el && el.textContent !== String(val)) el.textContent = val;
    if (sub != null) {
      const subEl = document.getElementById(id + '-sub');
      if (subEl && subEl.textContent !== String(sub)) subEl.textContent = sub;
    }
  }

  async function tick(force) {
    if (state.paused && !force) return;
    try {
      const q = new URLSearchParams();
      q.set('limit', '150');
      const since = sinceParam();
      if (since) q.set('since', since);
      const [logsRes, statsRes] = await Promise.all([
        fetch('/api/logs?' + q.toString(), { cache: 'no-store' }),
        fetch('/api/logs/stats' + (since ? '?since=' + encodeURIComponent(since) : ''), { cache: 'no-store' }),
      ]);
      let { logs = [] } = await logsRes.json();
      logs = logs.filter((l) => !HIDDEN_AGENTS.has(l.agent));
      window.__lastLogs = logs;

      const total = logs.length;
      const ok = logs.filter((l) => l.status === 'ok').length;
      const err = total - ok;
      const avgLat = total ? Math.round(logs.reduce((s, l) => s + (l.durationMs || 0), 0) / total) : 0;
      const tokens = logs.reduce((s, l) => s + ((l.tokens && l.tokens.total) || 0), 0);
      setStat('s-total', total.toLocaleString(), 'across all agents');
      setStat('s-ok', total ? Math.round((ok / total) * 100) + '%' : '—', ok + ' successful');
      setStat('s-err', err.toLocaleString(), total ? Math.round((err / total) * 100) + '% error rate' : '—');
      setStat('s-lat', avgLat + 'ms', tokens.toLocaleString() + ' total tokens');

      renderAgents(logs);
      renderRows(logs);
    } catch (e) {}
  }

  // wire filters
  document.getElementById('f-search').addEventListener('input', (e) => {
    state.search = e.target.value || '';
    tick(true);
  });
  document.getElementById('f-status').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.status = b.dataset.status;
    document.querySelectorAll('#f-status button').forEach((x) => x.dataset.active = (x === b ? '1' : '0'));
    tick(true);
  });
  document.getElementById('f-range').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.range = b.dataset.range;
    document.querySelectorAll('#f-range button').forEach((x) => x.dataset.active = (x === b ? '1' : '0'));
    tick(true);
  });
  document.getElementById('btn-clear').addEventListener('click', async () => {
    if (!confirm('Clear all logs from Supabase + memory?')) return;
    await fetch('/api/logs/clear', { method: 'POST' });
    state.rowsById.clear();
    document.getElementById('rows').innerHTML = '';
    tick(true);
  });
  document.addEventListener('click', (e) => {
    const c = e.target.closest('.copy'); if (!c) return;
    const key = c.dataset.copy;
    const id = key.replace(/-[pr]$/, '');
    const which = key.endsWith('-p') ? 'p' : 'r';
    const el = document.getElementById(which + '-' + id);
    if (el) {
      navigator.clipboard.writeText(el.textContent).then(() => {
        const orig = c.textContent;
        c.textContent = 'Copied';
        setTimeout(() => (c.textContent = orig), 1200);
      });
    }
  });

  tick(true);
  setInterval(tick, 2000);
</script>
</body>
</html>`;

module.exports = router;
