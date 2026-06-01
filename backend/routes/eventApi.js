// Game event ingest — the mobile app POSTs every meaningful action here
// (tier-up celebrations, quiz answers, daily words, battle results,
// subscription changes, avatar uploads, lesson completions...) so the
// `/dashboard` trace console can show the full picture of what's
// happening across the player base in real time.
//
// Stored alongside agent traces in the `agent_logs` table — the `agent`
// column becomes the event category name, prefixed with `event:` so the
// dashboard can separate AI agent runs from player events.

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Whitelist of valid event categories. Anything outside this list is
// rejected so the dashboard never gets polluted with garbage.
const VALID_CATEGORIES = new Set([
  'tier-up',          // player crossed a tier threshold
  'quiz-correct',     // single quiz question answered correctly
  'quiz-wrong',       // single quiz question answered wrong / timed out
  'quiz-session',     // full 20-question session finished
  'daily-word',       // daily challenge word found
  'daily-result',     // daily challenge finished (pass/fail)
  'quick-play',       // quick play round started / ended
  'level-complete',   // numbered level completed
  'battle-queue',     // battle queue joined
  'battle-result',    // battle finished (win/loss)
  'subscription',     // plan changed (upgrade / trial / coupon)
  'avatar-upload',    // photo or emoji avatar saved
  'learn-lesson',     // single lesson finished
  'learn-unit',       // unit (4 lessons) completed
  'auth',             // sign up / sign in / sign out
  'paywall-hit',      // player hit a paywall gate
]);

router.post('/api/event', (req, res) => {
  try {
    const {
      category,
      action,
      userId = null,
      data = {},
      durationMs = 0,
      status = 'ok',
    } = req.body || {};

    if (!category || !VALID_CATEGORIES.has(String(category))) {
      return res.status(400).json({ ok: false, error: 'invalid category' });
    }

    // Compact, readable summary so the dashboard table looks clean.
    const summary = action
      ? `${action}${userId ? ` · ${String(userId).slice(0, 8)}…` : ''}`
      : (userId ? `user ${String(userId).slice(0, 8)}…` : '(no detail)');

    logger.push({
      agent: `event:${category}`,
      model: null,
      status: status === 'error' ? 'error' : 'ok',
      durationMs: Number(durationMs) || 0,
      prompt: summary,
      response: JSON.stringify({ userId, action, ...data }, null, 2),
      meta: { category, action, userId },
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
