// coachAgent.js — Long-term-memory AI coach (judges' feedback #2).
//
// Two modes driven by `outcome`:
//   - 'win'  → one kid-safe motivational line, no critique.
//   - 'loss' → full diagnosis using the player's LAST 10 GAMES (Quick Play
//              + 1v1 Battle). Returns weaknesses, how to improve them, AND
//              an auto-generated "next 3 rounds" prescription that the
//              HomeScreen surfaces as "Recommended For You".
//
// Memory source: wq_player_memory.metrics.coach_history.last10 (managed by
// utils/coachMemory.js). Every visible string is guardrail-checked before
// it leaves the agent (under-13 audience).

const { generate, isConfigured } = require('../utils/llm');
const { guardText, guardArray } = require('../utils/guardrailRunner');
const { loadLast10, summarizeLast10 } = require('../utils/coachMemory');

// ────────────────────────────────────────────────────────────────────────
// Local (no-LLM) fallbacks — fast, deterministic, always available.
// ────────────────────────────────────────────────────────────────────────

function motivationalLine(stats, summary) {
  const lines = [
    'Sharp play — you outpaced your opponent!',
    'Big win — your focus is paying off.',
    'Clean victory — keep this momentum going!',
    'Well played — that was a confident finish.',
  ];
  if (summary.winRate >= 0.7) lines.push('Three wins in a row vibe — you are on a roll!');
  if ((stats.timeLeft || 0) > 25) lines.push('Lightning fast — that time bonus is well earned.');
  if ((stats.bestStreak || stats.streak || 0) >= 5) lines.push('Solid streak — your eyes are locked in.');
  const idx = ((stats.wordsFound || 0) + (stats.score || 0)) % lines.length;
  return lines[idx];
}

function analyzeLossLocally(stats, summary) {
  const improvements = [];
  const howToFix = [];
  const weakKeys = [];

  if (summary.lowCompletion) {
    improvements.push('You miss too many words per round.');
    howToFix.push('Scan ROW by ROW first, then COLUMNS, then DIAGONALS — slow your eyes down.');
    weakKeys.push('low_completion');
  }
  if (summary.hintHeavy) {
    improvements.push('You rely on hints too much.');
    howToFix.push('Try one round with ZERO hints — even on easy. Your brain learns when stuck.');
    weakKeys.push('hint_overuse');
  }
  if (summary.slowFinisher) {
    improvements.push('You finish with very little time on the clock.');
    howToFix.push('Read the category name FIRST — your brain pre-loads matching words.');
    weakKeys.push('time_pressure');
  }
  if (summary.weakCategories.length) {
    improvements.push(`You struggle with: ${summary.weakCategories.join(', ')}.`);
    howToFix.push(`Practice the "${summary.weakCategories[0]}" category in Practice mode — no rank risk.`);
    weakKeys.push('weak_category:' + summary.weakCategories[0]);
  }
  if (summary.battleLossStreak >= 2) {
    improvements.push(`You have lost ${summary.battleLossStreak} battles in a row.`);
    howToFix.push('Drop into Practice to rebuild speed and confidence before queuing 1v1 again.');
    weakKeys.push('battle_slump');
  }

  // Always have at least one improvement so the loss screen never looks empty.
  if (improvements.length === 0) {
    improvements.push('Close one — a couple more words and that match was yours.');
    howToFix.push('Sweep rows → columns → diagonals every single round. Speed comes with reps.');
    weakKeys.push('general');
  }

  const headline = stats.mode === '1v1'
    ? 'Tough match — let us turn this around.'
    : 'Not your round — let us fix what slipped.';

  return { headline, improvements, howToFix, weakKeys };
}

// Build the auto-generated "next 3 rounds" — judges' explicit ask.
// Recommendation shape MUST match learningPathAgent's prescribe() shape so
// HomeScreen renders them identically: { mode, title, rationale, ... }
function nextThreeRounds(stats, summary, weakKeys) {
  const recs = [];
  const seen = new Set();
  function add(r) {
    const k = r.mode + ':' + (r.category || r.tier || r.difficulty || '');
    if (seen.has(k)) return; seen.add(k); recs.push(r);
  }

  for (const k of weakKeys) {
    if (recs.length >= 3) break;
    if (k === 'low_completion') {
      add({ mode: 'practice', difficulty: 'easy',
        title: 'Easy Practice — Rebuild Completion',
        rationale: 'You missed words last game — finish a full board on easy first.' });
    } else if (k === 'hint_overuse') {
      add({ mode: 'practice', difficulty: 'easy',
        title: 'No-Hint Easy Round',
        rationale: 'Train without hints — your brain remembers patterns better.' });
    } else if (k === 'time_pressure') {
      add({ mode: 'practice', difficulty: 'medium',
        title: 'Speed-Scan Practice',
        rationale: 'Practice mode is untimed — build pattern recognition first.' });
    } else if (k.startsWith('weak_category:')) {
      const cat = k.split(':')[1];
      add({ mode: 'practice', difficulty: 'medium', category: cat,
        title: `${cat} Targeted Practice`,
        rationale: `Your weakest category lately is ${cat} — drill it directly.` });
    } else if (k === 'battle_slump') {
      add({ mode: 'practice', difficulty: 'medium',
        title: 'Cool-Down Practice',
        rationale: 'Reset after back-to-back battle losses — no rank pressure.' });
    }
  }

  // Sensible defaults to pad to 3 — never recommend the SAME mode they
  // just lost in as the very first pick.
  const justLostBattle = stats.mode === '1v1';
  const pad = justLostBattle
    ? [
      { mode: 'practice', difficulty: 'easy', title: 'Warm-up Practice',
        rationale: 'Calm round before queuing 1v1 again.' },
      { mode: 'quick-play', tier: 'bronze', title: 'Bronze Quick Play',
        rationale: 'Ranked round at a comfortable tier — rebuild MMR.' },
      { mode: '1v1', title: 'Re-match · 1v1 Battle',
        rationale: 'Once you feel sharp again, jump back in.' },
    ]
    : [
      { mode: 'practice', difficulty: 'medium', title: 'Targeted Practice',
        rationale: 'No rank risk — practice the skill you missed.' },
      { mode: 'quick-play', tier: 'bronze', title: 'Easy Bronze Run',
        rationale: 'Confidence builder — small stakes, fast feedback.' },
      { mode: '1v1', title: '1v1 Battle',
        rationale: 'Once your scanning is sharper, test it against another player.' },
    ];
  for (const r of pad) { if (recs.length >= 3) break; add(r); }
  return recs.slice(0, 3);
}

// ────────────────────────────────────────────────────────────────────────
// Public entry — coachAgent(stats)
// stats can include: outcome ('win'|'loss'|'session'), mode, userId, score,
// wordsFound, totalWords, timeLeft, hintsUsed, category, language, last10
// (optional — auto-loaded from memory if userId given and not passed).
// ────────────────────────────────────────────────────────────────────────

async function coachAgent(stats = {}) {
  const userId = stats.userId || null;
  const outcome = String(stats.outcome || (stats.wordsFound >= stats.totalWords ? 'win' : 'session'))
    .toLowerCase();
  const language = stats.language || 'english';

  // 1. Load last-10-games memory (judges' feedback #2).
  let last10 = Array.isArray(stats.last10) ? stats.last10 : [];
  if (!last10.length && userId) {
    try { last10 = await loadLast10(userId); } catch (_) { last10 = []; }
  }
  const summary = summarizeLast10(last10);

  // 2. WIN BRANCH — short motivational line, no critique.
  if (outcome === 'win') {
    const local = motivationalLine(stats, summary);
    let line = local;
    if (isConfigured()) {
      try {
        const prompt = `Kid-safe AI coach. The player JUST WON a ${stats.mode || 'word puzzle'} round.
Their recent record across last ${summary.n || 0} games: ${summary.wins} wins, ${summary.losses} losses.
Write ONE short motivational line (max 14 words). Warm, kid-friendly, no sarcasm. ${language === 'english' ? 'English.' : 'Roman Urdu mixed with English.'}
Return ONLY the line itself — no quotes, no JSON, nothing else.`;
        const t = await generate(prompt, { agent: 'coachAgent',
          timeoutMs: 12000, temperature: 0.75, maxTokens: 80 });
        const cleaned = String(t || '').replace(/^["'`\s]+|["'`\s]+$/g, '').split(/\r?\n/)[0].trim();
        if (cleaned) line = cleaned;
      } catch (_) { /* keep local */ }
    }
    const safe = await guardText(line, 'tutor', { ageGroup: 'kid', userId });
    return {
      outcome: 'win',
      headline: safe || local,
      motivational: true,
      strengths: [], improvements: [], howToFix: [], nextRounds: [],
      memoryUsed: summary.n,
    };
  }

  // 3. LOSS / SESSION BRANCH — full coach diagnosis + next 3 rounds.
  const local = analyzeLossLocally(stats, summary);
  let headline = local.headline;
  let improvements = local.improvements;
  let howToFix = local.howToFix;
  let weakKeys = local.weakKeys;

  if (isConfigured()) {
    try {
      const prompt = `You are a friendly, kid-safe AI coach for a word puzzle game (under-13 audience).
The player just LOST a ${stats.mode || 'round'}. Use the long-term memory below to give specific, actionable coaching.

Current round:
- Mode: ${stats.mode || 'quick-play'}
- Words found: ${stats.wordsFound || 0} / ${stats.totalWords || 0}
- Time left: ${stats.timeLeft || 0}s
- Hints used: ${stats.hintsUsed || 0}
- Category: ${stats.category || 'Mix'}
${stats.opponentScore != null ? `- Opponent score: ${stats.opponentScore}` : ''}

LAST ${summary.n} GAMES summary:
- Win rate: ${(summary.winRate * 100).toFixed(0)}%
- Avg board completion: ${(summary.avgCompletion * 100).toFixed(0)}%
- Avg hints used per round: ${summary.avgHintsPerRound.toFixed(1)}
- Avg time-left ratio: ${(summary.avgTimeLeftRatio * 100).toFixed(0)}%
- Current loss streak: ${summary.lossStreak}
- Weak categories: ${summary.weakCategories.join(', ') || 'none yet'}
- Strong categories: ${summary.strongCategories.join(', ') || 'none yet'}

Return STRICTLY valid JSON:
{
  "headline": "single warm sentence acknowledging the loss (max 14 words)",
  "improvements": ["2-3 SPECIFIC weaknesses spotted from the memory above (max 14 words each)"],
  "howToFix":     ["2-3 CONCRETE actions matched 1:1 to the improvements above (max 16 words each)"]
}
${language === 'english' ? 'Plain, encouraging English.' : 'Roman Urdu mixed with English (Pakistani trainer voice).'}
Forbidden: sarcasm, harsh words, comparisons to other players, any mention of failure as identity.`;

      const text = await generate(prompt, { agent: 'coachAgent',
        timeoutMs: 16000, temperature: 0.6, maxTokens: 700, responseFormat: 'json' });
      const cleaned = String(text || '').replace(/```json|```/g, '').trim();
      const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}');
      if (a >= 0 && b > a) {
        const parsed = JSON.parse(cleaned.slice(a, b + 1));
        if (parsed.headline) headline = String(parsed.headline);
        if (Array.isArray(parsed.improvements) && parsed.improvements.length) {
          improvements = parsed.improvements.map(String);
        }
        if (Array.isArray(parsed.howToFix) && parsed.howToFix.length) {
          howToFix = parsed.howToFix.map(String);
        }
      }
    } catch (_) { /* keep local */ }
  }

  // 4. Guardrail every visible string (kid age group).
  const safeHead = await guardText(headline, 'tutor', { ageGroup: 'kid', userId });
  const safeImp  = await guardArray(improvements, 'tutor', { ageGroup: 'kid', userId });
  const safeFix  = await guardArray(howToFix,     'tutor', { ageGroup: 'kid', userId });

  // 5. Auto-generated next 3 rounds (judges' explicit ask).
  const nextRounds = nextThreeRounds(stats, summary, weakKeys);

  return {
    outcome: 'loss',
    headline: safeHead || local.headline,
    motivational: false,
    strengths: [],
    improvements: safeImp.length ? safeImp : local.improvements,
    howToFix:    safeFix.length ? safeFix : local.howToFix,
    nextRounds,
    memoryUsed: summary.n,
    summary: {
      winRate: summary.winRate,
      lossStreak: summary.lossStreak,
      weakCategories: summary.weakCategories,
      hintHeavy: summary.hintHeavy,
      slowFinisher: summary.slowFinisher,
      lowCompletion: summary.lowCompletion,
    },
    // Back-compat: older callers (battleApi loserLine) read .improvements[0]
    practice: [], nextMove: '',
  };
}

module.exports = coachAgent;
