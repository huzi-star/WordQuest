// Admin Dashboard — Lattice-style, user-friendly, per-user drill-down with token tracking.
//
// 4 sections in a single SPA at /admin:
//   1. Overview  — KPI tiles, recent activity, plan donut, token usage today
//   2. Users     — filterable list, each row shows tokens + games + tier
//   3. User      — full per-user analysis: stats, tokens by agent, recent activity
//   4. Traces    — every agent + event log, filterable
//   5. Plans     — subscription distribution + coupons
//
// JSON endpoints:
//   GET /api/admin/overview
//   GET /api/admin/users?search=&plan=&sort=
//   GET /api/admin/users/:userId
//   GET /api/admin/plans
//   GET /api/admin/traces?category=&status=&since=&search=&limit=

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://epjndqbazobrfhovhpza.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwam5kcWJhem9icmZob3ZocHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTA1MzUsImV4cCI6MjA5NDU4NjUzNX0.wX__oXkj215e-19N9V5dpJWme7SJkUa5IIl6qO1s13g';

let _sb = null;
function sb() {
  if (_sb !== null) return _sb;
  try {
    _sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (_) { _sb = false; }
  return _sb || null;
}

// Real avatar lookup — mobile uploads to Supabase storage at
// `avatars/{userId}/avatar.{ext}` but never writes the URL back to the
// `wq_user_leaderboard` view, so admin reads always saw null. This helper
// lists the bucket once per minute and builds a userId -> publicUrl map.
let _avatarCacheTs = 0;
let _avatarCache = new Map();
const _AVATAR_CACHE_MS = 60_000;
async function loadStorageAvatars(client) {
  const now = Date.now();
  if (now - _avatarCacheTs < _AVATAR_CACHE_MS && _avatarCache.size > 0) return _avatarCache;
  try {
    const { data: dirs } = await client.storage.from('avatars').list('', {
      limit: 1000, sortBy: { column: 'name', order: 'asc' },
    });
    if (!Array.isArray(dirs) || !dirs.length) return _avatarCache;
    const next = new Map();
    await Promise.all(dirs.map(async (d) => {
      const uid = d && d.name;
      if (!uid || uid.length < 30) return;
      try {
        const { data: files } = await client.storage.from('avatars').list(uid, { limit: 5 });
        const f = (files || []).find((x) => x && x.name && x.name.startsWith('avatar.'));
        if (!f) return;
        const { data: pub } = client.storage.from('avatars').getPublicUrl(`${uid}/${f.name}`);
        if (pub && pub.publicUrl) {
          next.set(uid, `${pub.publicUrl}?v=${Date.parse(f.updated_at || f.created_at) || Date.now()}`);
        }
      } catch (_) {}
    }));
    if (next.size) {
      _avatarCache = next;
      _avatarCacheTs = now;
    }
  } catch (_) {}
  return _avatarCache;
}
// Merge storage avatars into a leaderboard map IN PLACE so every lbMap
// entry's avatar_url falls back to the real photo the user uploaded
// inside the game.
function mergeAvatars(lbMap, storageMap) {
  if (!storageMap || !storageMap.size) return lbMap;
  for (const [uid, row] of lbMap.entries()) {
    if (!row.avatar_url && storageMap.has(uid)) {
      lbMap.set(uid, { ...row, avatar_url: storageMap.get(uid) });
    }
  }
  // Users present in storage but missing from leaderboard (rare — e.g.
  // brand-new sign-up who uploaded a photo before scoring) — synthesize a
  // minimal profile so their face still shows up in live traces.
  for (const [uid, url] of storageMap.entries()) {
    if (!lbMap.has(uid)) {
      lbMap.set(uid, {
        user_id: uid, display_name: null, avatar_color: '#3b82f6',
        avatar_emoji: null, avatar_url: url,
      });
    }
  }
  return lbMap;
}

const TIERS = [
  { key: 'bronze',   name: 'Bronze',   rank: 1, minScore: 0,    emoji: '🥉' },
  { key: 'silver',   name: 'Silver',   rank: 2, minScore: 300,  emoji: '🥈' },
  { key: 'gold',     name: 'Gold',     rank: 3, minScore: 600,  emoji: '🏅' },
  { key: 'platinum', name: 'Platinum', rank: 4, minScore: 900,  emoji: '💠' },
  { key: 'diamond',  name: 'Diamond',  rank: 5, minScore: 1500, emoji: '💎' },
  { key: 'elite',    name: 'Elite',    rank: 6, minScore: 2100, emoji: '👑' },
  { key: 'master',   name: 'Master',   rank: 7, minScore: 2500, emoji: '🔥' },
];
function tierFor(score = 0) {
  let pick = TIERS[0];
  for (const t of TIERS) if ((score || 0) >= t.minScore) pick = t;
  return pick;
}

// Broad userId extraction. Trace rows can place the player's id in three
// places: meta.userId (best), response JSON, and prompt JSON. We also
// match any bare UUID anywhere in those fields as a last resort — the
// admin dashboard needs to attribute EVERY agent call to the right kid.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function extractUserIds(row) {
  const ids = new Set();
  if (row.meta && row.meta.userId) ids.add(String(row.meta.userId));
  for (const field of ['response', 'prompt']) {
    const v = row[field];
    if (typeof v !== 'string' || !v) continue;
    const explicit = v.match(/"userId"\s*:\s*"([^"]+)"/);
    if (explicit) ids.add(explicit[1]);
    const bare = v.match(UUID_RE);
    if (bare) bare.forEach((u) => ids.add(u));
  }
  return [...ids];
}

// =============================================================
// JSON ENDPOINTS
// =============================================================

router.get('/api/admin/overview', async (req, res) => {
  const c = sb();
  if (!c) return res.json({ ok: false, error: 'no-supabase' });

  // Date-range filter — single source of truth for the Overview page.
  // Accepts: today (default) | 7d | 30d | 90d | 1y. Everything below
  // (KPIs, token breakdown, plan mix, recent activity) is scoped at the
  // Supabase query level so the metrics are genuinely range-filtered,
  // not client-trimmed.
  const RANGE_MS = {
    'today': null, // special — uses startOfDay UTC
    '7d':  7  * 86400e3,
    '30d': 30 * 86400e3,
    '90d': 90 * 86400e3,
    '1y':  365 * 86400e3,
  };
  const range = RANGE_MS.hasOwnProperty(req.query.range) ? String(req.query.range) : 'today';
  const since = range === 'today'
    ? (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; })()
    : new Date(Date.now() - RANGE_MS[range]);
  const sinceISO = since.toISOString();
  const sliceLimit = 1500;

  const [stats, lb, subs, logsRange, recent] = await Promise.all([
    c.from('user_stats').select('user_id, total_games, total_score, high_score, updated_at'),
    c.from('wq_user_leaderboard').select('user_id, display_name, avatar_color, avatar_emoji, avatar_url'),
    c.from('wq_subscriptions').select('user_id, plan'),
    // KPI source — every agent_log row whose created_at falls in the
    // selected window. Used for tokens, agent calls, events, errors.
    c.from('agent_logs').select('id, agent, status, total_tokens, prompt_tokens, completion_tokens, duration_ms').gte('created_at', sinceISO).limit(5000),
    // Recent activity list — same window, newest first, capped at 1500 so
    // the page can render. We pull a generous slice for accurate temporal
    // user attribution within the range.
    c.from('agent_logs').select('id, trace_id, agent, status, prompt, response, meta, duration_ms, total_tokens, prompt_tokens, completion_tokens, model, created_at, error').gte('created_at', sinceISO).order('created_at', { ascending: false }).limit(sliceLimit),
  ]);

  const allUsers = stats.data || [];
  const lbMap = new Map(); (lb.data || []).forEach((r) => lbMap.set(r.user_id, r));
  mergeAvatars(lbMap, await loadStorageAvatars(c));

  // Users active in the selected range — same scope as everything else
  // on the Overview page so the dropdown controls every card uniformly.
  const rangeActiveUids = new Set();
  allUsers.forEach((u) => {
    if (u.updated_at && new Date(u.updated_at) >= since) rangeActiveUids.add(u.user_id);
  });

  const logs = logsRange.data || [];
  const agentCalls = logs.filter((l) => l.agent && !String(l.agent).startsWith('event:')).length;
  const eventsCount = logs.filter((l) => l.agent && String(l.agent).startsWith('event:')).length;
  const errors = logs.filter((l) => l.status === 'error').length;
  const totalTokens = logs.reduce((a, l) => a + (l.total_tokens || 0), 0);
  const promptTokens = logs.reduce((a, l) => a + (l.prompt_tokens || 0), 0);
  const completionTokens = logs.reduce((a, l) => a + (l.completion_tokens || 0), 0);
  const avgLatency = agentCalls ? Math.round(logs.filter((l) => !String(l.agent || '').startsWith('event:')).reduce((a, l) => a + (l.duration_ms || 0), 0) / agentCalls) : 0;

  const subMap = new Map(); (subs.data || []).forEach((s) => subMap.set(s.user_id, s.plan));
  const planCounts = { free: 0, pro: 0, pro_max: 0 };
  allUsers.forEach((u) => {
    const plan = subMap.get(u.user_id) || 'free';
    if (planCounts[plan] != null) planCounts[plan]++;
    else planCounts.free++;
  });

  // Build a temporal user attribution window. Agent calls without an
  // explicit userId (e.g. /api/event posts that fire-and-forget with
  // userId=null) get attributed to the kid whose session is active at
  // that moment. We search BIDIRECTIONALLY:
  //   - look BACK up to 90s   — covers system-fired follow-ups (reward,
  //                              motivationLine, commentary)
  //   - look FORWARD up to 10s — covers the inverse case where an event
  //                              fires a hair BEFORE the player's first
  //                              user-attributed agent call of the round.
  // Result: every event lands on the right player; "Unknown User"
  // appears only for truly anonymous (logged-out) traffic.
  // Widened windows: a live game session can have 90+ seconds between two
  // user-tagged rows (e.g. a long word-search round). Untagged warmup rows
  // (commentary, guardrail sub-calls) that fire BEFORE the first tagged
  // row used to flip to "Unknown User" because the 10s forward window was
  // too tight. 5-minute back, 90-second forward fixes both sides.
  const ATTRIB_BACK_MS = 300_000;
  const ATTRIB_FWD_MS  = 90_000;
  const allRecent = recent.data || [];
  const rowsAsc = [...allRecent].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const lastUidByTime = []; // ascending — [{ t, uid }]
  rowsAsc.forEach((r) => {
    const uids = extractUserIds(r);
    if (uids.length) lastUidByTime.push({ t: new Date(r.created_at).getTime(), uid: uids[0] });
  });
  function attribute(row) {
    const own = extractUserIds(row);
    if (own.length) return own[0];
    const t = new Date(row.created_at).getTime();
    // Search backward first — most events are tail-attributions.
    for (let i = lastUidByTime.length - 1; i >= 0; i--) {
      const e = lastUidByTime[i];
      if (e.t > t) continue;
      if (t - e.t > ATTRIB_BACK_MS) break;
      return e.uid;
    }
    // Fall back to forward search within a tight 10s window.
    for (let i = 0; i < lastUidByTime.length; i++) {
      const e = lastUidByTime[i];
      if (e.t < t) continue;
      if (e.t - t > ATTRIB_FWD_MS) break;
      return e.uid;
    }
    return null;
  }

  // Drop internal sub-calls (e.g. guardrail validating individual
  // meaning/example/synonym fields INSIDE another agent's flow). The live
  // feed shows only TOP-LEVEL agent triggers — wordDetailAgent appears
  // once when it runs, not once per field it validates internally.
  // The internal guardrail check that fires BEFORE the gated agent
  // (e.g. direct /api/guardrail/check) still surfaces — it isn't marked
  // internal. KPI totals still include the internal calls.
  const surfaceRecent = allRecent.filter((e) => !(e.meta && e.meta.internal === true));
  const recentEvents = surfaceRecent.map((e) => {
    const uid = attribute(e);
    const profile = uid ? lbMap.get(uid) : null;
    const meta = e.meta || {};
    return {
      id: e.trace_id || String(e.id),
      agent: e.agent, status: e.status,
      prompt: e.prompt, response: e.response, meta,
      model: e.model, durationMs: e.duration_ms, tokens: e.total_tokens || 0,
      createdAt: e.created_at,
      tool: meta.tool || (e.model ? ('OpenAI · ' + e.model) : 'Local logic'),
      reason: meta.reason || null,
      decision: meta.decision || null,
      confidence: meta.confidence != null ? meta.confidence : null,
      fallback: !!meta.fallback || e.status === 'fallback',
      userId: uid,
      userName: profile ? profile.display_name : null,
      userColor: profile ? profile.avatar_color : null,
      userEmoji: profile ? profile.avatar_emoji : null,
      userAvatarUrl: profile ? profile.avatar_url : null,
      promptTokens: e.prompt_tokens || 0,
      completionTokens: e.completion_tokens || 0,
      isAgent: !String(e.agent || '').startsWith('event:'),
    };
  });

  res.json({
    ok: true,
    range,
    totals: {
      // "Total Users" stays as the all-time registered count — it is a
      // lifetime stat by definition, so the date-range dropdown must NOT
      // affect it. Every other card scales with the chosen range.
      users: allUsers.length,
      activeToday: rangeActiveUids.size,
      activeWeek: rangeActiveUids.size,
      totalGames: allUsers.reduce((a, u) => a + (u.total_games || 0), 0),
      agentCalls,
      eventsCount,
      errors,
      avgLatency,
      totalTokens,
      promptTokens,
      completionTokens,
    },
    plans: planCounts,
    recent: recentEvents,
  });
});

router.get('/api/admin/users', async (req, res) => {
  const c = sb();
  if (!c) return res.json({ ok: false, error: 'no-supabase' });

  const search = String(req.query.search || '').toLowerCase().trim();
  const planFilter = String(req.query.plan || 'all');
  const sort = String(req.query.sort || 'recent');

  const [stats, lb, subs, logs] = await Promise.all([
    c.from('user_stats').select('*').limit(500),
    c.from('wq_user_leaderboard').select('*').limit(500),
    c.from('wq_subscriptions').select('*').limit(500),
    c.from('agent_logs').select('agent, total_tokens, meta, response').limit(5000),
  ]);

  // Aggregate token usage + call count per user
  const tokenMap = new Map();   // userId -> { tokens, calls }
  (logs.data || []).forEach((row) => {
    const uids = extractUserIds(row);
    if (!uids.length) return;
    uids.forEach((uid) => {
      const entry = tokenMap.get(uid) || { tokens: 0, calls: 0 };
      entry.calls += 1;
      entry.tokens += row.total_tokens || 0;
      tokenMap.set(uid, entry);
    });
  });

  const lbMap = new Map(); (lb.data || []).forEach((r) => lbMap.set(r.user_id, r));
  mergeAvatars(lbMap, await loadStorageAvatars(c));
  const subMap = new Map(); (subs.data || []).forEach((r) => subMap.set(r.user_id, r));

  let users = (stats.data || []).map((s) => {
    const l = lbMap.get(s.user_id) || {};
    const sub = subMap.get(s.user_id) || { plan: 'free', status: 'active' };
    const tier = tierFor(s.total_score || 0);
    const usage = tokenMap.get(s.user_id) || { tokens: 0, calls: 0 };
    return {
      userId: s.user_id,
      displayName: l.display_name || (s.preferences && s.preferences.displayName) || 'Player',
      avatarColor: l.avatar_color || '#7c3aed',
      avatarEmoji: l.avatar_emoji,
      avatarUrl: l.avatar_url,
      highScore: s.high_score || 0,
      totalScore: s.total_score || 0,
      totalGames: s.total_games || 0,
      perfectRounds: s.perfect_rounds || 0,
      tier: tier.key, tierName: tier.name, tierEmoji: tier.emoji,
      plan: sub.plan || 'free',
      tokens: usage.tokens,
      calls: usage.calls,
      updatedAt: s.updated_at,
    };
  });

  if (search) {
    users = users.filter((u) =>
      u.displayName.toLowerCase().includes(search) ||
      String(u.userId).toLowerCase().includes(search),
    );
  }
  if (planFilter !== 'all') users = users.filter((u) => u.plan === planFilter);

  const sorters = {
    recent: (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
    score: (a, b) => b.totalScore - a.totalScore,
    high: (a, b) => b.highScore - a.highScore,
    tokens: (a, b) => b.tokens - a.tokens,
    games: (a, b) => b.totalGames - a.totalGames,
    tier: (a, b) => tierFor(b.totalScore).rank - tierFor(a.totalScore).rank,
  };
  users.sort(sorters[sort] || sorters.recent);

  res.json({ ok: true, total: users.length, users });
});

router.get('/api/admin/users/:userId', async (req, res) => {
  const c = sb();
  if (!c) return res.json({ ok: false, error: 'no-supabase' });
  const userId = String(req.params.userId);

  // Pull a wide window of recent logs so we can attribute agent calls (which
  // don't include meta.userId) to the user via temporal correlation — same
  // rule used by the Activity tab.
  const [stat, lb, sub, learn, battles, usage, allLogs] = await Promise.all([
    c.from('user_stats').select('*').eq('user_id', userId).maybeSingle(),
    c.from('wq_user_leaderboard').select('*').eq('user_id', userId).maybeSingle(),
    c.from('wq_subscriptions').select('*').eq('user_id', userId).maybeSingle(),
    c.from('wq_learn_progress').select('*').eq('user_id', userId).maybeSingle(),
    c.from('wq_battles').select('*').or(`player1_id.eq.${userId},player2_id.eq.${userId}`).order('created_at', { ascending: false }).limit(20),
    c.from('wq_daily_usage').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(14),
    c.from('agent_logs').select('*').order('created_at', { ascending: false }).limit(2000),
  ]);

  const s = stat.data || {};
  const l = lb.data || {};
  const subData = sub.data || { plan: 'free', status: 'active' };
  const prefs = s.preferences || {};
  const tier = tierFor(s.total_score || 0);

  // Temporal attribution + strict userId filter.
  // 1) Build a sorted ascending list of every row attributed to a user via
  //    explicit meta.userId / response markers.
  // 2) For agent rows without explicit attribution, fall back to the nearest
  //    preceding attributed event within a 90-second window.
  // 3) Keep only rows whose final attributed userId === this user.
  const ATTRIB_WINDOW_MS = 90_000;
  const raw = allLogs.data || [];
  const rowsAsc = [...raw].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const lastUidByTime = [];
  rowsAsc.forEach((r) => {
    const uids = extractUserIds(r);
    if (uids.length) lastUidByTime.push({ t: new Date(r.created_at).getTime(), uid: uids[0] });
  });
  function attribute(row) {
    const own = extractUserIds(row);
    if (own.length) return own[0];
    const t = new Date(row.created_at).getTime();
    for (let i = lastUidByTime.length - 1; i >= 0; i--) {
      const e = lastUidByTime[i];
      if (e.t > t) continue;
      if (t - e.t > ATTRIB_WINDOW_MS) break;
      return e.uid;
    }
    return null;
  }
  const eventRows = raw.filter((r) => attribute(r) === userId);

  const tokensByAgent = {};
  let totalTokens = 0, promptTokens = 0, completionTokens = 0, callCount = 0;
  eventRows.forEach((e) => {
    if (!String(e.agent || '').startsWith('event:')) {
      callCount += 1;
      totalTokens += e.total_tokens || 0;
      promptTokens += e.prompt_tokens || 0;
      completionTokens += e.completion_tokens || 0;
      const agent = e.agent || 'unknown';
      const k = tokensByAgent[agent] = tokensByAgent[agent] || { calls: 0, tokens: 0 };
      k.calls += 1;
      k.tokens += e.total_tokens || 0;
    }
  });
  const tokenAgents = Object.entries(tokensByAgent)
    .map(([agent, v]) => ({ agent, calls: v.calls, tokens: v.tokens }))
    .sort((a, b) => b.tokens - a.tokens);

  const events = eventRows.slice(0, 120).map((e) => ({
    id: e.trace_id || String(e.id),
    agent: e.agent, status: e.status,
    prompt: e.prompt, response: e.response, meta: e.meta,
    model: e.model, durationMs: e.duration_ms,
    promptTokens: e.prompt_tokens || 0,
    completionTokens: e.completion_tokens || 0,
    tokens: e.total_tokens || 0,
    createdAt: e.created_at,
    isAgent: !String(e.agent || '').startsWith('event:'),
  }));

  res.json({
    ok: true,
    user: {
      userId,
      displayName: l.display_name || prefs.displayName || 'Player',
      avatarColor: l.avatar_color || prefs.avatarColor || '#7c3aed',
      avatarEmoji: l.avatar_emoji || prefs.avatarEmoji,
      avatarUrl: l.avatar_url || prefs.avatarUrl,
      tier: tier.key, tierName: tier.name, tierEmoji: tier.emoji,
      stats: {
        highScore: s.high_score || 0,
        totalScore: s.total_score || 0,
        bestStreak: s.best_streak || 0,
        totalGames: s.total_games || 0,
        totalRounds: s.total_rounds || 0,
        totalWords: s.total_words || 0,
        totalTime: s.total_time || 0,
        perfectRounds: s.perfect_rounds || 0,
        hintsUsed: s.hints_used || 0,
        maxUnlockedLevel: s.max_unlocked_level || 1,
        categoryStats: s.category_stats || {},
        practiceHighScore: prefs.practiceHighScore || 0,
        practiceRoundsPlayed: prefs.practiceRoundsPlayed || 0,
        practiceRoundsWon: prefs.practiceRoundsWon || 0,
        practiceCurrentDifficulty: prefs.practiceCurrentDifficulty || 'easy',
        dob: prefs.dob || null,
        language: prefs.language || 'english',
      },
      tokens: { total: totalTokens, prompt: promptTokens, completion: completionTokens, calls: callCount, byAgent: tokenAgents },
      plan: {
        plan: subData.plan, status: subData.status,
        cycle: subData.cycle, expiresAt: subData.expires_at,
        trialUsed: subData.trial_used,
      },
      learn: learn.data || null,
      battles: battles.data || [],
      usage: usage.data || [],
      events,
      updatedAt: s.updated_at,
    },
  });
});

router.get('/api/admin/plans', async (_req, res) => {
  const c = sb();
  if (!c) return res.json({ ok: false, error: 'no-supabase' });
  const [stats, subs, lb] = await Promise.all([
    c.from('user_stats').select('user_id'),
    c.from('wq_subscriptions').select('*'),
    c.from('wq_user_leaderboard').select('user_id, display_name, avatar_color, avatar_emoji, avatar_url'),
  ]);
  const subMap = new Map(); (subs.data || []).forEach((s) => subMap.set(s.user_id, s));
  const lbMap = new Map(); (lb.data || []).forEach((r) => lbMap.set(r.user_id, r));
  mergeAvatars(lbMap, await loadStorageAvatars(c));
  const distribution = { free: 0, pro: 0, pro_max: 0 };
  (stats.data || []).forEach((u) => {
    const plan = (subMap.get(u.user_id) || {}).plan || 'free';
    if (distribution[plan] != null) distribution[plan]++;
    else distribution.free++;
  });
  // Enrich each recent paid activation with the user's display name +
  // avatar so the Plans table can show a real name instead of a truncated ID.
  const recent = (subs.data || [])
    .filter((s) => s.plan !== 'free')
    .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
    .slice(0, 20)
    .map((s) => {
      const profile = lbMap.get(s.user_id);
      return {
        ...s,
        displayName: profile ? profile.display_name : null,
        avatarColor: profile ? profile.avatar_color : null,
        avatarEmoji: profile ? profile.avatar_emoji : null,
        avatarUrl: profile ? profile.avatar_url : null,
      };
    });
  res.json({
    ok: true,
    distribution,
    total: (stats.data || []).length,
    recent,
    coupons: [
      { code: 'HUZIQUEST', plan: 'pro',     days: 7, active: true },
      { code: 'HUZIBUILD', plan: 'pro_max', days: 7, active: true },
    ],
  });
});

// PIPELINES — group recent agent calls into per-user "sessions" so judges
// can see the full chain: difficultyAgent → levelGenerator → referee →
// reward → coach → chaalbaaz. A session = consecutive calls for one user
// with no >120-second gap between them.
router.get('/api/admin/pipelines', async (req, res) => {
  try {
  const c = sb(); if (!c) return res.status(503).json({ ok: false, error: 'db down' });
  // Slim select — no prompt/response columns (they can be MB-sized JSON
  // blobs that push us past Vercel's 10s function timeout). Pipelines
  // only need metadata; deep detail is fetched on-demand by the row click.
  const [logsRes, lbRes] = await Promise.all([
    c.from('agent_logs')
      .select('trace_id,agent,model,status,duration_ms,total_tokens,meta,created_at')
      .order('created_at', { ascending: false }).limit(2000),
    c.from('wq_user_leaderboard').select('user_id, display_name, avatar_color, avatar_emoji, avatar_url'),
  ]);
  if (logsRes.error) return res.status(500).json({ ok: false, error: logsRes.error.message });
  const lbMap = new Map();
  (lbRes.data || []).forEach((l) => lbMap.set(l.user_id, l));
  mergeAvatars(lbMap, await loadStorageAvatars(c));

  const ATTRIB_WINDOW_MS = 90_000;
  const SESSION_GAP_MS = 120_000;
  const raw = logsRes.data || [];
  const rowsAsc = [...raw].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const lastUidByTime = [];
  rowsAsc.forEach((r) => {
    const meta = r.meta || {};
    const uids = [meta.userId, meta.uid].filter(Boolean);
    if (uids.length) lastUidByTime.push({ t: new Date(r.created_at).getTime(), uid: uids[0] });
  });
  function attribute(row) {
    const meta = row.meta || {};
    if (meta.userId) return meta.userId;
    if (meta.uid) return meta.uid;
    const t = new Date(row.created_at).getTime();
    for (let i = lastUidByTime.length - 1; i >= 0; i--) {
      const e = lastUidByTime[i];
      if (e.t > t) continue;
      if (t - e.t > ATTRIB_WINDOW_MS) break;
      return e.uid;
    }
    return null;
  }

  // Drop INTERNAL guardrail sub-calls (the per-field validations that
  // happen INSIDE another agent's flow). The pipeline must reflect the
  // real top-level execution path the kid would see in-game, not the
  // dozens of micro safety checks that fire under-the-hood for each
  // meaning/example/synonym/antonym field. KPI totals are unaffected.
  const surfaceRows = rowsAsc.filter((r) => !(r.meta && r.meta.internal === true));

  // ---- SECTION DERIVATION ----------------------------------------------
  // Each pipeline card represents ONE game-section session: Practice,
  // Pakistan Quest, Quick Play, 1v1 Battle, Continue Learning, AI Tutor,
  // or Home (word-of-day / general). The section is derived from the
  // agent / event name; calls that don't have a strong signal inherit
  // the most-recently-anchored section for the same user.
  // Sections that get their own pipeline card. Continue Learning is back
  // in by user request. AI Tutor (tutorAgent during Quick Play) still
  // inherits — it's a companion call, not a standalone section.
  const SECTION_LABELS = {
    practice: 'Practice',
    pakquest: 'Pakistan Quest',
    'quick-play': 'Quick Play',
    battle: '1v1 Battle',
    learn: 'Continue Learning',
    home: 'Home',
  };
  function sectionAnchor(agent) {
    if (!agent) return null;
    const a = String(agent);
    if (a.startsWith('event:battle')) return 'battle';
    if (a === 'event:practice') return 'practice';
    if (a === 'event:quick-play' || a === 'event:quick-play-fail') return 'quick-play';
    if (a === 'pakistanQuestAgent' || a === 'pakistanTutorAgent') return 'pakquest';
    if (a === 'lessonAgent' || a === 'event:learn-lesson' || a === 'event:learn-unit') return 'learn';
    if (a === 'wordOfDayAgent') return 'home';
    // tutorAgent is NOT an anchor — rides whichever
    // section the user is currently in.
    return null;
  }

  // Each section VISIT is its own pipeline. We walk rows chronologically
  // per user and close + reopen a pipeline whenever:
  //   - the player enters a different section (anchor changes), OR
  //   - the player goes idle for > SESSION_GAP_MS within the same section.
  // Result: Practice → Home → Practice produces THREE pipelines, not one
  // mega-Practice card that absorbs the re-entry.
  const pipelines = [];
  const userState = new Map();
  for (const r of surfaceRows) {
    const uid = attribute(r);
    if (!uid) continue;
    const t = new Date(r.created_at).getTime();
    const anchored = sectionAnchor(r.agent);

    let state = userState.get(uid);
    let needNew = false;
    let nextSection;

    if (!state) {
      nextSection = anchored || 'home';
      needNew = true;
    } else if (t - state.lastT > SESSION_GAP_MS) {
      // Long idle — close prior pipeline regardless of section.
      nextSection = anchored || state.section;
      needNew = true;
    } else if (anchored && anchored !== state.section) {
      // Section changed mid-stream — close prior, start fresh.
      nextSection = anchored;
      needNew = true;
    } else {
      nextSection = state.section;
    }

    if (needNew) {
      const pipeline = { uid, section: nextSection, startT: t, lastT: t, steps: [] };
      pipelines.push(pipeline);
      state = { section: nextSection, pipeline, lastT: t };
      userState.set(uid, state);
    } else {
      state.pipeline.lastT = t;
      state.lastT = t;
    }

    const meta = r.meta || {};
    const fallback = !!meta.fallback || r.status === 'fallback';
    state.pipeline.steps.push({
      id: r.trace_id || String(r.id),
      agent: r.agent,
      status: r.status,
      durationMs: r.duration_ms || 0,
      tokens: r.total_tokens || 0,
      tool: meta.tool || (r.model ? ('OpenAI · ' + r.model) : 'Local logic'),
      reason: meta.reason || null,
      decision: meta.decision || null,
      confidence: meta.confidence != null ? meta.confidence : null,
      fallback,
      createdAt: r.created_at,
      isAgent: !String(r.agent || '').startsWith('event:'),
    });
  }
  pipelines.sort((a, b) => b.lastT - a.lastT);
  const top = pipelines.slice(0, 80).map((p) => {
    const profile = lbMap.get(p.uid);
    return {
      userId: p.uid,
      userName: profile ? profile.display_name : null,
      userColor: profile ? profile.avatar_color : null,
      userEmoji: profile ? profile.avatar_emoji : null,
      userAvatarUrl: profile ? profile.avatar_url : null,
      section: p.section,
      sectionLabel: SECTION_LABELS[p.section] || 'Session',
      startedAt: new Date(p.startT).toISOString(),
      endedAt: new Date(p.lastT).toISOString(),
      durationSec: Math.round((p.lastT - p.startT) / 1000),
      stepCount: p.steps.length,
      agentCount: p.steps.filter((s) => s.isAgent).length,
      eventCount: p.steps.filter((s) => !s.isAgent).length,
      totalTokens: p.steps.reduce((a, s) => a + (s.tokens || 0), 0),
      anyFallback: p.steps.some((s) => s.fallback),
      anyError: p.steps.some((s) => s.status === 'error'),
      steps: p.steps,
    };
  });
  res.json({ ok: true, pipelines: top });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'pipelines failed' });
  }
});

router.get('/api/admin/traces', async (req, res) => {
  const c = sb();
  if (!c) return res.json({ ok: false, error: 'no-supabase' });
  const category = String(req.query.category || 'all');
  const status = String(req.query.status || 'all');
  const search = String(req.query.search || '').trim();
  const userSearch = String(req.query.user || '').trim().toLowerCase();
  const limit = Math.min(500, Number(req.query.limit) || 200);

  const [logsRes, lbRes] = await Promise.all([
    (() => {
      let q = c.from('agent_logs').select('*').order('created_at', { ascending: false }).limit(limit);
      if (status !== 'all') q = q.eq('status', status);
      return q;
    })(),
    c.from('wq_user_leaderboard').select('user_id, display_name, avatar_color, avatar_emoji, avatar_url'),
  ]);
  if (logsRes.error) return res.json({ ok: false, error: logsRes.error.message });
  const lbMap = new Map(); (lbRes.data || []).forEach((r) => lbMap.set(r.user_id, r));
  mergeAvatars(lbMap, await loadStorageAvatars(c));

  // Temporal attribution (same idea as overview) — agent calls without
  // meta.userId inherit the nearest preceding user-attributed event within
  // a 90-second window. Build the lookup in ascending order.
  const ATTRIB_WINDOW_MS = 90_000;
  const raw = logsRes.data || [];
  const rowsAsc = [...raw].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const lastUidByTime = [];
  rowsAsc.forEach((r) => {
    const uids = extractUserIds(r);
    if (uids.length) lastUidByTime.push({ t: new Date(r.created_at).getTime(), uid: uids[0] });
  });
  function attribute(row) {
    const own = extractUserIds(row);
    if (own.length) return own[0];
    const t = new Date(row.created_at).getTime();
    for (let i = lastUidByTime.length - 1; i >= 0; i--) {
      const e = lastUidByTime[i];
      if (e.t > t) continue;
      if (t - e.t > ATTRIB_WINDOW_MS) break;
      return e.uid;
    }
    return null;
  }

  let rows = raw.map((e) => {
    const uid = attribute(e);
    const profile = uid ? lbMap.get(uid) : null;
    const meta = e.meta || {};
    return {
      id: e.trace_id || String(e.id), agent: e.agent, status: e.status,
      prompt: e.prompt, response: e.response, meta,
      model: e.model, durationMs: e.duration_ms,
      promptTokens: e.prompt_tokens || 0,
      completionTokens: e.completion_tokens || 0,
      tokens: e.total_tokens || 0,
      createdAt: e.created_at,
      // NEW: tooling / reason / fallback fields used by the monitoring UI.
      tool: meta.tool || (e.model ? ('OpenAI · ' + e.model) : 'Local logic'),
      reason: meta.reason || null,
      decision: meta.decision || null,
      confidence: meta.confidence != null ? meta.confidence : null,
      fallback: !!meta.fallback || e.status === 'fallback',
      userId: uid,
      userName: profile ? profile.display_name : null,
      userColor: profile ? profile.avatar_color : null,
      userEmoji: profile ? profile.avatar_emoji : null,
      userAvatarUrl: profile ? profile.avatar_url : null,
      isAgent: !String(e.agent || '').startsWith('event:'),
    };
  });

  if (category !== 'all') {
    if (category === 'agent') rows = rows.filter((r) => r.isAgent);
    else rows = rows.filter((r) => r.agent === 'event:' + category);
  }
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter((r) =>
      String(r.prompt || '').toLowerCase().includes(s) ||
      String(r.response || '').toLowerCase().includes(s) ||
      String(r.agent || '').toLowerCase().includes(s),
    );
  }
  if (userSearch) {
    rows = rows.filter((r) =>
      (r.userName && r.userName.toLowerCase().includes(userSearch)) ||
      (r.userId && r.userId.toLowerCase().includes(userSearch)),
    );
  }
  res.json({ ok: true, total: rows.length, rows });
});

// =============================================================
// HTML SPA
// =============================================================

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WordQuest Admin</title>
<style>
/* === WordQuest Admin — Premium Light Theme ==================== */
:root {
  --bg: #f5f7fa;
  --surface: #ffffff;
  --surface-2: #ffffff;
  --surface-3: #f9fafb;
  --surface-hover: #f9fafb;
  --border: #e8ecf0;
  --border-strong: #d1d5db;
  --table-border: #e5e7eb;
  --table-header: #f3f4f6;
  --text: #111827;
  --text-soft: #374151;
  --text-muted: #6b7280;
  --text-faint: #9ca3af;
  --accent: #f97316;
  --accent-strong: #ea580c;
  --accent-deep: #c2410c;
  --accent-tint: #fff7ed;
  --blue: #3b82f6;
  --blue-tint: #dbeafe;
  --green: #22c55e;
  --green-tint: #dcfce7;
  --red: #ef4444;
  --red-tint: #fee2e2;
  --warning: #f59e0b;
  --warning-tint: #fef3c7;
  --purple: #6366f1;
  --purple-tint: #eef2ff;
  --shadow: 0 2px 8px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 14px rgba(0,0,0,0.08);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg); color: var(--text);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
.container { max-width: 1280px; margin: 0 auto; padding: 24px; }

.topbar {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 22px;
  display: flex; align-items: center; gap: 16px;
  margin-bottom: 22px;
  box-shadow: var(--shadow);
}
.brand-logo {
  width: 38px; height: 38px; border-radius: 10px;
  background: linear-gradient(135deg, var(--accent), #fb923c);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  box-shadow: 0 4px 12px rgba(249,115,22,0.35);
}
.brand-name { font-size: 18px; font-weight: 700; letter-spacing: 0.2px; color: var(--text); }
.brand-sub { font-size: 9px; color: var(--accent); font-weight: 700; letter-spacing: 2px; }
.tabs { display: flex; gap: 4px; margin-left: 30px; flex: 1; flex-wrap: wrap; }
.tab {
  padding: 8px 16px; border-radius: 999px; cursor: pointer;
  color: var(--text-muted); font-weight: 600; font-size: 13px;
  transition: all 0.15s; border: 1px solid transparent;
  position: relative;
}
.tab:hover { background: var(--accent-tint); color: var(--accent); }
.tab.active {
  background: var(--accent-tint);
  color: var(--accent);
  border-color: rgba(249,115,22,0.2);
}

.page-title { font-size: 26px; font-weight: 700; margin-bottom: 4px; color: var(--text); }
.page-sub { font-size: 13px; color: var(--text-muted); margin-bottom: 22px; }

.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 16px; }
.kpi {
  background: var(--surface); border: 1px solid var(--border);
  border-left: 4px solid var(--blue);
  border-radius: 12px; padding: 18px;
  box-shadow: var(--shadow);
  transition: transform 0.15s, box-shadow 0.15s;
}
.kpi:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
.kpi-label { font-size: 10px; font-weight: 700; color: var(--text-muted); letter-spacing: 1.5px; margin-bottom: 8px; }
.kpi-value { font-size: 30px; font-weight: 700; color: var(--text); }
.kpi-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.kpi.accent {
  background: var(--accent-tint);
  border-color: rgba(249,115,22,0.25);
  border-left-color: var(--accent);
}
.kpi.accent .kpi-value { color: var(--accent-strong); }
.kpi.accent .kpi-label { color: var(--accent-strong); }
.kpi.green { border-left-color: var(--green); }
.kpi.red { border-left-color: var(--red); }
.kpi.warning { border-left-color: var(--warning); }
.kpi.purple { border-left-color: var(--purple); }

.grid-two { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; margin-bottom: 16px; }
.grid-three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 16px; }

.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 20px;
  box-shadow: var(--shadow);
}
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.card-title { font-size: 16px; font-weight: 700; color: var(--text); }
.card-meta { font-size: 11px; color: var(--text-muted); font-weight: 500; }

.toolbar {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px; display: flex; gap: 10px; align-items: center;
  margin-bottom: 14px;
  box-shadow: var(--shadow);
}
.toolbar input, .toolbar select {
  border: 1px solid var(--border); background: var(--surface);
  padding: 9px 12px; border-radius: 8px; font-size: 13px;
  font-family: inherit; color: var(--text);
  outline: none; transition: border-color 0.15s, box-shadow 0.15s;
}
.toolbar input::placeholder { color: var(--text-faint); }
.toolbar input { flex: 1; }
.toolbar input:focus, .toolbar select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(249,115,22,0.12);
}
.toolbar button {
  background: var(--accent); color: #fff; border: 0;
  padding: 10px 18px; border-radius: 8px; font-weight: 600; font-size: 13px;
  cursor: pointer; transition: background 0.15s;
}
.toolbar button:hover { background: var(--accent-strong); }

.activity { display: flex; flex-direction: column; gap: 4px; max-height: 480px; overflow-y: auto; }
.activity-item {
  display: flex; align-items: center; gap: 10px; padding: 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
  position: relative;
}
.activity-item::before {
  content: ''; position: absolute; left: 0; top: 12px; bottom: 12px;
  width: 3px; border-radius: 3px;
  background: var(--blue);
}
.activity-item.fail::before { background: var(--red); }
.activity-item.win::before { background: var(--green); }
.activity-item.warn::before { background: var(--warning); }
.activity-item.agent::before { background: var(--purple); }
.activity-item:hover { background: var(--surface-hover); border-color: var(--border); }
.activity-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #fff;
  margin-left: 6px;
  overflow: hidden;
}
.activity-text { flex: 1; font-size: 13px; min-width: 0; color: var(--text); }
.activity-text b { font-weight: 700; color: var(--text); }
.activity-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.activity-tokens {
  font-size: 11px; font-weight: 700; color: var(--accent);
  padding: 3px 9px;
  background: var(--accent-tint);
  border: 1px solid rgba(249,115,22,0.25);
  border-radius: 6px;
  white-space: nowrap;
}

.tag {
  display: inline-block; padding: 3px 10px; border-radius: 999px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.4px;
}
.tag-free { background: #f3f4f6; color: var(--text-muted); border: 1px solid #e5e7eb; }
.tag-pro { background: var(--purple-tint); color: var(--purple); border: 1px solid rgba(99,102,241,0.25); }
.tag-pro_max {
  background: var(--accent-tint); color: var(--accent-strong);
  border: 1px solid rgba(249,115,22,0.3);
}
.tag-ok { background: var(--green-tint); color: #16a34a; border: 1px solid rgba(34,197,94,0.3); }
.tag-error { background: var(--red-tint); color: #dc2626; border: 1px solid rgba(239,68,68,0.3); }
.tag-info { background: var(--blue-tint); color: #2563eb; border: 1px solid rgba(59,130,246,0.3); }

.donut-wrap { display: flex; align-items: center; gap: 22px; }
.donut-center {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  text-align: center; pointer-events: none;
}
.donut-num { font-size: 22px; font-weight: 800; color: var(--text); }
.donut-label-mini { font-size: 9px; color: var(--text-muted); letter-spacing: 1.5px; font-weight: 700; }
.donut-legend { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.donut-row {
  display: flex; justify-content: space-between; font-size: 13px;
  align-items: center; color: var(--text-soft);
}
.donut-row b { color: var(--text); }
.donut-row .dot { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 8px; vertical-align: middle; }

.table { width: 100%; border-collapse: separate; border-spacing: 0; }
.table th {
  text-align: left; padding: 12px; font-size: 10px; font-weight: 700;
  color: var(--text-muted); letter-spacing: 1px; text-transform: uppercase;
  border-bottom: 1px solid var(--table-border);
  background: var(--table-header);
}
.table td {
  padding: 14px 12px; font-size: 13px;
  border-bottom: 1px solid var(--table-border);
  color: var(--text-soft);
}
.table tr:hover td { background: var(--surface-hover); }
.table tr:last-child td { border-bottom: 0; }
.table b { color: var(--text); }

.user-row { display: flex; align-items: center; gap: 10px; }
.user-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: #fff;
  overflow: hidden;
}
.user-name { font-weight: 600; font-size: 13px; color: var(--text); }
.user-id { font-size: 10px; color: var(--text-muted); font-family: monospace; }
.view-btn {
  padding: 7px 14px; border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 12px; font-weight: 600; cursor: pointer;
  color: var(--text); transition: all 0.15s;
}
.view-btn:hover {
  background: var(--accent); border-color: var(--accent); color: #fff;
}

.tier-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700;
  border: 1px solid;
}
.tier-bronze   { background: #fef3c7; color: #92400e; border-color: #fbbf24; }
.tier-silver   { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }
.tier-gold     { background: #fef9c3; color: #854d0e; border-color: #facc15; }
.tier-platinum { background: #ccfbf1; color: #115e59; border-color: #5eead4; }
.tier-diamond  { background: #dbeafe; color: #1e40af; border-color: #93c5fd; }
.tier-elite    { background: #ede9fe; color: #5b21b6; border-color: #c4b5fd; }
.tier-master   { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }

.tokens-cell { font-weight: 700; color: var(--accent); }

.back-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
  margin-bottom: 16px; color: var(--text);
  transition: all 0.15s;
  box-shadow: var(--shadow);
}
.back-btn:hover {
  background: var(--accent-tint); border-color: var(--accent); color: var(--accent);
}

.hero {
  background: var(--surface);
  border-radius: 14px; padding: 22px; color: var(--text);
  display: flex; align-items: center; gap: 18px; margin-bottom: 18px;
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent);
  box-shadow: var(--shadow);
}
.hero-avatar {
  width: 72px; height: 72px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 800; color: #fff;
  box-shadow: 0 4px 14px rgba(249,115,22,0.35);
  overflow: hidden;
}
.hero-name { font-size: 24px; font-weight: 700; color: var(--text); }
.hero-meta { font-size: 11px; color: var(--text-muted); margin-top: 4px; font-family: monospace; }
.hero-chips { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }

.bar {
  height: 8px; background: #f1f5f9;
  border-radius: 999px; overflow: hidden; margin-top: 6px;
  border: 1px solid var(--border);
}
.bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--green)); }

.event-list { display: flex; flex-direction: column; gap: 8px; max-height: 600px; overflow-y: auto; }
.event-row {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 12px; font-size: 12px;
  color: var(--text-soft);
}
.event-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
.event-cat {
  display: inline-block; padding: 3px 9px; border-radius: 6px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
}
.event-meta { font-size: 10px; color: var(--text-muted); }
.event-payload {
  margin-top: 6px; background: var(--surface-hover);
  padding: 10px 12px; border-radius: 6px;
  font-family: 'SF Mono', 'Cascadia Code', 'Courier New', monospace;
  font-size: 11px; color: var(--text-soft);
  white-space: pre-wrap; word-break: break-word; max-height: 140px; overflow-y: auto;
  border: 1px solid var(--border);
}

.empty { padding: 40px; text-align: center; color: var(--text-muted); font-size: 13px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); font-size: 13px; }

/* LinkedIn-style date-range dropdown that controls the whole Overview page */
.ov-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 4px;
}
.ov-head .page-title { margin: 0; }
.ov-range-wrap { display: flex; align-items: center; gap: 8px; }
.ov-range-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.4px;
  color: var(--text-muted); text-transform: uppercase;
}
.ov-range {
  appearance: none; -webkit-appearance: none;
  background: #fff url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path fill='%2364748b' d='M6 8L0 0h12z'/></svg>") no-repeat right 10px center;
  border: 1px solid var(--border); border-radius: 999px;
  padding: 7px 32px 7px 14px;
  font-family: inherit; font-size: 12px; font-weight: 700;
  color: var(--text); cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  min-width: 150px;
}
.ov-range:hover { border-color: var(--accent); }
.ov-range:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.18); }

/* Clickable KPI card variant for Plans page */
.kpi.clickable { cursor: pointer; position: relative; }
.kpi.clickable:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md), 0 0 0 2px rgba(249,115,22,0.15);
}
.kpi-arrow {
  position: absolute; top: 14px; right: 16px;
  font-size: 18px; color: var(--text-faint);
  transition: transform 0.2s, color 0.2s;
}
.kpi.clickable:hover .kpi-arrow {
  color: var(--accent); transform: translateX(3px);
}

/* Activity / Traces — advanced row design */
.trace-list { display: flex; flex-direction: column; gap: 8px; }
.trace-row {
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s;
  cursor: pointer;
}
.trace-row:hover { border-color: var(--border-strong); box-shadow: var(--shadow); }
.trace-row.open { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.1); }
.trace-summary {
  display: flex; align-items: center; gap: 12px; padding: 14px;
}
.trace-avatar {
  width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 700; color: #fff;
  overflow: hidden;
  transition: box-shadow 0.18s, transform 0.18s;
}
.trace-avatar.clickable { cursor: pointer; }
.trace-avatar.clickable:hover {
  box-shadow: 0 0 0 3px rgba(249,115,22,0.35), 0 4px 10px rgba(249,115,22,0.25);
  transform: scale(1.05);
}
.trace-name.clickable { cursor: pointer; transition: color 0.15s; }
.trace-name.clickable:hover { color: var(--accent-strong); text-decoration: underline; }
.trace-id-col { flex: 1; min-width: 0; }
.trace-name { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.trace-name.muted { color: var(--text-muted); font-weight: 500; }
.trace-cat { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.trace-right {
  display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
  justify-content: flex-end; flex-shrink: 0;
}
.trace-meta-pill {
  display: inline-block; padding: 4px 10px; border-radius: 6px;
  font-size: 11px; font-weight: 600;
  background: #f3f4f6;
  border: 1px solid var(--border);
  color: var(--text-muted);
  white-space: nowrap;
}
.trace-meta-pill.tok {
  background: var(--accent-tint);
  border-color: rgba(249,115,22,0.25);
  color: var(--accent-strong);
}
.trace-meta-pill.lat {
  background: var(--blue-tint);
  border-color: rgba(59,130,246,0.25);
  color: #2563eb;
}
.trace-meta-pill.model {
  background: var(--purple-tint);
  border-color: rgba(99,102,241,0.25);
  color: var(--purple);
  font-family: monospace;
}
.trace-meta-pill.tool {
  background: #ecfdf5;
  border-color: rgba(16,185,129,0.30);
  color: #047857;
}
.trace-meta-pill.fallback {
  background: #fef2f2;
  border-color: rgba(220,38,38,0.35);
  color: #b91c1c;
  font-weight: 800;
  letter-spacing: 0.6px;
}
.trace-reason {
  margin-top: 4px;
  font-size: 11px;
  color: #6b7280;
  font-style: italic;
  line-height: 1.4;
}
.tag-warn {
  background: #fffbeb;
  border: 1px solid rgba(217,119,6,0.4);
  color: #b45309;
}
.reason-block {
  background: #fffbeb !important;
  border-color: rgba(217,119,6,0.30) !important;
  color: #78350f !important;
  font-style: italic;
  font-family: 'SF Mono', 'Cascadia Code', Consolas, monospace;
  text-align: left;
}

/* PIPELINES — chain-of-agents view */
.pipeline-list { display: flex; flex-direction: column; gap: 14px; }
.pipeline-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--shadow);
}
.pipeline-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--border);
}
.pipeline-user { font-weight: 800; font-size: 14px; color: var(--text); }
.pipeline-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.pipeline-flow {
  display: flex; align-items: stretch; gap: 6px;
  overflow-x: auto; padding: 6px 2px 14px;
}
.pipeline-step {
  flex: 0 0 auto;
  min-width: 200px; max-width: 230px;
  background: #fafafa;
  border: 2px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  position: relative;
  transition: transform 0.15s, box-shadow 0.15s;
}
.pipeline-step:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
.pipeline-step.ok  { border-color: rgba(16,185,129,0.45); background: #ecfdf5; }
.pipeline-step.fb  { border-color: rgba(217,119,6,0.55);  background: #fffbeb; }
.pipeline-step.err { border-color: rgba(220,38,38,0.55);  background: #fef2f2; }
.ps-num {
  position: absolute; top: -10px; left: -10px;
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--accent); color: #fff;
  font-weight: 900; font-size: 11px;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid #fff;
  box-shadow: var(--shadow);
}
.ps-name { font-weight: 800; font-size: 13px; color: var(--text); margin-bottom: 4px; word-break: break-word; }
.ps-tool { font-size: 10px; color: #047857; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.3px; }
.ps-meta { font-size: 10px; color: var(--text-muted); font-family: monospace; }
.ps-fb {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 6px;
  font-size: 9px; font-weight: 900; letter-spacing: 0.7px;
  background: #b91c1c; color: #fff;
  border-radius: 4px;
}
.ps-reason {
  margin-top: 6px;
  font-size: 10px; line-height: 1.4;
  color: #6b7280;
  font-style: italic;
  border-top: 1px dashed rgba(0,0,0,0.08);
  padding-top: 6px;
}
.pipeline-arrow {
  flex: 0 0 auto;
  font-size: 22px; font-weight: 900;
  color: var(--accent);
  align-self: center;
  padding: 0 2px;
}
.trace-chevron {
  width: 26px; height: 26px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  background: #f3f4f6; border: 1px solid var(--border);
  color: var(--text-muted); font-size: 11px; font-weight: 700;
  transition: transform 0.25s ease, background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.trace-row.open .trace-chevron {
  background: var(--accent); color: #fff; border-color: var(--accent);
}

.trace-detail-inner {
  padding: 18px; background: var(--surface-hover);
  border-top: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 16px;
}
.block-section { display: flex; flex-direction: column; gap: 8px; }
.block-label {
  font-size: 10px; font-weight: 700; letter-spacing: 1.4px;
  color: var(--text-muted); text-transform: uppercase;
}
.block {
  background: var(--surface);
  color: var(--text);
  border-radius: 8px; padding: 14px;
  font-family: 'SF Mono', 'Cascadia Code', 'Courier New', Consolas, monospace;
  font-size: 12px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-word;
  max-height: 360px; overflow-y: auto;
  border: 1px solid var(--border);
  text-align: left;
}
.block-empty {
  background: var(--surface);
  padding: 12px 14px; border-radius: 8px;
  color: var(--text-muted); font-style: italic; font-size: 12px;
  border: 1px dashed var(--border);
  text-align: left;
}
.meta-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
}
.meta-cell {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px; padding: 10px 12px;
}
.meta-cell-label {
  font-size: 9px; font-weight: 700; color: var(--text-muted);
  letter-spacing: 1px; margin-bottom: 4px;
}
.meta-cell-value {
  font-size: 13px; font-weight: 600; color: var(--text);
  font-family: monospace;
  word-break: break-word;
}

/* Scrollbar */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 6px; }
::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
@media (max-width: 700px) {
  .trace-right { display: none; }
  .meta-grid { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 900px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .grid-two, .grid-three { grid-template-columns: 1fr; }
  .topbar { flex-direction: column; align-items: flex-start; gap: 8px; }
  .tabs { margin-left: 0; }
}
</style>
</head>
<body>

<div class="container">
  <div class="topbar">
    <div class="brand-logo">⚡</div>
    <div>
      <div class="brand-name">WordQuest</div>
      <div class="brand-sub">ADMIN PANEL</div>
    </div>
    <div class="tabs">
      <div class="tab active" data-route="overview">🏠 Overview</div>
      <div class="tab" data-route="users">👥 Users</div>
      <div class="tab" data-route="pipelines">🔗 Pipelines</div>
      <div class="tab" data-route="traces">📡 Activity</div>
      <div class="tab" data-route="plans">💎 Plans</div>
    </div>
  </div>

  <div id="main"></div>
</div>

<script>
const PLAN_COLORS = { free: '#94a3b8', pro: '#0f172a', pro_max: '#ff7a1a' };
const CATEGORY_COLORS = {
  'agent': '#7c3aed', 'tier-up': '#f59e0b', 'quick-play': '#22c55e',
  'quick-play-fail': '#ef4444', 'practice': '#06b6d4', 'quiz-correct': '#10b981',
  'quiz-wrong': '#f43f5e', 'quiz-session': '#3b82f6', 'daily-word': '#facc15',
  'daily-result': '#eab308', 'battle-queue': '#fb7185', 'battle-result': '#ec4899',
  'subscription': '#a855f7', 'paywall-hit': '#c084fc', 'avatar-upload': '#14b8a6',
  'learn-lesson': '#06b6d4', 'learn-unit': '#0891b2', 'auth': '#475569',
  'level-complete': '#22c55e',
};

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d)) return '—';
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor(diff / 60000);
  if (days >= 1) return days + 'd ago';
  if (hrs >= 1) return hrs + 'h ago';
  if (mins >= 1) return mins + 'm ago';
  return 'just now';
};
const fmtDate = (iso) => {
  if (!iso) return 'Never';
  const d = new Date(iso); if (isNaN(d)) return '—';
  return d.toLocaleDateString();
};
const fmtNum = (n) => {
  if (n == null) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initial = (name) => String(name || '?').trim().charAt(0).toUpperCase();
const shortId = (id) => id ? String(id).slice(0, 8) : '';
const planLabel = (p) => p === 'pro_max' ? 'Pro Max' : (p[0].toUpperCase() + p.slice(1));

function donut(elId, slices) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const R = 56, C = 2 * Math.PI * R;
  let acc = 0;
  let svg = '<svg viewBox="0 0 140 140" style="width:140px;height:140px"><g transform="rotate(-90 70 70)">';
  svg += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="#f1ead9" stroke-width="18"/>';
  slices.forEach((s) => {
    const frac = s.value / total;
    const len = C * frac;
    svg += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + s.color + '" stroke-width="18" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-acc) + '"/>';
    acc += len;
  });
  svg += '</g></svg>';
  document.getElementById(elId).innerHTML = svg;
}

function kpi(label, value, opts) {
  opts = opts || {};
  const cls = (opts.accent ? 'accent' : (opts.color || '')) + (opts.clickable ? ' clickable' : '');
  const attrs = opts.clickable ? ' data-plan="' + esc(opts.clickable) + '"' : '';
  const arrow = opts.clickable ? '<div class="kpi-arrow">→</div>' : '';
  return '<div class="kpi ' + cls + '"' + attrs + '>' +
    arrow +
    '<div class="kpi-label">' + esc(label) + '</div>' +
    '<div class="kpi-value">' + esc(value) + '</div>' +
    (opts.sub ? '<div class="kpi-sub">' + esc(opts.sub) + '</div>' : '') +
    '</div>';
}

// Colored status badge for player events on the Overview feed.
// Reds for fail/wrong/loss, greens for success/wins, oranges for paywall/sub.
const FAIL_EVENTS  = new Set(['quick-play-fail', 'quiz-wrong', 'daily-result-failed']);
const WIN_EVENTS   = new Set(['quick-play', 'quiz-correct', 'tier-up', 'level-complete', 'daily-word', 'daily-result', 'learn-unit', 'learn-lesson', 'battle-result']);
const WARN_EVENTS  = new Set(['paywall-hit', 'subscription']);
function eventBadge(cat) {
  // Light-theme pill: tinted background + matching text + soft border.
  let bg = '#dbeafe', fg = '#2563eb', bd = 'rgba(59,130,246,0.3)';
  if (FAIL_EVENTS.has(cat)) { bg = '#fee2e2'; fg = '#dc2626'; bd = 'rgba(239,68,68,0.3)'; }
  else if (WIN_EVENTS.has(cat)) { bg = '#dcfce7'; fg = '#16a34a'; bd = 'rgba(34,197,94,0.3)'; }
  else if (WARN_EVENTS.has(cat)) { bg = '#fef3c7'; fg = '#b45309'; bd = 'rgba(245,158,11,0.3)'; }
  return '<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:0.4px;background:' + bg + ';color:' + fg + ';border:1px solid ' + bd + '">' + esc(cat) + '</span>';
}
function agentChip(agent) {
  return '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;background:#eef2ff;color:#6366f1;border:1px solid rgba(99,102,241,0.3)">' +
    '<span style="font-size:11px">🤖</span>' + esc(agent) + '</span>';
}

function avatarHTML(u, size) {
  size = size || 34;
  // BUGFIX: previously the whole inner value was passed through esc(),
  // which double-escaped the img tag (its angle bracket became &lt;) and
  // forced the dashboard to render the literal HTML source instead of
  // the photo. Now we keep the img tag as raw HTML (the src is still
  // escaped) and only escape the text fallback (emoji / initials).
  const bg = u.avatarColor || u.userColor || '#7c3aed';
  const wrapStyle = 'background:' + bg + ';width:' + size + 'px;height:' + size
    + 'px;font-size:' + Math.round(size * 0.42) + 'px;overflow:hidden';
  const inner = u.avatarUrl
    ? '<img src="' + esc(u.avatarUrl) + '" loading="lazy" referrerpolicy="no-referrer"'
      + ' style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>'
    : esc(u.avatarEmoji || initial(u.displayName));
  return '<div class="user-avatar" style="' + wrapStyle + '">' + inner + '</div>';
}

// =========================== ROUTER ===========================
const routes = { overview: renderOverview, users: renderUsers, traces: renderTraces, plans: renderPlans, pipelines: renderPipelines };
let currentRoute = 'overview';
function navigate(route, params) {
  currentRoute = route;
  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === route);
  });
  (routes[route] || renderOverview)(params);
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tab').forEach((el) => {
  el.addEventListener('click', () => navigate(el.dataset.route));
});

// =========================== OVERVIEW ===========================
// Single date-range filter that controls the entire Overview page.
// Default: 'today' on page load. Persisted across silent refreshes.
let overviewRange = 'today';
const OV_RANGE_LABELS = {
  'today': 'Today',
  '7d':    'Past 7 days',
  '30d':   'Past 30 days',
  '90d':   'Past 90 days',
  '1y':    'Past 1 year',
};
// Upper-case suffix shown inside every KPI card label — e.g.
// "ACTIVE TODAY" / "ACTIVE PAST 7 DAYS" / "ACTIVE PAST 1 YEAR".
const OV_RANGE_SUFFIX = {
  'today': 'TODAY',
  '7d':    'PAST 7 DAYS',
  '30d':   'PAST 30 DAYS',
  '90d':   'PAST 90 DAYS',
  '1y':    'PAST 1 YEAR',
};
// Sentence-case suffix for table / card titles ("Token breakdown today").
const OV_RANGE_TITLE_SUFFIX = {
  'today': 'today',
  '7d':    'past 7 days',
  '30d':   'past 30 days',
  '90d':   'past 90 days',
  '1y':    'past 1 year',
};
function overviewRangeOptionsHTML() {
  return Object.entries(OV_RANGE_LABELS).map(
    ([k, l]) => '<option value="' + k + '"' + (k === overviewRange ? ' selected' : '') + '>' + l + '</option>',
  ).join('');
}
async function renderOverview() {
  const main = document.getElementById('main');
  const headHTML =
    '<div class="ov-head">' +
      '<div>' +
        '<div class="page-title">Overview</div>' +
        '<div class="page-sub">Real-time snapshot of WordQuest activity · live updates every 10s</div>' +
      '</div>' +
      '<div class="ov-range-wrap">' +
        '<span class="ov-range-label">Range</span>' +
        '<select id="ov-range" class="ov-range">' + overviewRangeOptionsHTML() + '</select>' +
      '</div>' +
    '</div>';
  main.innerHTML = headHTML + '<div class="loading">Loading…</div>';
  document.getElementById('ov-range').addEventListener('change', (ev) => {
    overviewRange = ev.target.value;
    renderOverview();
  });
  try {
    const r = await fetch('/api/admin/overview?range=' + encodeURIComponent(overviewRange)).then((r) => r.json());
    if (!r.ok) { main.innerHTML = headHTML + '<div class="empty">' + esc(r.error) + '</div>'; bindRangeSelect(); return; }
    const t = r.totals; const plans = r.plans;
    const planTotal = plans.free + plans.pro + plans.pro_max || 1;

    let html = headHTML;

    // Range-scoped labels — every card EXCEPT "Total Users" appends the
    // current range so the header always tells you what window the number
    // covers (e.g. "ACTIVE PAST 7 DAYS"). Total Users is a lifetime stat.
    const SUFFIX = OV_RANGE_SUFFIX[overviewRange];
    const titleSuffix = OV_RANGE_TITLE_SUFFIX[overviewRange];
    html += '<div class="kpi-grid">';
    html += kpi('TOTAL USERS', t.users, { color: 'blue' });
    html += kpi('ACTIVE ' + SUFFIX, t.activeToday, { color: 'green' });
    html += kpi('TOKENS ' + SUFFIX, fmtNum(t.totalTokens), { accent: true, sub: 'gpt-4o-mini · OpenAI' });
    html += kpi('AGENT CALLS ' + SUFFIX, t.agentCalls, { color: 'purple', sub: 'avg latency ' + t.avgLatency + 'ms' });
    html += '</div>';

    html += '<div class="kpi-grid" style="grid-template-columns:repeat(2,1fr)">';
    html += kpi('PLAYER EVENTS ' + SUFFIX, t.eventsCount, { color: 'blue' });
    html += kpi('ERRORS ' + SUFFIX, t.errors, { color: 'red', sub: t.agentCalls ? Math.round(t.errors / t.agentCalls * 100) + '% error rate' : '0% error rate' });
    html += '</div>';

    html += '<div class="grid-three">';
    html += '<div class="card"><div class="card-header"><div class="card-title">Token breakdown ' + titleSuffix + '</div></div>';
    html += '<table class="table"><tbody>';
    html += '<tr><td><b>Total tokens</b></td><td style="text-align:right"><b class="tokens-cell">' + fmtNum(t.totalTokens) + '</b></td></tr>';
    html += '</tbody></table></div>';

    html += '<div class="card"><div class="card-header"><div class="card-title">Plan mix</div></div>';
    html += '<div class="donut-wrap"><div style="position:relative;width:140px;height:140px"><div id="donut-overview"></div><div class="donut-center"><div class="donut-num">' + planTotal + '</div><div class="donut-label-mini">USERS</div></div></div>';
    html += '<div class="donut-legend">';
    html += '<div class="donut-row"><span><span class="dot" style="background:' + PLAN_COLORS.free + '"></span>Free</span><b>' + plans.free + ' · ' + Math.round(plans.free/planTotal*100) + '%</b></div>';
    html += '<div class="donut-row"><span><span class="dot" style="background:' + PLAN_COLORS.pro + '"></span>Pro</span><b>' + plans.pro + ' · ' + Math.round(plans.pro/planTotal*100) + '%</b></div>';
    html += '<div class="donut-row"><span><span class="dot" style="background:' + PLAN_COLORS.pro_max + '"></span>Pro Max</span><b>' + plans.pro_max + ' · ' + Math.round(plans.pro_max/planTotal*100) + '%</b></div>';
    html += '</div></div></div>';

    html += '<div class="card"><div class="card-header"><div class="card-title">Quick actions</div></div>';
    html += '<button class="view-btn" onclick="navigate(\\'users\\')" style="width:100%;margin-bottom:8px">View all users →</button>';
    html += '<button class="view-btn" onclick="navigate(\\'traces\\')" style="width:100%;margin-bottom:8px">View all activity →</button>';
    html += '<button class="view-btn" onclick="navigate(\\'plans\\')" style="width:100%">View plans &amp; coupons →</button>';
    html += '</div>';
    html += '</div>'; // grid-three

    // Activity list scope = the same range chosen at the top of the page.
    // No per-list filter — the top-right dropdown is the single source of truth.
    const headerMeta =
      '<span style="margin-right:10px;color:var(--text-muted);font-size:11px">' +
        r.recent.length + ' events · ' + OV_RANGE_LABELS[overviewRange] + ' · click to expand' +
      '</span>';
    html += '<div class="card"><div class="card-header"><div class="card-title">Recent activity</div><div style="display:flex;align-items:center">' + headerMeta + '</div></div>';
    // Reuse the EXACT same expandable trace-row component as the Activity
    // page. The /api/admin/overview projection already returns every
    // field renderTraceRow + renderTraceDetail need (decision, reason,
    // confidence, tool, fallback, userAvatarUrl, model, latency, tokens).
    // Just hand the server payload through — no remapping, so the two
    // pages can NEVER drift apart on rendered fields.
    traceRows = r.recent.slice();
    openTraceId = null;
    if (traceRows.length) {
      html += '<div class="trace-list">' + traceRows.map(renderTraceRow).join('') + '</div>';
    } else {
      html += '<div class="empty">No activity yet.</div>';
    }
    html += '</div>';

    main.innerHTML = html;
    donut('donut-overview', [
      { value: plans.free, color: PLAN_COLORS.free },
      { value: plans.pro, color: PLAN_COLORS.pro },
      { value: plans.pro_max, color: PLAN_COLORS.pro_max },
    ]);
    bindTraceRowClicks();
    bindRangeSelect();
  } catch (err) {
    main.innerHTML += '<div class="empty">Error: ' + esc(err.message) + '</div>';
  }
}

// Re-attach the range dropdown handler after every renderOverview() rewrite
// of main.innerHTML so the selector keeps working across re-renders.
function bindRangeSelect() {
  const sel = document.getElementById('ov-range');
  if (!sel) return;
  sel.value = overviewRange;
  sel.onchange = (ev) => {
    overviewRange = ev.target.value;
    renderOverview();
  };
}

function bindTraceRowClicks() {
  document.querySelectorAll('[data-open-uid]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      renderUserDrill(el.dataset.openUid);
    });
  });
  document.querySelectorAll('.trace-row').forEach((row) => {
    row.addEventListener('click', (ev) => {
      if (ev.target.closest('.trace-detail')) return;
      if (ev.target.closest('[data-open-uid]')) return;
      toggleTrace(row.dataset.id);
    });
  });
}

// =========================== USERS ===========================
async function renderUsers(params) {
  params = params || {};
  const main = document.getElementById('main');
  main.innerHTML = '<div class="page-title">Users</div><div id="u-count" class="page-sub">Loading…</div>' +
    '<div class="toolbar">' +
    '  <input id="u-search" placeholder="Search name or user ID…" />' +
    '  <select id="u-plan"><option value="all">All plans</option><option value="free">Free</option><option value="pro">Pro</option><option value="pro_max">Pro Max</option></select>' +
    '  <select id="u-sort"><option value="recent">Recently Active</option><option value="tokens">Most Tokens</option><option value="score">Tier Score</option><option value="high">High Score</option><option value="games">Games Played</option><option value="tier">Tier Rank</option></select>' +
    '  <button id="u-go">Search</button>' +
    '</div>' +
    '<div class="card"><div id="u-table" class="loading">Loading users…</div></div>';

  // Pre-apply plan filter from caller (e.g. clicked KPI on Plans page).
  if (params.plan) {
    const planSel = document.getElementById('u-plan');
    if (planSel) planSel.value = params.plan;
  }

  const apply = async () => {
    const search = document.getElementById('u-search').value;
    const plan = document.getElementById('u-plan').value;
    const sort = document.getElementById('u-sort').value;
    const r = await fetch('/api/admin/users?search=' + encodeURIComponent(search) + '&plan=' + plan + '&sort=' + sort).then((r) => r.json());
    if (!r.ok) { document.getElementById('u-table').innerHTML = '<div class="empty">' + esc(r.error) + '</div>'; return; }
    document.getElementById('u-count').textContent = r.total + ' users';
    if (!r.users.length) { document.getElementById('u-table').innerHTML = '<div class="empty">No users match.</div>'; return; }
    let html = '<table class="table"><thead><tr>' +
      '<th>User</th><th>Tier</th><th>Plan</th><th>High Score</th><th>Games</th><th>Tokens Used</th><th>AI Calls</th><th>Updated</th><th></th>' +
      '</tr></thead><tbody>';
    r.users.forEach((u) => {
      html += '<tr>';
      html += '<td><div class="user-row">' + avatarHTML(u) + '<div><div class="user-name">' + esc(u.displayName) + '</div><div class="user-id">' + shortId(u.userId) + '…</div></div></div></td>';
      html += '<td><span class="tier-chip tier-' + u.tier + '">' + u.tierEmoji + ' ' + esc(u.tierName) + '</span></td>';
      html += '<td><span class="tag tag-' + u.plan + '">' + planLabel(u.plan) + '</span></td>';
      html += '<td><b>' + fmtNum(u.highScore) + '</b></td>';
      html += '<td>' + u.totalGames + '</td>';
      html += '<td class="tokens-cell">' + fmtNum(u.tokens) + '</td>';
      html += '<td>' + u.calls + '</td>';
      html += '<td style="color:#94a3b8;font-size:11px">' + fmtTime(u.updatedAt) + '</td>';
      html += '<td><button class="view-btn" data-uid="' + esc(u.userId) + '">View</button></td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    document.getElementById('u-table').innerHTML = html;
    document.querySelectorAll('[data-uid]').forEach((b) => b.addEventListener('click', () => renderUserDrill(b.dataset.uid)));
  };
  document.getElementById('u-go').addEventListener('click', apply);
  document.getElementById('u-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  apply();
}

// =========================== USER DRILL-DOWN ===========================
async function renderUserDrill(userId) {
  // Park the router on a non-overview route so the background refresher
  // never replaces the profile we are about to render.
  currentRoute = 'user-profile';
  const main = document.getElementById('main');
  main.innerHTML = '<button class="back-btn" onclick="navigate(\\'users\\')">← Back to users</button><div class="loading">Loading user profile…</div>';

  const r = await fetch('/api/admin/users/' + encodeURIComponent(userId)).then((r) => r.json());
  if (!r.ok) { main.innerHTML += '<div class="empty">' + esc(r.error) + '</div>'; return; }
  const u = r.user;
  const s = u.stats;
  const tok = u.tokens;
  const plan = u.plan;

  let html = '<button class="back-btn" onclick="navigate(\\'users\\')">← Back to users</button>';

  // Hero
  html += '<div class="hero">';
  html += '<div class="hero-avatar" style="background:' + (u.avatarColor || '#7c3aed') + '">' + (u.avatarUrl ? '<img src="' + esc(u.avatarUrl) + '" style="width:100%;height:100%;object-fit:cover"/>' : (u.avatarEmoji || initial(u.displayName))) + '</div>';
  html += '<div style="flex:1">';
  html += '<div class="hero-name">' + esc(u.displayName) + '</div>';
  html += '<div class="hero-meta">UID: ' + esc(userId) + '</div>';
  html += '<div class="hero-chips">';
  html += '<span class="tier-chip tier-' + u.tier + '">' + u.tierEmoji + ' ' + u.tierName + ' Tier</span>';
  html += '<span class="tag tag-' + plan.plan + '">' + planLabel(plan.plan) + (plan.status === 'trial' ? ' · TRIAL' : '') + '</span>';
  if (s.language) html += '<span class="tag tag-info">Language: ' + esc(s.language) + '</span>';
  if (s.dob) html += '<span class="tag tag-info">DOB: ' + esc(s.dob) + '</span>';
  html += '</div></div></div>';

  // Headline KPI — total tokens used by THIS user only.
  html += '<div class="kpi-grid" style="grid-template-columns:1fr">';
  html += kpi('TOTAL TOKENS USED', fmtNum(tok.total), { accent: true, sub: tok.calls + ' agent calls' });
  html += '</div>';

  // Game KPIs
  html += '<div class="kpi-grid">';
  html += kpi('HIGH SCORE', fmtNum(s.highScore));
  html += kpi('TIER SCORE', fmtNum(s.totalScore));
  html += kpi('BEST STREAK', s.bestStreak);
  html += kpi('WORDS FOUND', fmtNum(s.totalWords));
  html += '</div>';

  // 3-column: Practice / Learning / Plan
  html += '<div class="grid-three">';

  // Practice
  html += '<div class="card"><div class="card-header"><div class="card-title">🦉 Practice Mode</div></div>';
  html += '<table class="table"><tbody>';
  html += '<tr><td>Practice High Score</td><td style="text-align:right"><b>' + s.practiceHighScore + '</b></td></tr>';
  html += '<tr><td>Current Difficulty</td><td style="text-align:right"><b>' + esc(String(s.practiceCurrentDifficulty).toUpperCase()) + '</b></td></tr>';
  html += '<tr><td>Rounds Played</td><td style="text-align:right">' + s.practiceRoundsPlayed + '</td></tr>';
  html += '<tr><td>Rounds Won</td><td style="text-align:right">' + s.practiceRoundsWon + '</td></tr>';
  html += '</tbody></table></div>';

  // Learning
  html += '<div class="card"><div class="card-header"><div class="card-title">🎓 Learning Path</div></div>';
  if (u.learn) {
    const done = (u.learn.completed_units || []).length;
    html += '<table class="table"><tbody>';
    html += '<tr><td>Current Unit</td><td style="text-align:right"><b>' + esc(u.learn.current_unit_id || '—') + '</b></td></tr>';
    html += '<tr><td>Units Complete</td><td style="text-align:right">' + done + ' / 32</td></tr>';
    html += '<tr><td>Total XP</td><td style="text-align:right"><b>' + (u.learn.total_xp || 0) + '</b></td></tr>';
    html += '</tbody></table>';
    html += '<div class="bar"><div class="bar-fill" style="width:' + Math.max(2, Math.min(100, done/32*100)) + '%"></div></div>';
  } else {
    html += '<div class="empty">No learning progress yet.</div>';
  }
  html += '</div>';

  // Plan
  html += '<div class="card"><div class="card-header"><div class="card-title">💎 Subscription</div></div>';
  html += '<table class="table"><tbody>';
  html += '<tr><td>Plan</td><td style="text-align:right"><span class="tag tag-' + plan.plan + '">' + planLabel(plan.plan) + '</span></td></tr>';
  html += '<tr><td>Status</td><td style="text-align:right"><b>' + esc(plan.status || '—') + '</b></td></tr>';
  html += '<tr><td>Cycle</td><td style="text-align:right">' + esc(plan.cycle || '—') + '</td></tr>';
  html += '<tr><td>Trial Used</td><td style="text-align:right">' + (plan.trialUsed ? 'Yes' : 'No') + '</td></tr>';
  html += '<tr><td>Expires</td><td style="text-align:right">' + fmtDate(plan.expiresAt) + '</td></tr>';
  html += '</tbody></table></div>';

  html += '</div>'; // grid-three

  // Tokens by AI agent
  if (tok.byAgent && tok.byAgent.length) {
    html += '<div class="card"><div class="card-header"><div class="card-title">🤖 Tokens by AI Agent</div><div class="card-meta">Which agents this user triggered</div></div>';
    html += '<table class="table"><thead><tr><th>Agent</th><th>Calls</th><th>Tokens</th><th>% of user total</th></tr></thead><tbody>';
    tok.byAgent.forEach((a) => {
      const pct = tok.total ? Math.round(a.tokens / tok.total * 100) : 0;
      html += '<tr><td><b>' + esc(a.agent) + '</b></td><td>' + a.calls + '</td><td class="tokens-cell">' + fmtNum(a.tokens) + '</td><td>';
      html += '<div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1;margin:0"><div class="bar-fill" style="width:' + pct + '%"></div></div><span style="font-size:11px;width:30px;text-align:right">' + pct + '%</span></div>';
      html += '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="height:14px"></div>';
  }

  // Battles
  html += '<div class="card"><div class="card-header"><div class="card-title">⚔️ Battles (last 20)</div></div>';
  if (u.battles && u.battles.length) {
    html += '<table class="table"><thead><tr><th>When</th><th>Opponent</th><th>P1 Score</th><th>P2 Score</th><th>Result</th></tr></thead><tbody>';
    u.battles.forEach((b) => {
      const isP1 = b.player1_id === userId;
      const oppId = isP1 ? b.player2_id : b.player1_id;
      const winSelf = b.winner_id === userId;
      html += '<tr><td>' + fmtTime(b.created_at) + '</td><td style="font-family:monospace;font-size:11px">' + shortId(oppId) + '…</td>' +
        '<td><b>' + (b.p1_score || 0) + '</b></td><td><b>' + (b.p2_score || 0) + '</b></td>' +
        '<td>' + (winSelf ? '<span class="tag tag-ok">WON</span>' : (b.winner_id ? '<span class="tag tag-error">LOST</span>' : '<span class="tag tag-info">DRAW</span>')) + '</td></tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div class="empty">No battles played.</div>';
  }
  html += '</div><div style="height:14px"></div>';

  // Category mastery
  if (s.categoryStats && Object.keys(s.categoryStats).length) {
    html += '<div class="card"><div class="card-header"><div class="card-title">📚 Category Mastery</div></div>';
    html += '<table class="table"><thead><tr><th>Category</th><th>Played</th><th>Words Found</th><th>Perfect</th></tr></thead><tbody>';
    Object.entries(s.categoryStats).forEach(([cat, st]) => {
      html += '<tr><td><b>' + esc(cat) + '</b></td><td>' + (st.played || 0) + '</td><td>' + (st.wordsFound || 0) + ' / ' + (st.totalWords || 0) + '</td><td>' + (st.perfectCount || 0) + '</td></tr>';
    });
    html += '</tbody></table></div><div style="height:14px"></div>';
  }

  // Daily usage
  if (u.usage && u.usage.length) {
    html += '<div class="card"><div class="card-header"><div class="card-title">📅 Daily Usage (last 14 days)</div></div>';
    html += '<table class="table"><thead><tr><th>Date</th><th>Quick Play</th><th>Daily</th><th>Quiz</th></tr></thead><tbody>';
    u.usage.forEach((d) => {
      html += '<tr><td>' + esc(d.date) + '</td><td>' + (d.quick_play || 0) + '</td><td>' + (d.daily || 0) + '</td><td>' + (d.quiz || 0) + '</td></tr>';
    });
    html += '</tbody></table></div><div style="height:14px"></div>';
  }

  // Events / activity log — same expandable trace-row component as the
  // Activity tab, so each event toggles to show INPUT / RESPONSE / METADATA.
  html += '<div class="card"><div class="card-header"><div class="card-title">📡 Activity Log</div><div class="card-meta">Every AI call &amp; event · last ' + (u.events ? u.events.length : 0) + '</div></div>';
  if (u.events && u.events.length) {
    // Decorate each event row with this user's profile so the avatar/name
    // resolve correctly inside the shared renderTraceRow component.
    traceRows = u.events.map((e) => ({
      id: e.id, agent: e.agent, status: e.status,
      prompt: e.prompt, response: e.response, meta: e.meta,
      model: e.model, durationMs: e.durationMs,
      promptTokens: e.promptTokens || 0,
      completionTokens: e.completionTokens || 0,
      tokens: e.tokens || 0,
      createdAt: e.createdAt,
      userId: u.userId,
      userName: u.displayName,
      userColor: u.avatarColor,
      userEmoji: u.avatarEmoji,
      userAvatarUrl: u.avatarUrl,
      isAgent: e.isAgent,
    }));
    openTraceId = null;
    html += '<div class="trace-list">' + traceRows.map(renderTraceRow).join('') + '</div>';
  } else {
    html += '<div class="empty">No activity recorded for this user.</div>';
  }
  html += '</div>';

  main.innerHTML = html;
  bindTraceRowClicks();
}

// =========================== TRACES ===========================
const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'agent', label: 'AI Agents' },
  { id: 'quick-play', label: 'Quick Play' },
  { id: 'quick-play-fail', label: 'QP Fail' },
  { id: 'practice', label: 'Practice' },
  { id: 'tier-up', label: 'Tier Up' },
  { id: 'quiz-correct', label: 'Quiz ✓' },
  { id: 'quiz-wrong', label: 'Quiz ✗' },
  { id: 'quiz-session', label: 'Quiz Session' },
  { id: 'daily-word', label: 'Daily Word' },
  { id: 'daily-result', label: 'Daily Result' },
  { id: 'battle-queue', label: 'Battle Queue' },
  { id: 'battle-result', label: 'Battle Result' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'paywall-hit', label: 'Paywall' },
  { id: 'learn-lesson', label: 'Lesson' },
  { id: 'learn-unit', label: 'Unit Done' },
  { id: 'avatar-upload', label: 'Avatar' },
  { id: 'auth', label: 'Auth' },
  { id: 'level-complete', label: 'Level Done' },
];

let traceRows = [];
let openTraceId = null;
// =========================== PIPELINES ===========================
// Live auto-refresh state. The Pipelines page polls the server every 1
// second; if the user navigates away the interval is torn down by the
// next route's renderer call so we never leave a zombie timer.
let pipelinesPollTimer = null;
let pipelinesLastFingerprint = '';

async function renderPipelines() {
  const main = document.getElementById('main');
  // Stop any leftover polling from a previous mount.
  if (pipelinesPollTimer) { clearInterval(pipelinesPollTimer); pipelinesPollTimer = null; }
  pipelinesLastFingerprint = '';

  const HEADER =
    '<div class="page-title" style="display:flex;align-items:center;gap:10px">Agent Pipelines' +
      '<span id="pl-live" style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#16a34a;background:#dcfce7;border:1px solid rgba(22,163,74,0.35);padding:3px 10px;border-radius:999px;letter-spacing:0.5px">' +
        '<span style="width:7px;height:7px;border-radius:50%;background:#16a34a;display:inline-block;box-shadow:0 0 0 0 rgba(22,163,74,0.7);animation:pl-pulse 1.4s infinite"></span>LIVE' +
      '</span>' +
    '</div>' +
    '<div class="page-sub">Live agent pipeline — each card is one play-session in real chronological order. Auto-refreshes every 1 s as new agents fire.</div>' +
    '<style>@keyframes pl-pulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,0.7)}70%{box-shadow:0 0 0 8px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}</style>';

  main.innerHTML = HEADER + '<div id="pl-body"><div class="loading">Loading…</div></div>';

  async function fetchAndRender() {
    // Only run if the user is still on the pipelines route.
    if (currentRoute !== 'pipelines') {
      if (pipelinesPollTimer) { clearInterval(pipelinesPollTimer); pipelinesPollTimer = null; }
      return;
    }
    let r = null;
    try {
      const resp = await fetch('/api/admin/pipelines');
      if (!resp.ok) {
        document.getElementById('pl-body').innerHTML =
          '<div class="empty">Server returned HTTP ' + resp.status + ' — retrying…</div>';
        return;
      }
      r = await resp.json();
    } catch (e) {
      document.getElementById('pl-body').innerHTML =
        '<div class="empty">Network error: ' + esc(e.message) + ' — retrying…</div>';
      return;
    }
    if (!r || !r.ok) {
      document.getElementById('pl-body').innerHTML =
        '<div class="empty">' + esc((r && r.error) || 'Failed to load.') + '</div>';
      return;
    }
    if (!r.pipelines.length) {
      document.getElementById('pl-body').innerHTML =
        '<div class="empty">Waiting for a game session… Play a round and the pipeline will start streaming here.</div>';
      pipelinesLastFingerprint = '';
      return;
    }

    // Fingerprint = total step count + newest step id. Skip re-render when
    // nothing changed since the last poll — prevents flicker + keeps
    // expanded scroll positions intact.
    const fp = r.pipelines.reduce(function (acc, p) {
      var last = p.steps[p.steps.length - 1] || {};
      return acc + p.userId + ':' + p.stepCount + ':' + (last.id || '') + '|';
    }, '');
    if (fp === pipelinesLastFingerprint) return;
    pipelinesLastFingerprint = fp;

    let html = '<div class="pipeline-list">';
    for (const p of r.pipelines) {
      const who = p.userName || (p.userId ? shortId(p.userId) + '…' : 'Unknown');
      const avatar =
        '<div class="trace-avatar" style="background:' + esc(p.userColor || '#7c3aed') + ';overflow:hidden">' +
          (p.userAvatarUrl
            ? '<img src="' + esc(p.userAvatarUrl) + '" loading="lazy" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>'
            : esc(p.userEmoji || initial(who))) +
        '</div>';
      // Section badge — top-right corner shows WHICH game section this
      // pipeline session belongs to (Practice / Pakistan Quest / Quick
      // Play / 1v1 Battle / Continue Learning / AI Tutor / Home).
      const SECTION_BG = {
        practice:     '#dbeafe', 'quick-play': '#ede9fe',
        pakquest:     '#dcfce7', battle:       '#fee2e2',
        learn:        '#fef3c7', tutor:        '#cffafe',
        home:         '#f1f5f9',
      };
      const SECTION_FG = {
        practice:     '#1e40af', 'quick-play': '#6d28d9',
        pakquest:     '#15803d', battle:       '#b91c1c',
        learn:        '#a16207', tutor:        '#0e7490',
        home:         '#475569',
      };
      const secBg = SECTION_BG[p.section] || '#f1f5f9';
      const secFg = SECTION_FG[p.section] || '#475569';
      const sectionBadge =
        '<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;' +
        'border-radius:999px;font-size:11px;font-weight:900;letter-spacing:0.5px;' +
        'background:' + secBg + ';color:' + secFg + ';border:1.5px solid ' + secFg + '33">' +
        esc((p.sectionLabel || 'Session').toUpperCase()) + '</span>';
      const badges = sectionBadge +
        (p.anyFallback ? '<span class="trace-meta-pill fallback">FALLBACK USED</span>' : '') +
        (p.anyError ? '<span class="trace-meta-pill" style="background:#fee2e2;border-color:rgba(220,38,38,0.35);color:#b91c1c">ERROR</span>' : '');
      html += '<div class="pipeline-card">';
      html +=   '<div class="pipeline-header">';
      html +=     '<div style="display:flex;align-items:center;gap:10px">' + avatar +
                    '<div><div class="pipeline-user">' + esc(who) + '</div>' +
                    '<div class="pipeline-meta">' + fmtTime(p.startedAt) + ' → ' + fmtTime(p.endedAt) +
                      ' · ' + p.durationSec + 's · ' + p.stepCount + ' steps · ' + p.totalTokens + ' tok' +
                    '</div></div></div>';
      html +=     '<div style="display:flex;gap:6px;align-items:center">' + badges + '</div>';
      html +=   '</div>';
      // Real chronological step chain — built in execution order so the
      // first agent the kid actually triggered renders leftmost.
      html +=   '<div class="pipeline-flow">';
      for (let i = 0; i < p.steps.length; i++) {
        const s = p.steps[i];
        const dot = s.fallback ? 'fb' : s.status === 'error' ? 'err' : 'ok';
        const reason = s.reason ? esc(String(s.reason).slice(0, 110)) : '';
        const stepLabel = s.isAgent ? (s.agent || 'agent') : String(s.agent || '').replace('event:', '');
        html += '<div class="pipeline-step ' + dot + '" data-step-id="' + esc(s.id) + '" title="' + esc(s.reason || '') + '">' +
                  '<div class="ps-num">' + (i + 1) + '</div>' +
                  '<div class="ps-name">' + esc(stepLabel) + '</div>' +
                  '<div class="ps-tool">' + esc(s.tool || '—') + '</div>' +
                  '<div class="ps-meta">' + (s.durationMs || 0) + 'ms · ' + (s.tokens || 0) + ' tok</div>' +
                  (s.fallback ? '<div class="ps-fb">FALLBACK</div>' : '') +
                  (reason ? '<div class="ps-reason">💡 ' + reason + (s.reason.length > 110 ? '…' : '') + '</div>' : '') +
                '</div>';
        if (i < p.steps.length - 1) html += '<div class="pipeline-arrow">›</div>';
      }
      html +=   '</div>';
      html += '</div>';
    }
    html += '</div>';
    document.getElementById('pl-body').innerHTML = html;
  }

  await fetchAndRender();
  pipelinesPollTimer = setInterval(fetchAndRender, 1000);
}

async function renderTraces() {
  const main = document.getElementById('main');
  const catOpts = CATEGORIES.map((c) => '<option value="' + c.id + '">' + c.label + '</option>').join('');
  main.innerHTML = '<div class="page-title">Activity</div><div class="page-sub">Every AI agent call and player event in real time · click a row to expand</div>' +
    '<div class="toolbar">' +
    '  <input id="t-search" placeholder="Search prompt or response…" />' +
    '  <input id="t-user" placeholder="Username…" style="max-width:180px" />' +
    '  <select id="t-cat">' + catOpts + '</select>' +
    '  <select id="t-status"><option value="all">All status</option><option value="ok">Success</option><option value="error">Errors only</option></select>' +
    '  <button id="t-go">Search</button>' +
    '</div>' +
    '<div class="card"><div id="t-body" class="loading">Loading…</div></div>';

  const apply = async () => {
    const url = '/api/admin/traces?category=' + document.getElementById('t-cat').value +
      '&status=' + document.getElementById('t-status').value +
      '&search=' + encodeURIComponent(document.getElementById('t-search').value) +
      '&user=' + encodeURIComponent(document.getElementById('t-user').value);
    const r = await fetch(url).then((r) => r.json());
    if (!r.ok) { document.getElementById('t-body').innerHTML = '<div class="empty">' + esc(r.error) + '</div>'; return; }
    if (!r.rows.length) { document.getElementById('t-body').innerHTML = '<div class="empty">No traces match.</div>'; return; }

    traceRows = r.rows;
    openTraceId = null;
    const totalTok = r.rows.reduce((a, x) => a + (x.tokens || 0), 0);
    let html = '<div style="display:flex;gap:18px;margin-bottom:14px;font-size:12px;color:#5d6b80">' +
      '<div><b style="color:#1a2744;font-size:15px">' + r.rows.length + '</b> traces</div>' +
      '<div><b class="tokens-cell" style="font-size:15px">' + fmtNum(totalTok) + '</b> total tokens</div>' +
      '</div>';
    html += '<div class="trace-list">' + r.rows.map(renderTraceRow).join('') + '</div>';
    document.getElementById('t-body').innerHTML = html;
    bindTraceRowClicks();
  };
  document.getElementById('t-go').addEventListener('click', apply);
  document.getElementById('t-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  document.getElementById('t-user').addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  document.getElementById('t-cat').addEventListener('change', apply);
  document.getElementById('t-status').addEventListener('change', apply);
  apply();
}

function renderTraceRow(e) {
  const cat = String(e.agent || '').replace('event:', '');
  const isAgent = e.isAgent;
  const who = e.userName || (e.userId ? shortId(e.userId) + '…' : 'Unknown User');
  const isUnknown = !e.userName && !e.userId;
  const right = '<span class="trace-meta-pill">' + fmtTime(e.createdAt) + '</span>' +
    '<span class="trace-meta-pill lat">' + (e.durationMs || 0) + 'ms</span>' +
    (e.tokens ? '<span class="trace-meta-pill tok">' + e.tokens + ' tok</span>' : '') +
    (e.tool ? '<span class="trace-meta-pill tool" title="Tool / API used">' + esc(e.tool) + '</span>' : '') +
    (e.fallback ? '<span class="trace-meta-pill fallback" title="LLM unavailable — local logic ran">FALLBACK</span>' : '');

  const uidAttr = (!isUnknown && e.userId) ? ' data-open-uid="' + esc(e.userId) + '"' : '';
  const clickableCls = (!isUnknown && e.userId) ? ' clickable' : '';
  return '<div class="trace-row" data-id="' + esc(e.id) + '">' +
    '<div class="trace-summary">' +
      '<div class="trace-avatar' + clickableCls + '"' + uidAttr + ' style="background:' + esc(e.userColor || (isUnknown ? '#94a3b8' : '#7c3aed')) + '">' +
        (e.userAvatarUrl ? '<img src="' + esc(e.userAvatarUrl) + '" style="width:100%;height:100%;object-fit:cover"/>' : esc(e.userEmoji || initial(who))) +
      '</div>' +
      '<div class="trace-id-col">' +
        '<div class="trace-name' + (isUnknown ? ' muted' : clickableCls) + '"' + uidAttr + '>' + esc(who) + '</div>' +
        '<div class="trace-cat">' + (isAgent ? agentChip(e.agent) : eventBadge(cat)) +
          ' <span class="tag tag-' + (e.status === 'error' ? 'error' : (e.fallback ? 'warn' : 'ok')) + '" style="margin-left:4px">' + esc(e.fallback ? 'fallback' : (e.status || 'ok')) + '</span>' +
        '</div>' +
        (e.reason ? '<div class="trace-reason" title="' + esc(e.reason) + '">💡 ' + esc(String(e.reason).slice(0, 90)) + (String(e.reason).length > 90 ? '…' : '') + '</div>' : '') +
      '</div>' +
      '<div class="trace-right">' + right + '</div>' +
      '<div class="trace-chevron">▼</div>' +
    '</div>' +
    '<div class="trace-detail" id="td-' + esc(e.id) + '" style="max-height:0;overflow:hidden;transition:max-height 0.35s ease"></div>' +
  '</div>';
}

function toggleTrace(id) {
  const rows = document.querySelectorAll('.trace-row');
  rows.forEach((row) => {
    const rowId = row.dataset.id;
    const detail = document.getElementById('td-' + rowId);
    const chev = row.querySelector('.trace-chevron');
    if (rowId === id) {
      if (openTraceId === id) {
        detail.style.maxHeight = '0px';
        chev.style.transform = 'rotate(0deg)';
        row.classList.remove('open');
        openTraceId = null;
      } else {
        if (!detail.dataset.filled) {
          detail.innerHTML = renderTraceDetail(traceRows.find((x) => x.id === id));
          detail.dataset.filled = '1';
        }
        detail.style.maxHeight = detail.scrollHeight + 'px';
        chev.style.transform = 'rotate(180deg)';
        row.classList.add('open');
        openTraceId = id;
        // re-measure after fill
        setTimeout(() => { detail.style.maxHeight = detail.scrollHeight + 'px'; }, 50);
      }
    } else {
      if (detail) {
        detail.style.maxHeight = '0px';
        detail.classList.remove('open');
      }
      if (chev) chev.style.transform = 'rotate(0deg)';
      row.classList.remove('open');
    }
  });
}

function renderTraceDetail(e) {
  if (!e) return '';
  const isAgent = e.isAgent;
  const promptLabel = isAgent ? 'INPUT · PROMPT' : 'EVENT DATA';
  const respLabel = isAgent ? 'OUTPUT · RESPONSE' : 'PAYLOAD';
  const formatBlock = (txt) => {
    if (!txt) return '<div class="block-empty">—</div>';
    let s = String(txt);
    // Pretty-print JSON if it parses
    const trimmed = s.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try { s = JSON.stringify(JSON.parse(trimmed), null, 2); } catch (_) {}
    }
    return '<pre class="block">' + esc(s) + '</pre>';
  };
  let html = '<div class="trace-detail-inner">';

  // INPUT (prompt / event payload) — always rendered, even if empty.
  html += '<div class="block-section">';
  html += '<div class="block-label">' + promptLabel + '</div>';
  html += formatBlock(e.prompt);
  html += '</div>';

  // OUTPUT (response / agent decision payload) — always rendered.
  html += '<div class="block-section">';
  html += '<div class="block-label">' + respLabel + '</div>';
  html += formatBlock(e.response);
  html += '</div>';

  // DECISION — what the agent actually chose (e.g. "difficulty=medium",
  // "ACCEPT word", "ALLOW", etc.). ALWAYS rendered so the judges can see
  // the explicit decision at a glance without parsing the response JSON.
  html += '<div class="block-section">';
  html += '<div class="block-label">DECISION</div>';
  html += '<pre class="block reason-block">' + esc(e.decision || '—') + '</pre>';
  html += '</div>';

  // CONFIDENCE / REASON — why the agent made its decision. ALWAYS rendered.
  html += '<div class="block-section">';
  html += '<div class="block-label">CONFIDENCE / REASON</div>';
  const reasonText = (e.confidence != null ? 'confidence=' + e.confidence + ' · ' : '') + (e.reason || (e.fallback ? 'LLM unavailable — local rule-based fallback ran.' : '—'));
  html += '<pre class="block reason-block">' + esc(reasonText) + '</pre>';
  html += '</div>';

  // METADATA grid — always rendered. Every cell shows a value or "—".
  html += '<div class="block-section">';
  html += '<div class="block-label">METADATA</div>';
  html += '<div class="meta-grid">';
  html += metaCell('User', e.userName ? (e.userName + ' (' + shortId(e.userId) + '…)') : (e.userId ? shortId(e.userId) + '…' : '—'));
  html += metaCell('Trace ID', shortId(e.id) + '…');
  html += metaCell('Agent / Event', e.agent || '—');
  html += metaCell('Tool / API used', e.tool || (e.model ? ('OpenAI · ' + e.model) : 'Local logic'));
  html += metaCell('Model', e.model || '—');
  html += metaCell('Status', e.fallback ? 'FALLBACK ⚠' : (e.status || 'ok'));
  html += metaCell('Fallback path', e.fallback ? 'YES — local logic ran' : 'No');
  html += metaCell('Latency', (e.durationMs || 0) + ' ms');
  html += metaCell('Total tokens', e.tokens || 0);
  html += metaCell('Timestamp', new Date(e.createdAt).toLocaleString());
  html += '</div></div>';

  html += '</div>';
  return html;
}
function metaCell(label, value) {
  return '<div class="meta-cell"><div class="meta-cell-label">' + esc(label) + '</div><div class="meta-cell-value">' + esc(String(value)) + '</div></div>';
}

// =========================== PLANS ===========================
async function renderPlans() {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="page-title">Plans &amp; Billing</div><div class="page-sub">Subscription distribution and coupon activity</div><div class="loading">Loading…</div>';
  const r = await fetch('/api/admin/plans').then((r) => r.json());
  if (!r.ok) { main.innerHTML += '<div class="empty">' + esc(r.error) + '</div>'; return; }
  const d = r.distribution; const total = (d.free + d.pro + d.pro_max) || 1;

  let html = '<div class="page-title">Plans &amp; Billing</div><div class="page-sub">Subscription distribution and coupon activity · click a card to filter the Users tab</div>';
  html += '<div class="kpi-grid">';
  html += kpi('FREE USERS', d.free, { sub: Math.round(d.free/total*100) + '%', clickable: 'free' });
  html += kpi('PRO USERS', d.pro, { sub: Math.round(d.pro/total*100) + '%', clickable: 'pro' });
  html += kpi('PRO MAX USERS', d.pro_max, { sub: Math.round(d.pro_max/total*100) + '%', accent: true, clickable: 'pro_max' });
  html += kpi('TOTAL', total, { clickable: 'all' });
  html += '</div>';

  html += '<div class="grid-two">';
  html += '<div class="card"><div class="card-header"><div class="card-title">Distribution</div></div>';
  html += '<div class="donut-wrap"><div style="position:relative;width:140px;height:140px"><div id="donut-plans"></div><div class="donut-center"><div class="donut-num">' + total + '</div><div class="donut-label-mini">USERS</div></div></div>';
  html += '<div class="donut-legend">';
  html += '<div class="donut-row"><span><span class="dot" style="background:' + PLAN_COLORS.free + '"></span>Free</span><b>' + d.free + '</b></div>';
  html += '<div class="donut-row"><span><span class="dot" style="background:' + PLAN_COLORS.pro + '"></span>Pro</span><b>' + d.pro + '</b></div>';
  html += '<div class="donut-row"><span><span class="dot" style="background:' + PLAN_COLORS.pro_max + '"></span>Pro Max</span><b>' + d.pro_max + '</b></div>';
  html += '</div></div></div>';

  html += '<div class="card"><div class="card-header"><div class="card-title">Coupons</div></div>';
  html += '<table class="table"><thead><tr><th>Code</th><th>Plan</th><th>Days</th><th>Active</th></tr></thead><tbody>';
  r.coupons.forEach((c) => {
    html += '<tr><td><b>' + esc(c.code) + '</b></td><td><span class="tag tag-' + c.plan + '">' + planLabel(c.plan) + '</span></td><td>' + c.days + '</td><td>' + (c.active ? '<span class="tag tag-ok">Active</span>' : '<span class="tag tag-error">Off</span>') + '</td></tr>';
  });
  html += '</tbody></table></div>';
  html += '</div>';

  html += '<div class="card"><div class="card-header"><div class="card-title">Recent paid activations</div><div class="card-meta">Pro &amp; Pro Max</div></div>';
  if (r.recent.length) {
    html += '<table class="table"><thead><tr><th>User</th><th>Plan</th><th>Status</th><th>Cycle</th><th>Activated</th><th>Expires</th></tr></thead><tbody>';
    r.recent.forEach((s) => {
      const profile = {
        displayName: s.displayName, avatarColor: s.avatarColor,
        avatarEmoji: s.avatarEmoji, avatarUrl: s.avatarUrl,
      };
      const name = s.displayName || shortId(s.user_id) + '…';
      html += '<tr>';
      html += '<td><div class="user-row">' + avatarHTML(profile, 30) +
        '<div><div class="user-name">' + esc(name) + '</div>' +
        '<div class="user-id">' + shortId(s.user_id) + '…</div></div></div></td>';
      html += '<td><span class="tag tag-' + s.plan + '">' + planLabel(s.plan) + '</span></td>' +
        '<td>' + esc(s.status || '—') + '</td>' +
        '<td>' + esc(s.cycle || '—') + '</td>' +
        '<td>' + fmtTime(s.created_at || s.updated_at) + '</td>' +
        '<td>' + fmtDate(s.expires_at) + '</td></tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div class="empty">No paid subscriptions yet.</div>';
  }
  html += '</div>';

  main.innerHTML = html;
  donut('donut-plans', [
    { value: d.free, color: PLAN_COLORS.free },
    { value: d.pro, color: PLAN_COLORS.pro },
    { value: d.pro_max, color: PLAN_COLORS.pro_max },
  ]);
  // Wire each clickable KPI to the Users tab with a pre-applied plan filter.
  document.querySelectorAll('.kpi.clickable[data-plan]').forEach((el) => {
    el.addEventListener('click', () => navigate('users', { plan: el.dataset.plan }));
  });
}

// =========================== INIT ===========================
navigate('overview');

// Silent background refresh — never rebuilds the page or navigates away.
// Updates KPI numbers in place, and prepends NEW activity rows without
// touching anything that is already expanded or scrolled.
async function silentRefreshOverview() {
  if (currentRoute !== 'overview') return;
  try {
    const r = await fetch('/api/admin/overview?range=' + encodeURIComponent(overviewRange)).then((r) => r.json());
    if (!r || !r.ok) return;
    const t = r.totals;
    // 1) Update KPI numbers in place by matching label text. Labels are
    //    range-scoped (except TOTAL USERS), so the map keys are built from
    //    the current overviewRange to stay in sync with renderOverview.
    const S = OV_RANGE_SUFFIX[overviewRange];
    const labelMap = {
      'TOTAL USERS': t.users,
      ['ACTIVE ' + S]: t.activeToday,
      ['TOKENS ' + S]: fmtNum(t.totalTokens),
      ['AGENT CALLS ' + S]: t.agentCalls,
      ['PLAYER EVENTS ' + S]: t.eventsCount,
      ['ERRORS ' + S]: t.errors,
    };
    document.querySelectorAll('.kpi').forEach((kpiEl) => {
      const lbl = kpiEl.querySelector('.kpi-label');
      const val = kpiEl.querySelector('.kpi-value');
      if (!lbl || !val) return;
      const key = (lbl.textContent || '').trim();
      if (labelMap.hasOwnProperty(key)) val.textContent = labelMap[key];
    });
    // 2) Token breakdown numbers.
    const tokCells = document.querySelectorAll('.tokens-cell');
    if (tokCells.length >= 3) {
      tokCells[0].textContent = fmtNum(t.promptTokens);
      tokCells[1].textContent = fmtNum(t.completionTokens);
      tokCells[2].textContent = fmtNum(t.totalTokens);
    }
    // 3) Prepend brand-new activity rows — only if nothing is currently
    //    expanded, so we never collapse the admin's open trace mid-read.
    if (openTraceId !== null) return;
    const list = document.querySelector('.trace-list');
    if (!list) return;
    const existingIds = new Set(traceRows.map((x) => x.id));
    // Pass server projection through AS-IS so decision / reason / tool /
    // confidence / fallback / userAvatarUrl all reach renderTraceRow and
    // renderTraceDetail. Earlier we re-mapped here and dropped half the
    // fields, which is why the Overview dropdown was missing data.
    const fresh = r.recent.filter((e) => !existingIds.has(e.id));
    if (!fresh.length) return;
    // Prepend in original (newest-first) order.
    traceRows = fresh.concat(traceRows);
    const tmp = document.createElement('div');
    tmp.innerHTML = fresh.map(renderTraceRow).join('');
    Array.from(tmp.children).reverse().forEach((node) => list.insertBefore(node, list.firstChild));
    bindTraceRowClicks();
  } catch (_) { /* silent — never disrupt the admin */ }
}
// Live-stream new agent activity into the Overview every 4 s. Matches
// the Pipelines polling cadence so all three live views (Overview,
// Pipelines, Activity) update in lock-step.
setInterval(silentRefreshOverview, 1000);

// Activity-page live streaming. Same cadence + same data path as
// Overview — every 4 s the page silently fetches the latest matches
// and prepends only the NEW rows so the admin's expanded trace stays
// open. Runs only while the user is actually on the Activity tab.
async function silentRefreshActivity() {
  if (currentRoute !== 'traces') return;
  if (openTraceId !== null) return; // don't disturb a mid-read dropdown
  const catEl = document.getElementById('t-cat');
  const stEl  = document.getElementById('t-status');
  const sEl   = document.getElementById('t-search');
  const uEl   = document.getElementById('t-user');
  if (!catEl) return;
  try {
    const url = '/api/admin/traces?category=' + catEl.value +
      '&status=' + stEl.value +
      '&search=' + encodeURIComponent(sEl.value) +
      '&user='   + encodeURIComponent(uEl.value);
    const r = await fetch(url).then((r) => r.json());
    if (!r || !r.ok || !r.rows) return;
    const list = document.querySelector('#t-body .trace-list');
    if (!list) return;
    const existingIds = new Set(traceRows.map((x) => x.id));
    const fresh = r.rows.filter((e) => !existingIds.has(e.id));
    if (!fresh.length) return;
    traceRows = fresh.concat(traceRows);
    const tmp = document.createElement('div');
    tmp.innerHTML = fresh.map(renderTraceRow).join('');
    Array.from(tmp.children).reverse().forEach((node) => list.insertBefore(node, list.firstChild));
    bindTraceRowClicks();
  } catch (_) { /* silent */ }
}
setInterval(silentRefreshActivity, 1000);
</script>
</body>
</html>`;

router.get('/admin', (_req, res) => res.type('html').send(HTML));
router.get('/admin/', (_req, res) => res.type('html').send(HTML));

module.exports = router;
