// In-memory ring buffer for agent traces. Lives across requests within
// a single Vercel function instance — perfect for a dev dashboard.

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
  return safe;
}

function recent(limit = 100) {
  return buffer.slice(0, Math.min(limit, buffer.length));
}

function clear() { buffer.length = 0; }

module.exports = { push, recent, clear };
