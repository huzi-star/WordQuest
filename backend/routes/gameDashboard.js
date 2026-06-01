// Game-wide trace dashboard at /dashboard.
//
// Reads the SAME `agent_logs` table the /logs console reads, but groups
// rows into tabs by category so you can see at a glance how each piece
// of the new functionality is performing:
//
//   * AGENTS       — every AI agent run (gpt-4o-mini calls)
//   * SUBSCRIPTION — plan upgrades, trials, coupons, paywall hits
//   * TIERS        — tier-up celebrations
//   * BATTLE       — 1v1 queue / match / result
//   * QUIZ         — per-question + per-session traces
//   * DAILY        — daily challenge per-word + result
//   * LEARN        — lesson + unit completions
//   * AVATAR       — photo / emoji avatar saves
//   * AUTH         — sign up / in / out
//
// The dashboard is read-only (the existing /logs console handles
// pause / clear). Same trace detail view + filters as /logs.

const express = require('express');
const router = express.Router();

router.get('/dashboard', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(HTML);
});

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>WordQuest · Game Trace Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #06080f;
    --bg-grad: radial-gradient(1200px 600px at 80% -10%, rgba(168,85,247,0.10), transparent),
                radial-gradient(900px 500px at -10% 100%, rgba(34,197,94,0.10), transparent);
    --panel: #0d1320;
    --panel-2: #0f1626;
    --panel-3: #131c30;
    --border: rgba(255,255,255,0.06);
    --border-strong: rgba(255,255,255,0.14);
    --text: #e8ecf3;
    --muted: #8a93a6;
    --dim: #5a6478;
    --accent: #a855f7;
    --green: #22c55e;
    --warn: #f59e0b;
    --err: #ef4444;
    --info: #60a5fa;
    --pink: #f472b6;
    --shadow: 0 24px 60px -20px rgba(0,0,0,0.7);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
  body { background: var(--bg); background-image: var(--bg-grad); min-height: 100vh; }

  .app { max-width: 1480px; margin: 0 auto; padding: 28px 28px 64px; }

  .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; gap: 16px; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .logo {
    width: 44px; height: 44px; border-radius: 12px;
    background: linear-gradient(135deg, #a855f7 0%, #7c3aed 60%, #5b21b6 100%);
    display: grid; place-items: center;
    box-shadow: 0 8px 24px -8px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.2);
    font-size: 22px;
  }
  .title { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; }
  .subtitle { font-size: 12px; color: var(--muted); font-weight: 500; margin-top: 2px; }

  .live-chip {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 7px 12px; border-radius: 999px;
    background: rgba(168,85,247,0.1); border: 1px solid rgba(168,85,247,0.3);
    color: #d8b4fe; font-size: 12px; font-weight: 600;
  }
  .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 12px var(--accent); animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

  .nav-link {
    color: var(--muted); font-size: 13px; font-weight: 600; text-decoration: none;
    padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border); transition: all 0.15s;
  }
  .nav-link:hover { color: var(--text); border-color: var(--border-strong); background: var(--panel); }

  /* category tabs */
  .tabs {
    display: grid; grid-template-columns: repeat(9, 1fr); gap: 8px; margin-bottom: 22px;
  }
  @media (max-width: 1100px) { .tabs { grid-template-columns: repeat(3, 1fr); } }
  .tab {
    cursor: pointer; padding: 14px 16px; border-radius: 14px;
    background: var(--panel); border: 1px solid var(--border);
    transition: all 0.15s; position: relative; overflow: hidden;
  }
  .tab:hover { background: var(--panel-2); border-color: var(--border-strong); }
  .tab[data-active="1"] { background: linear-gradient(135deg, rgba(168,85,247,0.18), rgba(34,197,94,0.08)); border-color: rgba(168,85,247,0.5); }
  .tab-icon { font-size: 22px; line-height: 1; margin-bottom: 8px; }
  .tab-label { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .tab[data-active="1"] .tab-label { color: var(--text); }
  .tab-count { font-size: 22px; font-weight: 800; margin-top: 4px; font-variant-numeric: tabular-nums; }

  /* stats strip */
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
  @media (max-width: 900px) { .stats { grid-template-columns: repeat(2, 1fr); } }
  .stat {
    background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
    padding: 16px 18px; position: relative; overflow: hidden; box-shadow: var(--shadow);
  }
  .stat::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--accent); }
  .stat.green::before { background: var(--green); }
  .stat.warn::before { background: var(--warn); }
  .stat.info::before { background: var(--info); }
  .stat-label { font-size: 10px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
  .stat-value { font-size: 26px; font-weight: 800; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .stat-sub { font-size: 11px; color: var(--dim); margin-top: 2px; }

  /* filters */
  .filters { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
  .filters input {
    background: var(--panel); border: 1px solid var(--border); color: var(--text);
    border-radius: 10px; padding: 9px 12px; font: inherit; font-size: 13px;
    outline: none; min-width: 280px;
  }
  .filters input:focus { border-color: rgba(168,85,247,0.5); }
  .seg { display: inline-flex; padding: 3px; background: var(--panel); border: 1px solid var(--border); border-radius: 10px; gap: 2px; }
  .seg button {
    padding: 7px 12px; border-radius: 8px; background: transparent; border: none; color: var(--muted);
    font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .seg button[data-active="1"] { background: var(--panel-3); color: var(--text); }

  /* table */
  .table-wrap { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; box-shadow: var(--shadow); }
  .table-head, .row {
    display: grid;
    grid-template-columns: 120px 160px 1fr 100px 90px;
    gap: 12px; padding: 12px 18px;
    border-bottom: 1px solid var(--border);
    align-items: center; font-size: 13px;
  }
  .table-head { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; background: rgba(255,255,255,0.015); }
  .row { cursor: pointer; transition: background 0.12s; }
  .row:hover { background: rgba(255,255,255,0.02); }
  .row[data-expanded="1"] { background: rgba(168,85,247,0.05); }
  .col-time { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); }
  .col-cat { font-weight: 600; }
  .col-detail { color: var(--muted); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .col-lat { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700;
  }
  .badge.ok { background: rgba(34,197,94,0.14); color: #86efac; }
  .badge.err { background: rgba(239,68,68,0.14); color: #fca5a5; }
  .badge .b-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .cat-tag {
    display: inline-block; padding: 3px 8px; border-radius: 6px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.03em;
    background: rgba(168,85,247,0.14); color: #d8b4fe;
  }
  .cat-tag[data-cat="agent"]        { background: rgba(34,197,94,0.14); color: #86efac; }
  .cat-tag[data-cat="subscription"] { background: rgba(245,158,11,0.14); color: #fcd34d; }
  .cat-tag[data-cat="tier"]         { background: rgba(168,85,247,0.16); color: #d8b4fe; }
  .cat-tag[data-cat="battle"]       { background: rgba(239,68,68,0.14); color: #fca5a5; }
  .cat-tag[data-cat="quiz"]         { background: rgba(96,165,250,0.14); color: #93c5fd; }
  .cat-tag[data-cat="daily"]        { background: rgba(252,211,77,0.14); color: #fde047; }
  .cat-tag[data-cat="learn"]        { background: rgba(34,211,238,0.14); color: #67e8f9; }
  .cat-tag[data-cat="avatar"]       { background: rgba(244,114,182,0.16); color: #f9a8d4; }
  .cat-tag[data-cat="auth"]         { background: rgba(148,163,184,0.16); color: #cbd5e1; }
  .cat-tag[data-cat="paywall"]      { background: rgba(251,113,133,0.16); color: #fda4af; }

  .detail { grid-column: 1 / -1; padding: 14px 22px 20px; background: var(--panel-2); border-top: 1px solid var(--border); animation: slideIn 0.18s ease; }
  @keyframes slideIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .detail-body { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.55; color: #c9d3e3; white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow-y: auto; background: var(--panel-3); padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border); }

  .empty { padding: 56px 20px; text-align: center; color: var(--muted); }
  .empty .em-icon { font-size: 40px; margin-bottom: 8px; opacity: 0.6; }
  .empty .em-title { font-size: 15px; color: var(--text); font-weight: 600; }
  .empty .em-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }

  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
</style>
</head>
<body>
<div class="app">
  <div class="topbar">
    <div class="brand">
      <div class="logo">🎮</div>
      <div>
        <div class="title">Game Trace Dashboard</div>
        <div class="subtitle">WordQuest · every action, every agent, every player — live</div>
      </div>
    </div>
    <div style="display:flex; gap:10px; align-items:center;">
      <span class="live-chip"><span class="live-dot"></span> Live</span>
      <a class="nav-link" href="/logs">/logs (agents only)</a>
    </div>
  </div>

  <div class="tabs" id="tabs"></div>

  <div class="stats">
    <div class="stat"><div class="stat-label">Active filter</div><div class="stat-value" id="s-active">All</div><div class="stat-sub" id="s-active-sub">9 categories</div></div>
    <div class="stat green"><div class="stat-label">Success rate</div><div class="stat-value" id="s-ok">—</div><div class="stat-sub" id="s-ok-sub">— successful</div></div>
    <div class="stat warn"><div class="stat-label">Avg latency</div><div class="stat-value" id="s-lat">—</div><div class="stat-sub" id="s-lat-sub">last 24h</div></div>
    <div class="stat info"><div class="stat-label">Unique users</div><div class="stat-value" id="s-users">—</div><div class="stat-sub" id="s-users-sub">in current view</div></div>
  </div>

  <div class="filters">
    <input id="f-search" type="text" placeholder="Search action, userId, payload..." />
    <div class="seg" id="f-status">
      <button data-status="all" data-active="1">All</button>
      <button data-status="ok">Success</button>
      <button data-status="error">Errors</button>
    </div>
    <div class="seg" id="f-range">
      <button data-range="1h">1h</button>
      <button data-range="24h" data-active="1">24h</button>
      <button data-range="7d">7d</button>
      <button data-range="all">All</button>
    </div>
  </div>

  <div class="table-wrap">
    <div class="table-head">
      <div>Time</div><div>Category</div><div>Detail</div><div>Latency</div><div>Status</div>
    </div>
    <div id="rows"></div>
    <div id="empty" class="empty" style="display:none;">
      <div class="em-icon">📡</div>
      <div class="em-title">No traces yet for this view</div>
      <div class="em-sub">Trigger an event in the app — it'll appear here within a few seconds.</div>
    </div>
  </div>
</div>

<script>
  // Categories — first entry = "All". Each has icon, color tag key, agent filter.
  const TABS = [
    { id: 'all',          label: 'All',          icon: '📡', match: null,                     tag: 'agent' },
    { id: 'agent',        label: 'Agents',       icon: '🧠', match: (a) => !a.startsWith('event:'), tag: 'agent' },
    { id: 'tier-up',      label: 'Tiers',        icon: '🏆', match: (a) => a === 'event:tier-up', tag: 'tier' },
    { id: 'subscription', label: 'Plans',        icon: '💎', match: (a) => a === 'event:subscription' || a === 'event:paywall-hit', tag: 'subscription' },
    { id: 'battle',       label: 'Battle',       icon: '⚔️', match: (a) => a === 'event:battle-queue' || a === 'event:battle-result', tag: 'battle' },
    { id: 'quiz',         label: 'Quiz',         icon: '❓', match: (a) => a === 'event:quiz-correct' || a === 'event:quiz-wrong' || a === 'event:quiz-session', tag: 'quiz' },
    { id: 'daily',        label: 'Daily',        icon: '📅', match: (a) => a === 'event:daily-word' || a === 'event:daily-result', tag: 'daily' },
    { id: 'learn',        label: 'Learn',        icon: '🎓', match: (a) => a === 'event:learn-lesson' || a === 'event:learn-unit', tag: 'learn' },
    { id: 'avatar',       label: 'Avatar',       icon: '🎨', match: (a) => a === 'event:avatar-upload', tag: 'avatar' },
    { id: 'auth',         label: 'Auth',         icon: '🔐', match: (a) => a === 'event:auth', tag: 'auth' },
  ];

  const state = {
    tab: 'all',
    status: 'all',
    range: '24h',
    search: '',
    expanded: new Set(),
    last: [],
  };

  function fmtTime(iso) {
    const d = new Date(iso); if (isNaN(d)) return '—';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function sinceParam() {
    if (state.range === 'all') return null;
    const ms = state.range === '1h' ? 3600e3 : state.range === '24h' ? 86400e3 : 7*86400e3;
    return new Date(Date.now() - ms).toISOString();
  }

  function categoryOf(agent) {
    if (!agent) return { id: 'agent', tag: 'agent', label: agent };
    if (!agent.startsWith('event:')) return { id: 'agent', tag: 'agent', label: agent };
    const rest = agent.slice(6);
    // Map specific event names to broader tag colors used by .cat-tag[data-cat=...]
    const TAG_MAP = {
      'tier-up': 'tier',
      'subscription': 'subscription',
      'paywall-hit': 'paywall',
      'battle-queue': 'battle', 'battle-result': 'battle',
      'quiz-correct': 'quiz', 'quiz-wrong': 'quiz', 'quiz-session': 'quiz',
      'daily-word': 'daily', 'daily-result': 'daily',
      'learn-lesson': 'learn', 'learn-unit': 'learn',
      'avatar-upload': 'avatar',
      'auth': 'auth',
    };
    return { id: rest, tag: TAG_MAP[rest] || 'agent', label: rest };
  }

  function matchesTab(agent) {
    const tab = TABS.find((t) => t.id === state.tab);
    if (!tab || !tab.match) return true;
    return tab.match(agent || '');
  }
  function rowMatches(log) {
    if (!matchesTab(log.agent)) return false;
    if (state.status !== 'all' && log.status !== state.status) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const hay = ((log.prompt||'') + ' ' + (log.response||'') + ' ' + (log.agent||'') + ' ' + (log.error||'')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function rowHTML(log) {
    const cat = categoryOf(log.agent);
    const detail = log.prompt || log.error || log.response || '—';
    const status = log.status === 'ok'
      ? '<span class="badge ok"><span class="b-dot"></span>OK</span>'
      : '<span class="badge err"><span class="b-dot"></span>ERR</span>';
    return \`
      <div class="col-time">\${fmtTime(log.timestamp)}</div>
      <div class="col-cat"><span class="cat-tag" data-cat="\${cat.tag}">\${esc(cat.label)}</span></div>
      <div class="col-detail">\${esc(String(detail).slice(0, 240))}</div>
      <div class="col-lat">\${log.durationMs || 0}ms</div>
      <div>\${status}</div>
    \`;
  }
  function detailHTML(log) {
    const body = log.response || log.prompt || log.error || '(no body)';
    return '<div class="detail"><div class="detail-body">' + esc(body) + '</div></div>';
  }

  function renderTabs(logs) {
    const counts = { all: logs.length };
    for (const t of TABS) if (t.match) counts[t.id] = logs.filter((l) => t.match(l.agent || '')).length;
    const html = TABS.map((t) => {
      const active = state.tab === t.id ? '1' : '0';
      const c = counts[t.id] != null ? counts[t.id] : '—';
      return \`<div class="tab" data-tab="\${t.id}" data-active="\${active}">
        <div class="tab-icon">\${t.icon}</div>
        <div class="tab-label">\${esc(t.label)}</div>
        <div class="tab-count">\${c}</div>
      </div>\`;
    }).join('');
    const container = document.getElementById('tabs');
    if (container.dataset.last !== html) {
      container.innerHTML = html;
      container.dataset.last = html;
      container.querySelectorAll('.tab').forEach((el) => {
        el.addEventListener('click', () => {
          state.tab = el.dataset.tab;
          tick(true);
        });
      });
    }
  }

  function renderRows(logs) {
    const filtered = logs.filter(rowMatches);
    const rows = document.getElementById('rows');
    const empty = document.getElementById('empty');
    if (!filtered.length) {
      rows.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    rows.innerHTML = filtered.map((log) => {
      const expanded = state.expanded.has(log.id);
      return \`<div class="row" data-id="\${log.id}" data-expanded="\${expanded ? '1' : '0'}">\${rowHTML(log)}\${expanded ? detailHTML(log) : ''}</div>\`;
    }).join('');

    rows.querySelectorAll('.row').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (state.expanded.has(id)) state.expanded.delete(id);
        else state.expanded.add(id);
        renderRows(state.last);
      });
    });
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
    try {
      const q = new URLSearchParams();
      q.set('limit', '300');
      const since = sinceParam();
      if (since) q.set('since', since);
      const r = await fetch('/api/logs?' + q.toString(), { cache: 'no-store' });
      const { logs = [] } = await r.json();
      state.last = logs;

      const visible = logs.filter(rowMatches);
      const total = visible.length;
      const ok = visible.filter((l) => l.status === 'ok').length;
      const avg = total ? Math.round(visible.reduce((s, l) => s + (l.durationMs || 0), 0) / total) : 0;
      const users = new Set();
      for (const l of visible) {
        const uid = l.meta && l.meta.userId;
        if (uid) users.add(uid);
      }

      const tab = TABS.find((t) => t.id === state.tab);
      setStat('s-active', tab ? tab.label : 'All', total + ' events');
      setStat('s-ok', total ? Math.round((ok / total) * 100) + '%' : '—', ok + ' successful');
      setStat('s-lat', avg + 'ms', state.range === 'all' ? 'all time' : 'last ' + state.range);
      setStat('s-users', users.size.toLocaleString(), 'unique players');

      renderTabs(logs);
      renderRows(logs);
    } catch (e) {}
  }

  document.getElementById('f-search').addEventListener('input', (e) => { state.search = e.target.value || ''; tick(true); });
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

  tick(true);
  setInterval(tick, 3000);
</script>
</body>
</html>`;

module.exports = router;
