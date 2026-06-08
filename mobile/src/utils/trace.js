// Fire-and-forget event tracing.
//
// Every meaningful in-game action calls trace(category, action, data) —
// the helper POSTs to /api/event on the backend, where the entry is
// persisted to `agent_logs` and rendered live on the /dashboard page.
//
// Failures are completely silent — observability must never break the
// game. The promise is intentionally not awaited at call sites.

import { client } from './api';
import { supabase } from './supabase';

// Cached for the lifetime of the JS bundle. The kid's user id never
// changes mid-session — once we've read it, every subsequent trace()
// can attach it without another auth round-trip.
let cachedUid = null;
async function resolveCurrentUserId() {
  if (cachedUid) return cachedUid;
  try {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) {
      cachedUid = data.user.id;
      return cachedUid;
    }
  } catch (_) { /* ignore — fall through to null */ }
  return null;
}

// Whitelist mirrors backend/routes/eventApi.js. Helps catch typos early.
const VALID_CATEGORIES = new Set([
  'tier-up',
  'quiz-correct', 'quiz-wrong', 'quiz-session',
  'daily-word', 'daily-result',
  'quick-play',
  'quick-play-fail',
  'practice',
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
  // Auto-resolve current user from supabase session when the caller
  // didn't pass one. This is what guarantees every event the admin
  // dashboard receives carries the kid's real id (and therefore the
  // dashboard can resolve their display_name + avatar correctly).
  (async () => {
    const uid = userId || (await resolveCurrentUserId());
    try {
      await client.post('/api/event', {
        category,
        action: String(action || '').slice(0, 80),
        userId: uid,
        durationMs,
        status,
        data,
      });
    } catch (_) { /* observability never breaks the game */ }
  })();
}
