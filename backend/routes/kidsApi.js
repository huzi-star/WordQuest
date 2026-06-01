// WordQuest Kids — vocabulary tier game REST API.
// Mounted under no prefix; every endpoint lives at /api/kids/*.

const express = require('express');
const router = express.Router();

const { TIERS, getTier, tierForTotalXp } = require('../config/tiers');
const kidWordAgent = require('../agents/kidWordAgent');
const kidQuestionAgent = require('../agents/kidQuestionAgent');
const db = require('../utils/kidsDb');

// ---------- meta ----------
router.get('/api/kids/tiers', (_req, res) => {
  res.json({
    ok: true,
    tiers: TIERS.map((t) => ({
      key: t.key, name: t.name, rank: t.rank, ageRange: t.ageRange,
      xpToNext: isFinite(t.xpToNext) ? t.xpToNext : null,
      color: t.color, accent: t.accent, emoji: t.emoji,
    })),
  });
});

// ---------- user bootstrap ----------
router.post('/api/kids/user/sync', async (req, res) => {
  const { id, username, email, avatarColor } = req.body || {};
  if (!id || !username) return res.status(400).json({ ok: false, error: 'id and username required' });
  const user = await db.upsertUser({ id, username, email, avatarColor });
  const profile = await db.getProfile(id);
  res.json({ ok: true, user, profile });
});

router.get('/api/kids/profile/:userId', async (req, res) => {
  const profile = await db.getProfile(req.params.userId);
  if (!profile) return res.status(404).json({ ok: false });
  const history = await db.wordHistory({ userId: req.params.userId, limit: 30 });
  res.json({ ok: true, ...profile, history });
});

// ---------- words ----------
router.get('/api/kids/words/:tier', async (req, res) => {
  const tier = getTier(req.params.tier);
  let words = await db.listWords({ tier: tier.key, limit: 40 });
  const fresh = await db.isCacheFresh({ tier: tier.key });
  if (!fresh || words.length < 10) {
    const avoid = words.map((w) => w.word);
    const generated = await kidWordAgent({ tier: tier.key, count: 10, avoid });
    if (generated.words?.length) {
      await db.upsertWords(generated.words);
      words = await db.listWords({ tier: tier.key, limit: 40 });
    }
  }
  res.json({ ok: true, tier: tier.key, count: words.length, words });
});

router.post('/api/kids/words/generate', async (req, res) => {
  const { tier = 'bronze', count = 10 } = req.body || {};
  const existing = await db.listWords({ tier, limit: 40 });
  const avoid = existing.map((w) => w.word);
  const generated = await kidWordAgent({ tier, count, avoid });
  const inserted = generated.words?.length ? await db.upsertWords(generated.words) : 0;
  res.json({ ok: true, generated: generated.words?.length || 0, inserted });
});

// ---------- one playable round ----------
//
// Returns a freshly built question for a random word in the player's
// current tier. Frontend should call this every turn.
router.get('/api/kids/play/next', async (req, res) => {
  const userId = req.query.userId ? String(req.query.userId) : null;
  let tierKey = req.query.tier ? String(req.query.tier) : null;

  if (!tierKey && userId) {
    const profile = await db.getProfile(userId);
    tierKey = profile?.tier?.key || 'bronze';
  }
  if (!tierKey) tierKey = 'bronze';

  let words = await db.listWords({ tier: tierKey, limit: 40 });
  if (words.length < 6) {
    const generated = await kidWordAgent({ tier: tierKey, count: 10, avoid: words.map((w) => w.word) });
    if (generated.words?.length) {
      await db.upsertWords(generated.words);
      words = await db.listWords({ tier: tierKey, limit: 40 });
    }
  }
  if (!words.length) return res.status(503).json({ ok: false, error: 'No words available' });

  const card = words[Math.floor(Math.random() * words.length)];
  const others = words.filter((w) => w.id !== card.id);

  const types = ['meaning', 'synonym', 'antonym', 'fillblank'].filter((t) => {
    if (t === 'synonym' && !card.synonym) return false;
    if (t === 'antonym' && !card.antonym) return false;
    if (t === 'fillblank' && !card.example) return false;
    return true;
  });
  const type = types[Math.floor(Math.random() * types.length)] || 'meaning';

  const question = await kidQuestionAgent({ card, type, otherWords: others });
  res.json({ ok: true, tier: tierKey, card: { id: card.id, word: card.word, tier: card.tier }, question, fullCard: card });
});

// ---------- record answer ----------
router.post('/api/kids/play/answer', async (req, res) => {
  const { userId, wordId, questionType, isCorrect, responseTimeMs = 0 } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });

  let xp = 0;
  if (isCorrect) {
    xp = responseTimeMs && responseTimeMs < 5000 ? 15 : 10;
  }

  const profile = await db.getProfile(userId);
  const tierKey = profile?.tier?.key || 'bronze';

  // streak bonus is applied based on the *new* streak after this answer
  const streakBefore = profile?.progress?.current_streak || 0;
  if (isCorrect) {
    const newStreak = streakBefore + 1;
    if (newStreak === 3) xp += 5;
    if (newStreak === 5) xp += 10;
  }

  await db.recordAnswer({ userId, wordId, questionType, isCorrect, responseTimeMs, xpEarned: xp, tier: tierKey });
  const update = await db.applyXp({ userId, xpDelta: xp, correct: !!isCorrect });

  res.json({
    ok: true,
    xpEarned: xp,
    newTotalXp: update?.total_xp || 0,
    tierXp: update?.tier_xp || 0,
    currentTier: update?.current_tier || tierKey,
    streak: update?.current_streak || 0,
    tierUp: !!update?.tierUp,
    newTier: update?.newTier || null,
  });
});

// ---------- leaderboard ----------
router.get('/api/kids/leaderboard/:tier', async (req, res) => {
  const tier = getTier(req.params.tier).key;
  const userId = req.query.userId ? String(req.query.userId) : null;
  const top = await db.leaderboard({ tier, limit: 25 });
  let mine = null;
  if (userId) {
    mine = await db.myRank({ userId, tier });
  }
  res.json({ ok: true, tier, top, me: mine });
});

module.exports = router;
