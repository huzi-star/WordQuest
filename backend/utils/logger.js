// Ring buffer + Supabase fan-out for agent traces.
// In-memory copy serves instant dashboard reads; Supabase persists
// everything across deployments and serverless cold starts.

const supa = require('./supabaseLogger');

const MAX_LOGS = 200;
const buffer = [];

function push(entry) {
  const safe = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  buffer.unshift(safe);
  if (buffer.length > MAX_LOGS) buffer.length = MAX_LOGS;
  // fire-and-forget — never await, never throw
  Promise.resolve().then(() => supa.insertLog(safe)).catch(() => {});
  return safe;
}

function recent(limit = 100) {
  return buffer.slice(0, Math.min(limit, buffer.length));
}

function clear() { buffer.length = 0; }

module.exports = { push, recent, clear };
