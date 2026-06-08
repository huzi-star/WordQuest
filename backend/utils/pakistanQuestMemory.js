// pakistanQuestMemory.js — per-section long-term memory for Pakistan Quest.
//
// Each player has independent memory per category (cities, food, sports,
// heroes, inventions, history, vocabulary). Memory stores the LAST 10
// finished games for that section, the difficulty used, the words shown,
// and pass/fail. From that we:
//
//   1) Pick the next difficulty (adaptive ladder, never random):
//        - cold start  → easy
//        - last pass   → bump up (easy → medium → hard, capped)
//        - last fail   → bump down (hard → medium → easy, floored)
//   2) Pick the next puzzle words:
//        - hide every word seen in the last 10 games for THAT section
//        - once the unseen pool is too small for the puzzle size, allow
//          at most ~10% old words back in
//        - hand the final list to guardrailAgent (kid floor) too
//
// Storage lives in the existing Supabase row `wq_player_memory.metrics`
// under a dedicated `pakistan_quest` sub-object so it never collides with
// the learning-path metrics in the same row. No SQL migration needed.

const { createClient } = require('@supabase/supabase-js');
const { CATEGORIES, pickWords } = require('../config/pakistanPack');
const { guardArray } = require('./guardrailRunner');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://epjndqbazobrfhovhpza.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwam5kcWJhem9icmZob3ZocHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTA1MzUsImV4cCI6MjA5NDU4NjUzNX0.wX__oXkj215e-19N9V5dpJWme7SJkUa5IIl6qO1s13g';

let _sb = null;
function client() {
  if (_sb) return _sb;
  try { _sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }); }
  catch (_) { _sb = null; }
  return _sb;
}

// Difficulty puzzle config — UNIFORM across all 7 sections per spec:
//   - 75 seconds time-limit
//   - 5 words per round
// Only the GRID SIZE and WORD-LENGTH RANGE change with difficulty so the
// kid feels the round getting harder (bigger grid + longer words) while
// the rules stay consistent and predictable.
const DIFFICULTY_CFG = {
  easy:   { gridSize: 7,  wordCount: 5, timeLimit: 75, minLen: 4, maxLen: 6 },
  medium: { gridSize: 9,  wordCount: 5, timeLimit: 75, minLen: 5, maxLen: 8 },
  hard:   { gridSize: 11, wordCount: 5, timeLimit: 75, minLen: 6, maxLen: 9 },
};
const DIFF_ORDER = ['easy', 'medium', 'hard'];

// ---- Memory I/O ----------------------------------------------------------

const EMPTY_SECTION = () => ({ last10: [], lastDifficulty: null });

// Returns the entire pakistan_quest sub-object plus a save() closure that
// upserts the change back to wq_player_memory.metrics.pakistan_quest.
async function loadMemory(userId) {
  const sb = client();
  if (!sb || !userId) {
    // No DB / anonymous play — operate against an ephemeral object so the
    // round still runs but nothing persists across requests.
    const ephemeral = { sections: {} };
    return { mem: ephemeral, save: async () => {} };
  }
  let metrics = {};
  try {
    const { data } = await sb.from('wq_player_memory').select('metrics, category_stats, weaknesses, strengths, recommendations, sessions_logged, last_updated').eq('user_id', userId).maybeSingle();
    if (data?.metrics) metrics = data.metrics;
  } catch (_) {}
  const pak = metrics.pakistan_quest || { sections: {} };
  if (!pak.sections) pak.sections = {};
  for (const cat of CATEGORIES) {
    if (!pak.sections[cat.key]) pak.sections[cat.key] = EMPTY_SECTION();
  }
  async function save(updatedPak) {
    try {
      // Re-read the row so we don't trample the learning-path agent's
      // concurrent writes to the same `metrics` blob.
      const { data: row } = await sb.from('wq_player_memory').select('metrics').eq('user_id', userId).maybeSingle();
      const mergedMetrics = { ...((row && row.metrics) || {}), pakistan_quest: updatedPak };
      await sb.from('wq_player_memory').upsert({
        user_id: userId,
        metrics: mergedMetrics,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    } catch (_) { /* best-effort; never block gameplay on memory writes */ }
  }
  return { mem: pak, save };
}

// ---- Difficulty ladder ---------------------------------------------------

// Adaptive rule. Brand-new section → easy. After the first finished game,
// pass bumps up, fail drops down. The cap/floor mean no "skip-medium" jumps.
function decideDifficulty(sectionMem) {
  const last10 = (sectionMem && sectionMem.last10) || [];
  if (!last10.length) return 'easy';
  const last = last10[last10.length - 1];
  const cur = last.difficulty || sectionMem.lastDifficulty || 'easy';
  const idx = DIFF_ORDER.indexOf(cur);
  const safeIdx = idx < 0 ? 0 : idx;
  if (last.passed) return DIFF_ORDER[Math.min(DIFF_ORDER.length - 1, safeIdx + 1)];
  return DIFF_ORDER[Math.max(0, safeIdx - 1)];
}

// ---- Word picker with last-10 repeat suppression -------------------------

function recentWordSetFor(sectionMem) {
  const s = new Set();
  for (const g of (sectionMem.last10 || [])) {
    for (const w of (g.words || [])) s.add(String(w).toUpperCase());
  }
  return s;
}

// Pick the words for the next round of this category:
//   1) Build a difficulty-appropriate length-filtered pool from pakistanPack.
//   2) Remove words the player has seen in the last 10 games for this
//      section. If the resulting pool has enough words for the puzzle,
//      use only unseen words (fully fresh round).
//   3) If unseen pool is too small, top up with the LEAST recently used
//      old words — capped at ~10% of the puzzle size (rounded up so a
//      4-word easy round can still borrow 1 old word at most).
//   4) Hand the final list to guardrailAgent so any future pack edit that
//      accidentally introduces unsafe text is still blocked at the floor.
async function pickWordsForRound({ userId, categoryKey, difficulty, sectionMem }) {
  const cfg = DIFFICULTY_CFG[difficulty] || DIFFICULTY_CFG.easy;
  const cat = CATEGORIES.find((c) => c.key === categoryKey);
  if (!cat) return { words: [], cfg };

  function shuffle(a) { return [...a].sort(() => Math.random() - 0.5); }

  // Build a length-filtered pool. If the strict difficulty bucket doesn't
  // hold enough words AFTER excluding the user's last-10, widen the range
  // gradually so the round still feels at the right level but never fails.
  const seen = recentWordSetFor(sectionMem);
  const buildPool = (minLen, maxLen) => cat.words
    .filter((w) => w.word.length >= minLen && w.word.length <= maxLen)
    .map((w) => w.word.toUpperCase());

  // Three length ranges, widest last. The first one is the strict
  // difficulty bucket; widening kicks in only if the user has exhausted
  // it via the no-repeat policy.
  const ranges = [
    [cfg.minLen, cfg.maxLen],
    [Math.max(4, cfg.minLen - 1), Math.min(11, cfg.maxLen + 1)],
    [4, 11],
  ];

  let pool = [];
  let unseen = [];
  for (const [a, b] of ranges) {
    pool = buildPool(a, b);
    unseen = pool.filter((w) => !seen.has(w));
    if (unseen.length >= cfg.wordCount) break;
  }

  let chosen = shuffle(unseen).slice(0, cfg.wordCount);
  const repeatPool = pool.filter((w) => seen.has(w));

  if (chosen.length < cfg.wordCount) {
    // Unseen pool genuinely empty even after widening — borrow the OLDEST
    // recently-seen words first. Cap repeats at ~10% so the player still
    // sees mostly new words.
    const maxRepeats = Math.max(1, Math.ceil(cfg.wordCount * 0.10));
    const orderedOld = orderByOldestSeen(repeatPool, sectionMem);
    const need = cfg.wordCount - chosen.length;
    const borrow = orderedOld.slice(0, Math.min(need, maxRepeats));
    chosen = chosen.concat(borrow);
    if (chosen.length < cfg.wordCount) {
      // Last-resort: pull from the widest pool ignoring repeats so the
      // game still runs. Will be rare with the expanded curated pack.
      const remaining = buildPool(4, 11).filter((w) => !chosen.includes(w));
      chosen = chosen.concat(shuffle(remaining).slice(0, cfg.wordCount - chosen.length));
    }
  }

  // SAFETY GUARDRAIL — per-section context so the safety / age-cap rules
  // run with section-aware logging. We deliberately scope the `userId`
  // passed here to `<userId>::pq:<categoryKey>` so the guardrail's global
  // last-80-items repeat window is scoped PER section. Without this
  // scoping, a long Quick Play streak would pollute Cities' guardrail
  // history and silently drop fresh Cities words. Section memory already
  // does the primary no-repeat check via last10 before this guardrail
  // pass — this scoping just prevents the secondary guardrail from
  // shrinking the result count.
  const ctx = `pakistan-quest:${categoryKey}`;
  const scopedUser = userId ? `${userId}::pq:${categoryKey}` : null;
  chosen = await guardArray(chosen, 'word', { ageGroup: 'kid', userId: scopedUser, context: ctx });

  // If guardrail trimmed any items, top up so the kid sees the full
  // expected count. Top-up uses pickWords (which also length-filters)
  // and skips any word we already have. Guarantees we never ship a
  // short round to the mobile client.
  if (chosen.length < cfg.wordCount) {
    const topUp = pickWords(categoryKey, cfg.wordCount * 2, 4, 11)
      .filter((w) => !chosen.includes(w.toUpperCase()))
      .slice(0, cfg.wordCount - chosen.length);
    chosen = chosen.concat(topUp.map((w) => w.toUpperCase()));
  }
  // Absolute last resort: if STILL short (essentially impossible given
  // the curated pack size), allow anything from the whole pool.
  if (chosen.length < cfg.wordCount) {
    const allCat = cat.words.map((w) => w.word.toUpperCase());
    const remainder = allCat.filter((w) => !chosen.includes(w));
    chosen = chosen.concat(shuffle(remainder).slice(0, cfg.wordCount - chosen.length));
  }

  // De-dupe defensively (some fallback paths might union with already-chosen).
  chosen = Array.from(new Set(chosen)).slice(0, cfg.wordCount);
  return { words: chosen, cfg };
}

// Sort a list of repeat-eligible words from OLDEST-seen to MOST-RECENTLY-seen.
function orderByOldestSeen(words, sectionMem) {
  const lastSeenAt = new Map();
  const games = sectionMem.last10 || [];
  for (let i = 0; i < games.length; i++) {
    for (const w of (games[i].words || [])) {
      lastSeenAt.set(String(w).toUpperCase(), i); // higher i = more recent
    }
  }
  return [...words].sort((a, b) => (lastSeenAt.get(a) || 0) - (lastSeenAt.get(b) || 0));
}

// ---- Result writer -------------------------------------------------------

// Append the finished game to this section's last10 (drops the oldest if
// over 10). Persists back to Supabase.
async function recordResult({ userId, categoryKey, difficulty, passed, words, score }) {
  if (!userId || !categoryKey) return null;
  const { mem, save } = await loadMemory(userId);
  const section = mem.sections[categoryKey] || EMPTY_SECTION();
  section.last10 = (section.last10 || []).slice(-9);
  section.last10.push({
    difficulty: difficulty || 'easy',
    passed: !!passed,
    words: (words || []).map((w) => String(w).toUpperCase()),
    score: Number(score) || 0,
    ts: new Date().toISOString(),
  });
  section.lastDifficulty = difficulty || 'easy';
  mem.sections[categoryKey] = section;
  await save(mem);
  return section;
}

module.exports = {
  DIFFICULTY_CFG,
  DIFF_ORDER,
  loadMemory,
  decideDifficulty,
  pickWordsForRound,
  recordResult,
};
