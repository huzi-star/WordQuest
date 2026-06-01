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

async function insertLog(entry) {
  const sb = client();
  if (!sb) return;
  try {
    const row = {
      trace_id: entry.id,
      agent: entry.agent || 'unknown',
      model: entry.model || null,
      status: entry.status || 'ok',
      duration_ms: entry.durationMs || 0,
      prompt_tokens: entry.tokens?.prompt || 0,
      completion_tokens: entry.tokens?.completion || 0,
      total_tokens: entry.tokens?.total || 0,
      prompt: entry.prompt || null,
      response: entry.response || null,
      error: entry.error || null,
      meta: entry.meta || null,
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
