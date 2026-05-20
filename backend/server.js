// server.js
// WordQuest Pakistan — Express backend orchestrating 4 agents.

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const difficultyAgent = require('./agents/difficultyAgent');
const levelGeneratorAgent = require('./agents/levelGeneratorAgent');
const refereeAgent = require('./agents/refereeAgent');
const rewardAgent = require('./agents/rewardAgent');
const tutorAgent = require('./agents/tutorAgent');
const commentatorAgent = require('./agents/commentatorAgent');
const coachAgent = require('./agents/coachAgent');
const chaalbaazAgent = require('./agents/chaalbaazAgent');
const quizAgent = require('./agents/quizAgent');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({
    name: 'WordQuest Pakistan Backend',
    status: 'ok',
    endpoints: ['/api/health', '/api/generate-level', '/api/validate-word', '/api/round-complete'],
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Live trace dashboard — recent agent calls (in-memory ring buffer).
const logger = require('./utils/logger');
app.get('/api/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  res.json({ ok: true, count: logger.recent(limit).length, logs: logger.recent(limit) });
});

// Static HTML dashboard at /logs — polls /api/logs every 2s.
app.get('/logs', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>WordQuest · Agent Console</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #050912; --bg2: #0b1220;
    --card: #0e1726; --card-soft: #111d33;
    --border: #1f2937; --border-soft: #1e293b;
    --accent: #22c55e; --accent-soft: rgba(34,197,94,0.12);
    --gold: #fcd34d; --purple: #a78bfa;
    --danger: #ef4444; --danger-soft: rgba(239,68,68,0.12);
    --text: #f1f5f9; --muted: #94a3b8; --dim: #475569;
  }
  * { box-sizing: border-box; }
  html, body { background: var(--bg); }
  body {
    margin: 0; padding: 0;
    color: var(--text);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  body::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(800px 400px at 90% 0%, rgba(34,197,94,0.08), transparent 60%),
      radial-gradient(800px 500px at 10% 100%, rgba(167,139,250,0.07), transparent 60%);
  }
  /* ---- TOP BAR ---- */
  .topbar {
    position: sticky; top: 0; z-index: 20;
    background: rgba(5, 9, 18, 0.85);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--border);
    padding: 14px 24px;
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  }
  .brand {
    display: flex; align-items: center; gap: 12px;
    margin-right: auto;
  }
  .brand-logo {
    width: 38px; height: 38px; border-radius: 11px;
    background: linear-gradient(135deg, var(--accent), var(--purple));
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; box-shadow: 0 4px 12px rgba(34,197,94,0.25);
  }
  .brand-text { line-height: 1.2; }
  .brand-title { font-weight: 900; letter-spacing: 0.2px; font-size: 16px; }
  .brand-sub { font-size: 11px; color: var(--muted); font-weight: 500; letter-spacing: 0.5px; }
  .live-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 12px; border-radius: 999px;
    background: var(--accent-soft); border: 1px solid var(--accent);
    color: var(--accent); font-weight: 700; font-size: 11px; letter-spacing: 1px;
  }
  .live-pill.paused { background: rgba(239,68,68,0.1); color: var(--danger); border-color: var(--danger); }
  .live-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: currentColor; box-shadow: 0 0 8px currentColor;
    animation: livepulse 1.4s infinite;
  }
  .live-pill.paused .live-dot { animation: none; opacity: 0.7; }
  @keyframes livepulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
  .iconbtn {
    background: transparent; border: 1px solid var(--border);
    color: var(--muted); cursor: pointer;
    padding: 8px 12px; border-radius: 10px;
    font-family: inherit; font-size: 12px; font-weight: 700; letter-spacing: 0.3px;
    transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px;
  }
  .iconbtn:hover { color: var(--text); border-color: var(--muted); background: rgba(148,163,184,0.05); }
  .iconbtn.danger:hover { color: var(--danger); border-color: var(--danger); background: var(--danger-soft); }

  /* ---- STATS GRID ---- */
  .container { max-width: 1180px; margin: 0 auto; padding: 24px; position: relative; }
  .stats-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
    margin-bottom: 20px;
  }
  @media (max-width: 700px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
  .stat {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 16px; padding: 16px 18px;
    position: relative; overflow: hidden;
  }
  .stat::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, var(--accent), transparent);
  }
  .stat.gold::before  { background: linear-gradient(90deg, var(--gold), transparent); }
  .stat.purple::before{ background: linear-gradient(90deg, var(--purple), transparent); }
  .stat.danger::before{ background: linear-gradient(90deg, var(--danger), transparent); }
  .stat-label {
    font-size: 10px; font-weight: 800; letter-spacing: 1.4px;
    color: var(--muted); text-transform: uppercase;
  }
  .stat-value {
    font-size: 28px; font-weight: 900; margin-top: 6px;
    letter-spacing: -0.5px;
  }
  .stat-value.accent { color: var(--accent); }
  .stat-value.gold   { color: var(--gold); }
  .stat-value.purple { color: var(--purple); }
  .stat-value.danger { color: var(--danger); }
  .stat-meta { font-size: 11px; color: var(--dim); margin-top: 4px; font-weight: 500; }

  /* ---- TOOLBAR ---- */
  .toolbar {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 16px; padding: 14px;
    margin-bottom: 16px;
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  }
  .search {
    flex: 1; min-width: 220px;
    display: flex; align-items: center; gap: 8px;
    background: var(--bg2); border: 1px solid var(--border-soft);
    border-radius: 10px; padding: 0 12px;
  }
  .search input {
    flex: 1; background: transparent; border: 0; outline: 0;
    color: var(--text); padding: 10px 0;
    font-family: inherit; font-size: 13px;
  }
  .search input::placeholder { color: var(--dim); }
  .search-icon { color: var(--muted); font-size: 14px; }
  .chips {
    display: flex; gap: 6px; flex-wrap: wrap;
  }
  .chip {
    padding: 6px 11px; border-radius: 999px;
    background: rgba(148, 163, 184, 0.06);
    border: 1px solid var(--border-soft);
    color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: 0.3px;
    cursor: pointer; user-select: none;
    transition: all 0.12s;
  }
  .chip:hover { color: var(--text); border-color: var(--muted); }
  .chip.active {
    background: var(--accent); color: #050912; border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent), 0 4px 12px rgba(34,197,94,0.3);
  }

  /* ---- LOG ENTRY ---- */
  .log {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 14px; padding: 0;
    margin-bottom: 10px;
    overflow: hidden;
    animation: slidein 0.25s ease-out;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .log:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 28px rgba(0,0,0,0.25);
  }
  .log.err { border-color: rgba(239,68,68,0.45); }
  @keyframes slidein {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: none; }
  }
  .log-head {
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    padding: 12px 16px;
    cursor: pointer; user-select: none;
    border-bottom: 1px solid transparent;
    transition: border-color 0.15s;
  }
  .log.open .log-head { border-bottom-color: var(--border-soft); }
  .log-head:hover { background: rgba(148,163,184,0.03); }
  .badge {
    padding: 4px 9px; border-radius: 6px; font-size: 10px; font-weight: 900;
    letter-spacing: 0.8px; text-transform: uppercase;
    font-family: 'JetBrains Mono', Menlo, monospace;
  }
  .b-agent { background: rgba(167, 139, 250, 0.18); color: var(--purple); }
  .b-model { background: rgba(252, 211, 77, 0.12); color: var(--gold); }
  .b-status-ok { background: var(--accent-soft); color: var(--accent); }
  .b-status-err { background: var(--danger-soft); color: var(--danger); }
  .b-dur { background: rgba(148, 163, 184, 0.1); color: #cbd5e1; }
  .b-tok { background: rgba(148, 163, 184, 0.06); color: var(--muted); }
  .ts {
    font-family: 'JetBrains Mono', Menlo, monospace;
    font-size: 11px; color: var(--muted); margin-left: auto;
  }
  .caret { color: var(--dim); font-size: 12px; transition: transform 0.2s; }
  .log.open .caret { transform: rotate(90deg); color: var(--text); }
  .log-body {
    max-height: 0; overflow: hidden;
    transition: max-height 0.25s ease;
  }
  .log.open .log-body { max-height: 1200px; }
  .log-body-inner { padding: 14px 16px 16px; }
  .block-wrap { position: relative; margin-top: 10px; }
  .block-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 6px;
  }
  .label {
    font-size: 9.5px; font-weight: 900; letter-spacing: 1.4px;
    color: var(--muted); text-transform: uppercase;
  }
  .copybtn {
    background: rgba(148,163,184,0.06); border: 1px solid var(--border-soft);
    color: var(--muted); cursor: pointer;
    padding: 3px 8px; border-radius: 6px;
    font-family: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
    transition: all 0.12s;
  }
  .copybtn:hover { color: var(--text); border-color: var(--accent); }
  .copybtn.copied { color: var(--accent); border-color: var(--accent); }
  .block {
    background: var(--bg2); border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 12px 14px;
    font-family: 'JetBrains Mono', SF Mono, Menlo, Consolas, monospace;
    font-size: 12px; line-height: 1.55;
    color: #d1d9e8; white-space: pre-wrap; word-break: break-word;
    max-height: 240px; overflow-y: auto;
  }
  .block.err { border-color: rgba(239,68,68,0.3); color: #fca5a5; }
  .block::-webkit-scrollbar { width: 8px; }
  .block::-webkit-scrollbar-track { background: transparent; }
  .block::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .empty {
    padding: 80px 40px; text-align: center;
    border: 2px dashed var(--border); border-radius: 18px;
    color: var(--muted);
  }
  .empty-icon { font-size: 56px; opacity: 0.5; margin-bottom: 14px; }
  .empty-title { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
  .empty-sub { font-size: 13px; line-height: 1.5; max-width: 380px; margin: 0 auto; }
  .footer {
    margin-top: 30px; padding: 18px 0; text-align: center;
    color: var(--dim); font-size: 11px; letter-spacing: 0.4px;
  }
</style>
</head>
<body>

<div class="topbar">
  <div class="brand">
    <div class="brand-logo">🤖</div>
    <div class="brand-text">
      <div class="brand-title">WordQuest Agent Console</div>
      <div class="brand-sub">Real-time observability for 9 agents</div>
    </div>
  </div>
  <div id="livePill" class="live-pill"><span class="live-dot"></span><span id="liveLabel">LIVE · 2s</span></div>
  <button id="pauseBtn" class="iconbtn">⏸ Pause</button>
  <button id="clearBtn" class="iconbtn danger">🗑 Clear</button>
</div>

<div class="container">
  <!-- Stats -->
  <div class="stats-grid">
    <div class="stat">
      <div class="stat-label">Total Calls</div>
      <div class="stat-value accent" id="stat-total">0</div>
      <div class="stat-meta" id="stat-meta">In-memory window</div>
    </div>
    <div class="stat gold">
      <div class="stat-label">Success</div>
      <div class="stat-value gold" id="stat-ok">0</div>
      <div class="stat-meta" id="stat-ok-pct">0% success rate</div>
    </div>
    <div class="stat danger">
      <div class="stat-label">Errors</div>
      <div class="stat-value danger" id="stat-err">0</div>
      <div class="stat-meta" id="stat-err-pct">0% error rate</div>
    </div>
    <div class="stat purple">
      <div class="stat-label">Tokens Used</div>
      <div class="stat-value purple" id="stat-tokens">0</div>
      <div class="stat-meta" id="stat-tokens-avg">— per call avg</div>
    </div>
  </div>

  <!-- Toolbar -->
  <div class="toolbar">
    <div class="search">
      <span class="search-icon">🔍</span>
      <input id="searchInput" type="text" placeholder="Search prompts, responses, or errors..." />
    </div>
    <div class="chips" id="chips">
      <span class="chip active" data-agent="all">All Agents</span>
    </div>
  </div>

  <!-- Logs -->
  <div id="logs"></div>

  <div class="footer">Powered by Express · OpenAI gpt-4o-mini · In-memory ring buffer (last 200 calls)</div>
</div>

<script>
const knownAgents = new Set(['all']);
const chipsEl = document.getElementById('chips');
const logsEl = document.getElementById('logs');
const searchEl = document.getElementById('searchInput');
const pauseBtn = document.getElementById('pauseBtn');
const clearBtn = document.getElementById('clearBtn');
const livePill = document.getElementById('livePill');
const liveLabel = document.getElementById('liveLabel');
let activeFilter = 'all';
let paused = false;
let searchTerm = '';
const openSet = new Set(); // log IDs that are expanded

chipsEl.addEventListener('click', (e) => {
  if (!e.target.classList.contains('chip')) return;
  document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  e.target.classList.add('active');
  activeFilter = e.target.dataset.agent;
  render(window.lastLogs || []);
});

searchEl.addEventListener('input', (e) => {
  searchTerm = e.target.value.toLowerCase().trim();
  render(window.lastLogs || []);
});

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
  livePill.classList.toggle('paused', paused);
  liveLabel.textContent = paused ? 'PAUSED' : 'LIVE · 2s';
});

clearBtn.addEventListener('click', async () => {
  if (!confirm('Clear all logs?')) return;
  try {
    await fetch('/api/logs/clear', { method: 'POST' });
    tick();
  } catch {}
});

function addChipsFor(agents) {
  agents.forEach((a) => {
    if (knownAgents.has(a)) return;
    knownAgents.add(a);
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.agent = a;
    chip.textContent = a;
    chipsEl.appendChild(chip);
  });
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false });
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { hour12: false });
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1400);
  } catch {
    btn.textContent = '✕ Failed';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1400);
  }
}

function filterLogs(logs) {
  let filtered = activeFilter === 'all'
    ? logs
    : logs.filter((l) => l.agent === activeFilter);
  if (searchTerm) {
    filtered = filtered.filter((l) =>
      [l.prompt, l.response, l.error, l.agent, l.model]
        .filter(Boolean).join(' ').toLowerCase().includes(searchTerm),
    );
  }
  return filtered;
}

function render(logs) {
  const filtered = filterLogs(logs);
  if (!filtered.length) {
    logsEl.innerHTML = \`
      <div class="empty">
        <div class="empty-icon">📡</div>
        <div class="empty-title">\${logs.length ? 'No matching traces' : 'Waiting for agent activity'}</div>
        <div class="empty-sub">\${logs.length
          ? 'Try a different filter or search term.'
          : 'Open the app and start playing — every AI call will appear here in real time.'}
        </div>
      </div>\`;
    return;
  }
  logsEl.innerHTML = filtered.map((l) => {
    const isErr = l.status !== 'ok';
    const open = openSet.has(l.id);
    const tokens = l.tokens
      ? '<span class="badge b-tok">↑' + (l.tokens.prompt || 0) + ' · ↓' + (l.tokens.completion || 0) + '</span>'
      : '';
    const promptBlock = l.prompt ? \`
      <div class="block-wrap">
        <div class="block-head">
          <span class="label">Prompt</span>
          <button class="copybtn" data-copy="prompt-\${l.id}">Copy</button>
        </div>
        <div class="block" id="prompt-\${l.id}">\${escapeHtml(l.prompt)}</div>
      </div>\` : '';
    const responseBlock = l.response ? \`
      <div class="block-wrap">
        <div class="block-head">
          <span class="label">Response</span>
          <button class="copybtn" data-copy="response-\${l.id}">Copy</button>
        </div>
        <div class="block" id="response-\${l.id}">\${escapeHtml(l.response)}</div>
      </div>\` : '';
    const errorBlock = l.error ? \`
      <div class="block-wrap">
        <div class="block-head">
          <span class="label" style="color: var(--danger);">Error</span>
          <button class="copybtn" data-copy="error-\${l.id}">Copy</button>
        </div>
        <div class="block err" id="error-\${l.id}">\${escapeHtml(l.error)}</div>
      </div>\` : '';
    return \`
      <div class="log \${isErr ? 'err' : ''} \${open ? 'open' : ''}" data-id="\${l.id}">
        <div class="log-head" data-toggle="\${l.id}">
          <span class="badge b-agent">\${escapeHtml(l.agent || 'unknown')}</span>
          <span class="badge b-model">\${escapeHtml(l.model || 'gpt-4o-mini')}</span>
          <span class="badge \${isErr ? 'b-status-err' : 'b-status-ok'}">\${isErr ? 'error' : 'ok'}</span>
          <span class="badge b-dur">\${l.durationMs || 0} ms</span>
          \${tokens}
          <span class="ts" title="\${fmtDate(l.timestamp)}">\${fmtTime(l.timestamp)}</span>
          <span class="caret">▶</span>
        </div>
        <div class="log-body">
          <div class="log-body-inner">
            \${promptBlock}\${responseBlock}\${errorBlock}
          </div>
        </div>
      </div>\`;
  }).join('');

  // Wire up toggle + copy
  logsEl.querySelectorAll('[data-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.toggle;
      if (openSet.has(id)) openSet.delete(id);
      else openSet.add(id);
      el.closest('.log').classList.toggle('open');
    });
  });
  logsEl.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = document.getElementById(btn.dataset.copy);
      if (target) copyText(target.textContent, btn);
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

async function tick() {
  if (paused) return;
  try {
    const r = await fetch('/api/logs?limit=120', { cache: 'no-store' });
    const j = await r.json();
    const logs = j.logs || [];
    window.lastLogs = logs;
    addChipsFor([...new Set(logs.map((l) => l.agent).filter(Boolean))]);
    const okCount = logs.filter((l) => l.status === 'ok').length;
    const errCount = logs.filter((l) => l.status !== 'ok').length;
    const total = logs.length;
    const totalTokens = logs.reduce((n, l) => n + (l.tokens?.total || 0), 0);
    document.getElementById('stat-total').textContent = total.toLocaleString();
    document.getElementById('stat-ok').textContent = okCount.toLocaleString();
    document.getElementById('stat-err').textContent = errCount.toLocaleString();
    document.getElementById('stat-tokens').textContent = totalTokens.toLocaleString();
    document.getElementById('stat-ok-pct').textContent =
      total ? Math.round((okCount / total) * 100) + '% success rate' : '— success rate';
    document.getElementById('stat-err-pct').textContent =
      total ? Math.round((errCount / total) * 100) + '% error rate' : '— error rate';
    document.getElementById('stat-tokens-avg').textContent =
      total ? Math.round(totalTokens / total).toLocaleString() + ' avg per call' : '— per call avg';
    render(logs);
  } catch (err) {}
}
tick();
setInterval(tick, 2000);
</script>
</body>
</html>`);
});

// Allow clearing the log buffer from the dashboard UI.
app.post('/api/logs/clear', (_req, res) => {
  logger.clear();
  res.json({ ok: true });
});

function dedupeLevel(level) {
  if (!level) return level;
  const seen = new Set();
  const words = [];
  for (const w of level.words || []) {
    const u = String(w).toUpperCase();
    if (!seen.has(u)) {
      seen.add(u);
      words.push(u);
    }
  }
  const posSeen = new Set();
  const positions = [];
  for (const p of level.wordPositions || []) {
    const u = String(p.word).toUpperCase();
    if (seen.has(u) && !posSeen.has(u)) {
      posSeen.add(u);
      positions.push({ ...p, word: u });
    }
  }
  return { ...level, words, wordPositions: positions };
}

app.post('/api/generate-level', async (req, res) => {
  try {
    const {
      playerStats = {},
      language = 'english',
      levelNumber = 0,
      dailySeed = null,
      // Level-Mode retry / reshuffle parameters.
      reshuffleWords = null,
      reshuffleCategory = '',
      reshuffleEmoji = '',
      reshuffleFunFact = '',
    } = req.body || {};
    let difficulty;
    let chaalbaazActive = false;

    if (dailySeed) {
      // Daily Challenge — ALWAYS 10×10 grid, 10 words, 100s. Static.
      difficulty = {
        difficulty: 'hard',
        timeLimit: 100,
        wordCount: 10,
        gridSize: 10,
        reason: 'Daily Challenge — 10×10 grid, 10 words, 100s.',
        isDaily: true,
      };
    } else if (levelNumber > 0) {
      // Level Mode — use the locked level table; no adaptive logic.
      difficulty = difficultyAgent({}, { levelNumber });
    } else {
      // Quick Play — adaptive difficulty (unchanged).
      difficulty = difficultyAgent(playerStats);
      const chaalbaazTune = await chaalbaazAgent({ mode: 'tune', playerStats });
      if (chaalbaazTune) {
        difficulty = { ...difficulty, ...chaalbaazTune };
        chaalbaazActive = true;
      }
    }

    const rawLevel = await levelGeneratorAgent({
      ...difficulty,
      lastCategory: playerStats.lastCategory || '',
      language,
      levelNumber,
      dailySeed,
      reshuffleWords,
      reshuffleCategory,
      reshuffleEmoji,
      reshuffleFunFact,
    });
    const level = dedupeLevel(rawLevel);
    res.json({
      ok: true,
      difficulty,
      level,
      chaalbaazActive,
      levelNumber,
    });
  } catch (err) {
    console.error('generate-level error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/validate-word', (req, res) => {
  try {
    const result = refereeAgent(req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    console.error('validate-word error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/explain-word', async (req, res) => {
  try {
    const result = await tutorAgent(req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    console.error('explain-word error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/commentary', async (req, res) => {
  try {
    const result = await commentatorAgent(req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    console.error('commentary error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/coach', async (req, res) => {
  try {
    const result = await coachAgent(req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    console.error('coach error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/chat-chaalbaaz', async (req, res) => {
  try {
    const result = await chaalbaazAgent({ ...(req.body || {}), mode: 'chat' });
    res.json({ ok: true, result });
  } catch (err) {
    console.error('chaalbaaz error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/round-complete', async (req, res) => {
  try {
    const result = await rewardAgent(req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    console.error('round-complete error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/generate-quiz', async (req, res) => {
  try {
    const result = await quizAgent(req.body || {});
    if (result && result.ok === false) {
      // Bubble up the AI failure to the client so it can show a real error
      // instead of an empty quiz screen.
      return res.status(503).json({ ok: false, error: result.error });
    }
    return res.json({ ok: true, result });
  } catch (err) {
    console.error('quiz error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Local dev: start a listener. On Vercel (serverless), just export the app.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🎮 WordQuest backend running on http://localhost:${PORT}`);
  });
}

module.exports = app;
