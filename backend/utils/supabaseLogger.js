// Supabase-backed log store. Every agent invocation is persisted to the
// `agent_logs` table so the /logs dashboard can show a complete history
// across deployments (not just the in-memory ring buffer).
//
// Writes are fire-and-forget — they never block or fail the agent call.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://epjndqbazobrfhovhpza.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwam5kcWJhem9icmZob3ZocHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTA1MzUsImV4cCI6MjA5NDU4NjUzNX0.wX__oXkj215e-19N9V5dpJWme7SJkUa5IIl6qO1s13g';

let cached = null;
function client() {
  if (cached !== null) return cached;
  try {
    cached = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (err) {
    cached = false;
  }
  return cached || null;
}

// Per-agent metadata: what TOOL each agent uses + whether it's expected
// to call an LLM (so we can label fallbacks correctly when the LLM is
// absent and local logic ran instead).
const AGENT_TOOLING = {
  difficultyAgent:      { tool: 'Local logic',           usesLLM: false },
  levelGeneratorAgent:  { tool: 'OpenAI · gpt-4o-mini',  usesLLM: true  },
  refereeAgent:         { tool: 'Local dictionary',      usesLLM: false },
  rewardAgent:          { tool: 'Local logic',           usesLLM: false },
  coachAgent:           { tool: 'OpenAI · gpt-4o-mini',  usesLLM: true  },
  chaalbaazAgent:       { tool: 'OpenAI · gpt-4o-mini',  usesLLM: true  },
  commentatorAgent:     { tool: 'OpenAI · gpt-4o-mini',  usesLLM: true  },
  tutorAgent:           { tool: 'OpenAI · gpt-4o-mini',  usesLLM: true  },
  wordDetailAgent:      { tool: 'OpenAI · gpt-4o-mini',  usesLLM: true  },
  wordOfDayAgent:       { tool: 'OpenAI · gpt-4o-mini',  usesLLM: true  },
  translateAgent:       { tool: 'OpenAI · gpt-4o-mini',  usesLLM: true  },
  quizAgent:            { tool: 'OpenAI · gpt-4o-mini',  usesLLM: true  },
  kidQuestionAgent:     { tool: 'OpenAI · gpt-4o-mini',  usesLLM: true  },
  kidWordAgent:         { tool: 'OpenAI · gpt-4o-mini',  usesLLM: true  },
  lessonAgent:          { tool: 'OpenAI · gpt-4o-mini',  usesLLM: true  },
  // guardrailAgent is fundamentally a local-rules agent (Layers 1-4 are
  // deterministic blocklist + age caps + repeat detection — no LLM by
  // design). Layer 5 is an OPTIONAL deep-review that runs only when the
  // caller explicitly passes useLLM:true. Marking usesLLM:false here
  // prevents the dashboard's derivedFallback heuristic from labelling
  // the (correct, primary, Layer-1-4) path as a fallback failure.
  guardrailAgent:       { tool: 'Local rules (Layers 1-4)', usesLLM: false },
};

// Best-effort reason extraction: agents that return a JSON response may
// already include a "reason" / "why" / "explanation" field. Surface it.
function extractReason(response) {
  if (!response) return null;
  try {
    const obj = typeof response === 'string' ? JSON.parse(response) : response;
    if (obj && typeof obj === 'object') {
      const r = obj.reason || obj.why || obj.explanation || obj.rationale || obj.justification;
      if (r) return String(r).slice(0, 220);
    }
  } catch (_) {}
  return null;
}

// Home-screen / idle agents fire on every focus event. Without a throttle
// the admin dashboard fills with duplicate wordOfDayAgent rows for a user
// who is just sitting on the home tab. We coalesce those into a single
// log per (userId, agent) per 60s. Live game agents (refereeAgent,
// wordDetailAgent, chaalbaazAgent, etc.) are NEVER throttled — every
// word found is a real, distinct event that must appear in the feed.
const THROTTLE_AGENTS = new Set(['wordOfDayAgent']);
const THROTTLE_MS = 60000;
const recentLogTs = new Map();
function shouldThrottle(agentName, userId) {
  if (!THROTTLE_AGENTS.has(agentName) || !userId) return false;
  const key = userId + '|' + agentName;
  const now = Date.now();
  const last = recentLogTs.get(key) || 0;
  if (now - last < THROTTLE_MS) return true;
  recentLogTs.set(key, now);
  if (recentLogTs.size > 5000) {
    for (const [k, t] of recentLogTs) {
      if (now - t > THROTTLE_MS * 2) recentLogTs.delete(k);
    }
  }
  return false;
}

async function insertLog(entry) {
  const sb = client();
  if (!sb) return;
  try {
    const agentName = entry.agent || 'unknown';
    const uid = (entry.meta && entry.meta.userId) || null;
    if (shouldThrottle(agentName, uid)) return;
    const tooling = AGENT_TOOLING[agentName] || { tool: 'Mixed / unknown', usesLLM: false };
    // Derive fallback: if the agent is supposed to use the LLM but no
    // model was recorded (OpenAI absent/down) we ran local logic instead.
    const explicitFallback =
      (entry.meta && (entry.meta.fallback === true || entry.meta.usedFallback === true)) ||
      false;
    const derivedFallback = tooling.usesLLM && !entry.model && entry.status === 'ok';
    const fallback = explicitFallback || derivedFallback;
    const reason =
      (entry.meta && entry.meta.reason) ||
      extractReason(entry.response) ||
      (fallback ? 'LLM unavailable — local rule-based fallback ran.' : null);
    // Enrich the meta JSON so the admin dashboard can read these without
    // a schema change.
    const enrichedMeta = {
      ...(entry.meta || {}),
      tool: (entry.meta && entry.meta.tool) || tooling.tool,
      reason,
      fallback,
    };
    const row = {
      trace_id: entry.id,
      agent: agentName,
      model: entry.model || null,
      status: entry.status || (fallback ? 'fallback' : 'ok'),
      duration_ms: entry.durationMs || 0,
      prompt_tokens: entry.tokens?.prompt || 0,
      completion_tokens: entry.tokens?.completion || 0,
      total_tokens: entry.tokens?.total || 0,
      prompt: entry.prompt || null,
      response: entry.response || null,
      error: entry.error || null,
      meta: enrichedMeta,
      created_at: entry.timestamp || new Date().toISOString(),
    };
    await sb.from('agent_logs').insert(row);
  } catch (err) {
    // swallow — observability must never break the app
  }
}

async function fetchLogs({ limit = 100, agent = null, status = null, since = null } = {}) {
  const sb = client();
  if (!sb) return [];
  try {
    let q = sb
      .from('agent_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 500));
    if (agent) q = q.eq('agent', agent);
    if (status) q = q.eq('status', status);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map((r) => ({
      id: r.trace_id || String(r.id),
      timestamp: r.created_at,
      agent: r.agent,
      model: r.model,
      status: r.status,
      durationMs: r.duration_ms,
      tokens: {
        prompt: r.prompt_tokens || 0,
        completion: r.completion_tokens || 0,
        total: r.total_tokens || 0,
      },
      prompt: r.prompt,
      response: r.response,
      error: r.error,
      meta: r.meta,
    }));
  } catch (err) {
    return [];
  }
}

async function fetchStats({ since = null } = {}) {
  const sb = client();
  if (!sb) return null;
  try {
    let q = sb.from('agent_logs').select('agent,status,duration_ms,total_tokens,created_at');
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q.limit(2000);
    if (error || !data) return null;
    const total = data.length;
    const ok = data.filter((r) => r.status === 'ok').length;
    const errors = total - ok;
    const tokens = data.reduce((s, r) => s + (r.total_tokens || 0), 0);
    const avgLatency = total
      ? Math.round(data.reduce((s, r) => s + (r.duration_ms || 0), 0) / total)
      : 0;
    const agents = {};
    for (const r of data) {
      const a = (agents[r.agent] = agents[r.agent] || { total: 0, ok: 0, err: 0, latency: 0 });
      a.total += 1;
      if (r.status === 'ok') a.ok += 1;
      else a.err += 1;
      a.latency += r.duration_ms || 0;
    }
    for (const k of Object.keys(agents)) {
      agents[k].avgLatency = Math.round(agents[k].latency / agents[k].total);
      delete agents[k].latency;
    }
    return { total, ok, errors, tokens, avgLatency, agents };
  } catch (err) {
    return null;
  }
}

async function clearLogs() {
  const sb = client();
  if (!sb) return false;
  try {
    await sb.from('agent_logs').delete().neq('id', -1);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = { insertLog, fetchLogs, fetchStats, clearLogs };
