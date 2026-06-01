// Fire-and-forget event tracing.
//
// Every meaningful in-game action calls trace(category, action, data) —
// the helper POSTs to /api/event on the backend, where the entry is
// persisted to `agent_logs` and rendered live on the /dashboard page.
//
// Failures are completely silent — observability must never break the
// game. The promise is intentionally not awaited at call sites.

import { client } from './api';

// Whitelist mirrors backend/routes/eventApi.js. Helps catch typos early.
const VALID_CATEGORIES = new Set([
  'tier-up',
  'quiz-correct', 'quiz-wrong', 'quiz-session',
  'daily-word', 'daily-result',
  'quick-play',
  'level-complete',
  'battle-queue', 'battle-result',
  'subscription',
  'avatar-upload',
  'learn-lesson', 'learn-unit',
  'auth',
  'paywall-hit',
]);

export function trace(category, action, data = {}, opts = {}) {
  if (!VALID_CATEGORIES.has(category)) return;
  const { userId = null, durationMs = 0, status = 'ok' } = opts;
  // No await — this is fire-and-forget. The catch makes sure rejected
  // promises never bubble up as an unhandled-promise warning.
  client.post('/api/event', {
    category,
    action: String(action || '').slice(0, 80),
    userId,
    durationMs,
    status,
    data,
  }).catch(() => {});
}
