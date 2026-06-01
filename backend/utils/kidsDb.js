// Supabase data access for the kids vocabulary game.
// One thin module that owns all reads/writes for wq_kids_* tables.

const { createClient } = require('@supabase/supabase-js');
const { getTier, tierForTotalXp, nextTier } = require('../config/tiers');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://epjndqbazobrfhovhpza.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwam5kcWJhem9icmZob3ZocHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTA1MzUsImV4cCI6MjA5NDU4NjUzNX0.wX__oXkj215e-19N9V5dpJWme7SJkUa5IIl6qO1s13g';

let sb = null;
function client() {
  if (sb) return sb;
  try { sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }); }
  catch (_) { sb = null; }
  return sb;
}

const FRESH_MS = 24 * 60 * 60 * 1000; // 24h cache window

async function upsertUser({ id, username, email, avatarColor }) {
  const s = client(); if (!s) return null;
  const { data, error } = await s
    .from('wq_kids_users')
    .upsert({ id, username, email, avatar_color: avatarColor || '#7c3aed' }, { onConflict: 'id' })
    .select()
    .single();
  if (error) return null;
  // ensure progress row
  await s.from('wq_kids_progress').upsert(
    { user_id: id, current_tier: 'bronze', total_xp: 0, tier_xp: 0 },
    { onConflict: 'user_id', ignoreDuplicates: true },
  );
  return data;
}

async function getProfile(userId) {
  const s = client(); if (!s) return null;
  const [{ data: user }, { data: prog }] = await Promise.all([
    s.from('wq_kids_users').select('*').eq('id', userId).single(),
    s.from('wq_kids_progress').select('*').eq('user_id', userId).single(),
  ]);
  if (!user) return null;
  const tier = getTier(prog?.current_tier || 'bronze');
  const nxt = nextTier(tier.key);
  return {
    user,
    progress: prog || { user_id: userId, current_tier: 'bronze', total_xp: 0, tier_xp: 0 },
    tier,
    nextTier: nxt,
  };
}

async function listWords({ tier, limit = 30 }) {
  const s = client(); if (!s) return [];
  const { data } = await s
    .from('wq_kids_words_cache')
    .select('*')
    .eq('tier', tier)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

async function isCacheFresh({ tier }) {
  const s = client(); if (!s) return false;
  const { data } = await s
    .from('wq_kids_words_cache')
    .select('created_at')
    .eq('tier', tier)
    .order('created_at', { ascending: false })
    .limit(1);
  if (!data || !data.length) return false;
  return Date.now() - new Date(data[0].created_at).getTime() < FRESH_MS;
}

async function upsertWords(words) {
  const s = client(); if (!s || !words.length) return 0;
  const { data, error } = await s
    .from('wq_kids_words_cache')
    .upsert(words, { onConflict: 'lower(word),tier', ignoreDuplicates: true })
    .select();
  if (error) {
    // fallback if pg doesn't allow the expression target — insert ignoring duplicates per-row
    let count = 0;
    for (const w of words) {
      const { error: e } = await s.from('wq_kids_words_cache').insert(w);
      if (!e) count += 1;
    }
    return count;
  }
  return (data || []).length;
}

async function recordAnswer({ userId, wordId, questionType, isCorrect, responseTimeMs, xpEarned, tier }) {
  const s = client(); if (!s) return null;
  await s.from('wq_kids_answers').insert({
    user_id: userId,
    word_id: wordId,
    question_type: questionType,
    is_correct: !!isCorrect,
    response_time_ms: responseTimeMs || 0,
    xp_earned: xpEarned || 0,
    tier,
  });
}

async function applyXp({ userId, xpDelta, correct }) {
  const s = client(); if (!s) return null;
  const { data: prog } = await s.from('wq_kids_progress').select('*').eq('user_id', userId).single();
  if (!prog) return null;

  let totalXp = (prog.total_xp || 0) + xpDelta;
  let tierXp = (prog.tier_xp || 0) + xpDelta;
  let currentTier = prog.current_tier || 'bronze';
  let streak = correct ? (prog.current_streak || 0) + 1 : 0;
  const longest = Math.max(prog.longest_streak || 0, streak);
  const wordsLearned = (prog.words_learned_count || 0) + (correct ? 1 : 0);

  let tierUp = false;
  let fromTier = currentTier;
  // promote loop in case of large XP gain
  while (true) {
    const t = getTier(currentTier);
    if (!isFinite(t.xpToNext)) break;
    if (tierXp >= t.xpToNext) {
      const nxt = nextTier(currentTier);
      if (!nxt) break;
      fromTier = currentTier;
      currentTier = nxt.key;
      tierXp = tierXp - t.xpToNext;
      tierUp = true;
      await s.from('wq_kids_tier_history').insert({ user_id: userId, from_tier: fromTier, to_tier: currentTier });
    } else break;
  }

  const update = {
    total_xp: totalXp,
    tier_xp: tierXp,
    current_tier: currentTier,
    current_streak: streak,
    longest_streak: longest,
    words_learned_count: wordsLearned,
    last_played_at: new Date().toISOString(),
  };
  await s.from('wq_kids_progress').update(update).eq('user_id', userId);

  return {
    ...update,
    tierUp,
    newTier: tierUp ? getTier(currentTier) : null,
  };
}

async function leaderboard({ tier, limit = 25 }) {
  const s = client(); if (!s) return [];
  const { data } = await s
    .from('wq_kids_leaderboard')
    .select('*')
    .eq('current_tier', tier)
    .order('tier_rank', { ascending: true })
    .limit(limit);
  return data || [];
}

async function myRank({ userId, tier }) {
  const s = client(); if (!s) return null;
  const { data } = await s
    .from('wq_kids_leaderboard')
    .select('*')
    .eq('current_tier', tier)
    .eq('user_id', userId)
    .single();
  return data || null;
}

async function wordHistory({ userId, limit = 50 }) {
  const s = client(); if (!s) return [];
  const { data } = await s
    .from('wq_kids_answers')
    .select('word_id, is_correct, question_type, xp_earned, created_at, wq_kids_words_cache!inner(word, tier, meaning)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

module.exports = {
  client,
  upsertUser,
  getProfile,
  listWords,
  isCacheFresh,
  upsertWords,
  recordAnswer,
  applyXp,
  leaderboard,
  myRank,
  wordHistory,
};
