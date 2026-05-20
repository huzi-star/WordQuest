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
<title>WordQuest · Agent Trace Live</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    --bg: #070b14; --card: #0e1726; --border: #1f2937;
    --accent: #22c55e; --gold: #fcd34d; --purple: #a78bfa;
    --danger: #ef4444; --muted: #94a3b8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    background: var(--bg); color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    min-height: 100vh;
  }
  header {
    position: sticky; top: 0; z-index: 10;
    backdrop-filter: blur(12px);
    background: rgba(7, 11, 20, 0.85);
    border-bottom: 1px solid var(--border);
    padding: 16px 20px;
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 12px;
  }
  h1 {
    margin: 0; font-size: 20px; font-weight: 900; letter-spacing: 0.5px;
    background: linear-gradient(135deg, var(--accent), var(--purple));
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 12px; border-radius: 999px;
    font-size: 11px; font-weight: 700; letter-spacing: 1px;
    background: rgba(34, 197, 94, 0.12); color: var(--accent);
    border: 1px solid var(--accent);
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent); animation: pulse 1.4s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }
  .stats { display: flex; gap: 14px; font-size: 12px; color: var(--muted); }
  .stats b { color: #fff; font-size: 14px; }
  .filters {
    padding: 12px 20px;
    display: flex; gap: 8px; flex-wrap: wrap;
    border-bottom: 1px solid var(--border);
  }
  .chip {
    padding: 6px 12px; border-radius: 999px;
    background: rgba(148, 163, 184, 0.08);
    border: 1px solid var(--border);
    color: var(--muted); font-size: 12px; font-weight: 700;
    cursor: pointer; user-select: none;
    transition: all 0.15s;
  }
  .chip:hover { color: #fff; border-color: var(--muted); }
  .chip.active {
    background: var(--accent); color: var(--bg); border-color: var(--accent);
  }
  main { padding: 16px 20px; max-width: 1100px; margin: 0 auto; }
  .log {
    background: var(--card);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 10px;
    animation: slidein 0.3s ease-out;
  }
  .log.err { border-left-color: var(--danger); }
  @keyframes slidein {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: none; }
  }
  .log-head {
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .badge {
    padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 900;
    letter-spacing: 1px; text-transform: uppercase;
  }
  .b-agent { background: rgba(167, 139, 250, 0.18); color: var(--purple); }
  .b-model { background: rgba(252, 211, 77, 0.15); color: var(--gold); }
  .b-status-ok { background: rgba(34, 197, 94, 0.18); color: var(--accent); }
  .b-status-err { background: rgba(239, 68, 68, 0.18); color: var(--danger); }
  .b-dur { background: rgba(148, 163, 184, 0.12); color: #cbd5e1; }
  .b-tokens { background: rgba(148, 163, 184, 0.08); color: var(--muted); font-weight: 700; }
  .ts { font-size: 11px; color: var(--muted); margin-left: auto; }
  .block {
    background: #0a0f1a; border: 1px solid #1e293b; border-radius: 8px;
    padding: 10px 12px; margin-top: 8px;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 12px; line-height: 1.5;
    color: #cbd5e1; white-space: pre-wrap; word-break: break-word;
    max-height: 200px; overflow-y: auto;
  }
  .label { font-size: 10px; font-weight: 900; letter-spacing: 1.2px; color: var(--muted); margin-top: 8px; margin-bottom: 4px; }
  .empty { padding: 40px; text-align: center; color: var(--muted); font-size: 14px; }
  .err-text { color: var(--danger); font-weight: 700; font-size: 12px; }
</style>
</head>
<body>
<header>
  <div>
    <h1>🤖 WordQuest · Agent Trace Live</h1>
    <div class="stats" style="margin-top: 6px;">
      <span><b id="stat-total">0</b> calls</span>
      <span><b id="stat-ok" style="color: var(--accent)">0</b> ok</span>
      <span><b id="stat-err" style="color: var(--danger)">0</b> err</span>
      <span><b id="stat-tokens">0</b> tokens</span>
    </div>
  </div>
  <div class="pill"><span class="dot"></span> Live · auto-refresh 2s</div>
</header>
<div class="filters" id="filters">
  <span class="chip active" data-agent="all">All</span>
</div>
<main id="logs"></main>
<script>
const known = new Set(['all']);
const filterEl = document.getElementById('filters');
const logsEl = document.getElementById('logs');
let activeFilter = 'all';

filterEl.addEventListener('click', (e) => {
  if (!e.target.classList.contains('chip')) return;
  document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  e.target.classList.add('active');
  activeFilter = e.target.dataset.agent;
  render(window.lastLogs || []);
});

function addChipsFor(agents) {
  agents.forEach((a) => {
    if (known.has(a)) return;
    known.add(a);
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.agent = a;
    chip.textContent = a;
    filterEl.appendChild(chip);
  });
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function render(logs) {
  const filtered = activeFilter === 'all' ? logs : logs.filter((l) => l.agent === activeFilter);
  if (!filtered.length) {
    logsEl.innerHTML = '<div class="empty">No agent calls yet. Open the app and play a round to see traces appear here in real time.</div>';
    return;
  }
  logsEl.innerHTML = filtered.map((l) => {
    const isErr = l.status !== 'ok';
    const tokens = l.tokens
      ? '<span class="badge b-tokens">↑' + (l.tokens.prompt || 0) + ' ↓' + (l.tokens.completion || 0) + '</span>'
      : '';
    return '<div class="log ' + (isErr ? 'err' : '') + '">' +
      '<div class="log-head">' +
        '<span class="badge b-agent">' + (l.agent || 'unknown') + '</span>' +
        '<span class="badge b-model">' + (l.model || 'gpt-4o-mini') + '</span>' +
        '<span class="badge ' + (isErr ? 'b-status-err' : 'b-status-ok') + '">' + (isErr ? 'error' : 'ok') + '</span>' +
        '<span class="badge b-dur">' + (l.durationMs || 0) + ' ms</span>' +
        tokens +
        '<span class="ts">' + fmtTime(l.timestamp) + '</span>' +
      '</div>' +
      (l.prompt ? '<div class="label">PROMPT</div><div class="block">' + escapeHtml(l.prompt) + '</div>' : '') +
      (l.response ? '<div class="label">RESPONSE</div><div class="block">' + escapeHtml(l.response) + '</div>' : '') +
      (l.error ? '<div class="label">ERROR</div><div class="block err-text">' + escapeHtml(l.error) + '</div>' : '') +
    '</div>';
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

async function tick() {
  try {
    const r = await fetch('/api/logs?limit=120', { cache: 'no-store' });
    const j = await r.json();
    const logs = j.logs || [];
    window.lastLogs = logs;
    addChipsFor([...new Set(logs.map((l) => l.agent).filter(Boolean))]);
    document.getElementById('stat-total').textContent = logs.length;
    document.getElementById('stat-ok').textContent = logs.filter((l) => l.status === 'ok').length;
    document.getElementById('stat-err').textContent = logs.filter((l) => l.status !== 'ok').length;
    document.getElementById('stat-tokens').textContent = logs.reduce(
      (n, l) => n + (l.tokens?.total || 0), 0,
    ).toLocaleString();
    render(logs);
  } catch (err) {
    // ignore poll error
  }
}
tick();
setInterval(tick, 2000);
</script>
</body>
</html>`);
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
