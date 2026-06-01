const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://epjndqbazobrfhovhpza.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwam5kcWJhem9icmZob3ZocHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTA1MzUsImV4cCI6MjA5NDU4NjUzNX0.wX__oXkj215e-19N9V5dpJWme7SJkUa5IIl6qO1s13g';
let sb = null;
try { sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }); } catch (_) { sb = null; }

// Parent dashboard summary — Pro Max only feature, surfaces aggregate stats
// in a parent-readable format. Combines user_stats + battle ranking + learn progress.
router.get('/api/parent/summary/:userId', async (req, res) => {
  if (!sb) return res.json({ ok: false, error: 'no_db' });
  const { userId } = req.params;
  const [stats, rank, prog, lb, family] = await Promise.all([
    sb.from('user_stats').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('wq_player_ranking').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('wq_learn_progress').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('wq_user_leaderboard').select('total_score,high_score,total_games,tier').eq('user_id', userId).maybeSingle(),
    sb.from('wq_subscriptions').select('family_member_ids').eq('user_id', userId).maybeSingle(),
  ]);
  const s = stats.data || {};
  const r = rank.data || {};
  const p = prog.data || {};
  const board = lb.data || {};
  const activeDays = s.active_days || {};
  const dayKeys = Object.keys(activeDays).sort().slice(-14);
  const last14 = dayKeys.map((k) => ({ day: k, count: activeDays[k] || 0 }));
  res.json({
    ok: true,
    profile: {
      displayName: s.display_name || null,
      tier: board.tier || 'bronze',
    },
    progress: {
      highScore: s.high_score || 0,
      totalScore: s.total_score || 0,
      totalGames: s.total_games || 0,
      perfectRounds: s.perfect_rounds || 0,
      totalWords: s.total_words || 0,
      totalTimeSeconds: s.total_time || 0,
      bestStreak: s.best_streak || 0,
      maxUnlockedLevel: s.max_unlocked_level || 1,
      completedLevels: (s.completed_levels || []).length,
    },
    battle: {
      mmr: r.mmr || 1200,
      wins: r.wins || 0,
      losses: r.losses || 0,
      streak: r.streak || 0,
    },
    learning: {
      completedUnits: p.completed_unit_count || (p.completed_units || []).length || 0,
      currentUnit: p.current_unit_id || 1,
    },
    activity: {
      last14Days: last14,
    },
    family: {
      memberIds: (family.data && family.data.family_member_ids) || [],
    },
  });
});

// Family child profiles — Pro Max only. Stored as `family_member_ids[]`
// metadata + a parallel `wq_family_profiles` table for names/ages/avatars.
router.get('/api/parent/family/:userId', async (req, res) => {
  if (!sb) return res.json({ ok: true, profiles: [] });
  const { data } = await sb.from('wq_family_profiles').select('*').eq('parent_id', req.params.userId);
  res.json({ ok: true, profiles: data || [] });
});

router.post('/api/parent/family/:userId', async (req, res) => {
  if (!sb) return res.json({ ok: false });
  const { name, age, avatarColor = '#7c3aed' } = req.body || {};
  if (!name) return res.json({ ok: false, error: 'name required' });
  const { data } = await sb.from('wq_family_profiles').insert({
    parent_id: req.params.userId, name, age: age || 10, avatar_color: avatarColor,
  }).select().single();
  res.json({ ok: true, profile: data });
});

router.delete('/api/parent/family/:profileId', async (req, res) => {
  if (!sb) return res.json({ ok: false });
  await sb.from('wq_family_profiles').delete().eq('id', req.params.profileId);
  res.json({ ok: true });
});

module.exports = router;
