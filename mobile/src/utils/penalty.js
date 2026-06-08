// Quick Play fail penalty.
//
// When a Quick Play round ends without all words found (timer ran out OR
// the player quit mid-round), deduct a PROPORTIONAL penalty based on how
// much of the round the player missed:
//
//   wordsRemaining = totalWords - wordsFound
//   failPercent    = wordsRemaining / totalWords
//   penalty        = round(failPercent * 20)   (clamped to 1..20)
//
// 100% missed → 20 pts off. 25% missed → 5 pts off. 0% missed = WIN, no fail.
//
// The penalty is taken off totalScoreEver (= tier_points + leaderboard_score
// driver) — high_score is NEVER touched. If the deduction drops the player
// below their current tier's minimum, demote them and align lastSeenTier
// so future TierUp celebrations still fire when they climb back up.

import { loadStats, deductScorePoints, markTierSeen } from './storage';
import { tierForScore, tierDownDelta } from './tiers';
import { supabase, upsertStats } from './supabase';
import { leaderboardUpsert } from './api';
import { trace } from './trace';

// Maximum penalty when the player found ZERO words. Anything found
// proportionally reduces the deduction. Minimum stays at 1 so a fail
// always costs SOMETHING.
export const QUICK_PLAY_MAX_PENALTY = 20;

export function computeQuickPlayPenalty(wordsFound, totalWords) {
  const total = Math.max(1, Number(totalWords) || 0);
  const found = Math.max(0, Math.min(total, Number(wordsFound) || 0));
  const remaining = total - found;
  if (remaining <= 0) return 0; // perfect round — no penalty
  const failPercent = remaining / total;
  const raw = Math.round(failPercent * QUICK_PLAY_MAX_PENALTY);
  return Math.max(1, Math.min(QUICK_PLAY_MAX_PENALTY, raw));
}

export async function applyQuickPlayFailPenalty(settings = {}, ctx = {}) {
  const before = await loadStats();
  const prevTotal = before.totalScoreEver || 0;
  const prevTier = tierForScore(prevTotal);

  // Proportional penalty — caller supplies wordsFound + totalWords.
  // Fallback to the full 20 if the caller forgot to pass them (so the
  // old behaviour still applies on quit-without-context paths).
  const wordsFound = Number(ctx.wordsFound) || 0;
  const totalWords = Number(ctx.totalWords) || 0;
  const penalty = totalWords > 0
    ? computeQuickPlayPenalty(wordsFound, totalWords)
    : QUICK_PLAY_MAX_PENALTY;
  if (penalty <= 0) return null;
  const completionPct = totalWords > 0
    ? Math.round((wordsFound / totalWords) * 100)
    : 0;

  const after = await deductScorePoints(penalty);
  if (!after) return null;

  const newTotal = after.totalScoreEver || 0;
  const newTier = tierForScore(newTotal);
  const downgrade = tierDownDelta(prevTier.key, newTotal);

  // If demoted, reset lastSeenTier to the new (lower) tier so the next
  // TierUp celebration fires correctly when the player climbs back.
  if (downgrade) await markTierSeen(newTier.key);

  trace('quick-play-fail', 'penalty', {
    penalty,
    wordsFound, totalWords, completionPct,
    prevTotal,
    newTotal,
    prevTier: prevTier.key,
    newTier: newTier.key,
    downgrade: !!downgrade,
  });

  // Push the updated stats + leaderboard row to Supabase immediately so
  // the player's rank drops on every device.
  try {
    if (supabase) {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (uid) {
        await upsertStats(uid, after, settings || {});
        const displayName =
          u.user.user_metadata?.display_name ||
          u.user.user_metadata?.full_name ||
          (u.user.email ? u.user.email.split('@')[0] : 'Player');
        await leaderboardUpsert({
          userId: uid,
          displayName,
          avatarColor: settings?.avatarColor || null,
          avatarUrl: settings?.avatarUrl || null,
          avatarEmoji: settings?.avatarEmoji || null,
          totalScore: newTotal,
          highScore: after.highScore || 0,
          totalGames: after.totalGamesPlayed || 0,
        });
      }
    }
  } catch (_) {}

  return {
    penalty,
    wordsFound,
    totalWords,
    completionPct,
    prevTotal,
    newTotal,
    prevTier: prevTier.key,
    newTier: newTier.key,
    downgrade,
  };
}

// Back-compat alias so any imports still resolve. Equal to the cap, not
// the actual round penalty (which is computed per-round now).
export const QUICK_PLAY_FAIL_PENALTY = QUICK_PLAY_MAX_PENALTY;
