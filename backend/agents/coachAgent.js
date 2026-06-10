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

// Detect what the player did WELL — both in THIS round and across the
// last-10-games memory. Surfaced as "good points / tricks that worked"
// on the reward screen after every match (win, loss, complete, fail).
function detectStrengths(stats, summary) {
  const strengths = [];
  const goodMoves = []; // per-round "tricks that worked"
  const completion = (stats.totalWords || 0) > 0
    ? (stats.wordsFound || 0) / stats.totalWords
    : 0;

  // ---- Per-ROUND good moves ----
  if (completion >= 1) {
    goodMoves.push('Cleared the whole board — perfect completion.');
  } else if (completion >= 0.8) {
    goodMoves.push(`Found ${Math.round(completion * 100)}% of the words — strong sweep.`);
  }
  if ((stats.hintsUsed || 0) === 0 && (stats.wordsFound || 0) >= 3) {
    goodMoves.push('Zero hints used — your brain did the work.');
  }
  if ((stats.streak || 0) >= 5) {
    goodMoves.push(`${stats.streak}-word streak — your eyes locked on quick.`);
  }
  if ((stats.timeLeft || 0) >= 20) {
    goodMoves.push(`Finished with ${stats.timeLeft}s left — fast scanning paid off.`);
  }
  if ((stats.opponentScore != null) && (stats.score || 0) > stats.opponentScore + 30) {
    goodMoves.push(`Out-scored opponent by ${(stats.score || 0) - stats.opponentScore} — clean dominance.`);
  }

  // ---- Long-term strengths from memory ----
  if (summary.strongCategories && summary.strongCategories.length) {
    strengths.push({
      key: 'strong_categories',
      label: `Strong in ${summary.strongCategories.join(', ')}`,
    });
  }
  if (summary.n >= 3 && (summary.winRate || 0) >= 0.7) {
    strengths.push({
      key: 'hot_winrate',
      label: `Win rate ${Math.round(summary.winRate * 100)}% across last ${summary.n} games`,
    });
  }
  if (summary.avgTimeLeftRatio >= 0.35 && summary.n >= 3) {
    strengths.push({
      key: 'fast_finisher',
      label: 'Consistently finishing with time to spare',
    });
  }
  if (summary.avgHintsPerRound != null && summary.avgHintsPerRound < 0.5 && summary.n >= 3) {
    strengths.push({
      key: 'low_hint_use',
      label: 'Rarely uses hints — independent solver',
    });
  }
  if (summary.avgCompletion >= 0.85 && summary.n >= 3) {
    strengths.push({
      key: 'high_completion',
      label: `Averaging ${Math.round(summary.avgCompletion * 100)}% board clears`,
    });
  }

  return { strengths, goodMoves };
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
  let outcome = String(stats.outcome || (stats.wordsFound >= stats.totalWords ? 'win' : 'session'))
    .toLowerCase();
  const language = stats.language || 'english';

  // 1. Load last-10-games memory (judges' feedback #2).
  let last10 = Array.isArray(stats.last10) ? stats.last10 : [];
  if (!last10.length && userId) {
    try { last10 = await loadLast10(userId); } catch (_) { last10 = []; }
  }
  const summary = summarizeLast10(last10);

  // Home-screen session call: pick branch from the last-10 win rate.
  // No history yet → treat as "session" so the loss/session branch fires
  // and the user gets cold-start improvement-style picks.
  if (outcome === 'session' && summary.n >= 2) {
    outcome = (summary.winRate || 0) >= 0.55 ? 'win' : 'loss';
  }

  // 2. WIN BRANCH — motivational headline PLUS a strengths-first analysis
  // (good points / tricks that worked) AND optional lite improvements
  // ("to win even bigger next time…") so the kid still learns something
  // from a winning round.
  if (outcome === 'win') {
    const local = motivationalLine(stats, summary);
    const { strengths, goodMoves } = detectStrengths(stats, summary);
    let line = local;
    let improvements = [];
    let howToFix = [];
    if (isConfigured()) {
      try {
        const prompt = `You are a friendly, kid-safe AI coach for a word puzzle game (under-13 audience).
The player just WON a ${stats.mode || 'round'}. Acknowledge the win warmly, then point out 1-2 small things they could push to make the NEXT win even bigger.

Current round:
- Mode: ${stats.mode || 'quick-play'}
- Words found: ${stats.wordsFound || 0} / ${stats.totalWords || 0}
- Time left: ${stats.timeLeft || 0}s
- Hints used: ${stats.hintsUsed || 0}
- Category: ${stats.category || 'Mix'}
- Streak this round: ${stats.streak || 0}
${stats.opponentScore != null ? `- Opponent score: ${stats.opponentScore}` : ''}

LAST ${summary.n || 0} GAMES summary:
- Win rate: ${((summary.winRate || 0) * 100).toFixed(0)}%
- Avg board completion: ${((summary.avgCompletion || 0) * 100).toFixed(0)}%
- Avg hints used per round: ${(summary.avgHintsPerRound || 0).toFixed(1)}
- Strong categories: ${(summary.strongCategories || []).join(', ') || 'none yet'}

Return STRICTLY valid JSON:
{
  "headline": "1 warm sentence celebrating the win (max 14 words)",
  "improvements": ["1-2 LITE pointers — what to push next time (max 14 words each)"],
  "howToFix":     ["1-2 short concrete actions, matched 1:1 (max 16 words each)"]
}
${language === 'english' ? 'Plain, warm English.' : 'Roman Urdu mixed with English (Pakistani coach voice).'}
Forbidden: sarcasm, harsh words, comparisons to other players, "you should have…", anything that diminishes the win.`;
        const t = await generate(prompt, { agent: 'coachAgent',
          timeoutMs: 14000, temperature: 0.6, maxTokens: 500, responseFormat: 'json' });
        const cleaned = String(t || '').replace(/```json|```/g, '').trim();
        const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}');
        if (a >= 0 && b > a) {
          const parsed = JSON.parse(cleaned.slice(a, b + 1));
          if (parsed.headline) line = String(parsed.headline);
          if (Array.isArray(parsed.improvements)) improvements = parsed.improvements.map(String);
          if (Array.isArray(parsed.howToFix)) howToFix = parsed.howToFix.map(String);
        }
      } catch (_) { /* keep local */ }
    }
    const safeHead = await guardText(line, 'tutor', { ageGroup: 'kid', userId });
    const safeImp  = await guardArray(improvements, 'tutor', { ageGroup: 'kid', userId });
    const safeFix  = await guardArray(howToFix,     'tutor', { ageGroup: 'kid', userId });
    // Momentum-style next 3 rounds — winner ko ye dikhe ki ab kya khelo:
    // tier push, 1v1, harder challenge. Different shape from loss recs.
    const winNext = [
      { mode: 'quick-play', tier: 'silver',
        title: 'Push to the Next Tier',
        rationale: 'You\'re hot — climb to a tougher tier while the streak is alive.' },
      { mode: '1v1',
        title: '1v1 Battle — Test Your Skill',
        rationale: 'Win streak detected — challenge a live opponent for MMR points.' },
      { mode: 'daily',
        title: 'Daily Challenge',
        rationale: 'Lock in your streak with today\'s fixed-difficulty round.' },
    ];
    return {
      outcome: 'win',
      headline: safeHead || local,
      motivational: true,
      strengths,
      goodMoves,
      improvements: safeImp,
      howToFix: safeFix,
      nextRounds: winNext,
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

  // Strengths + per-round good moves are surfaced on losses too — even a
  // tough round usually has a "what you did right" silver lining the kid
  // can carry into the next match.
  const { strengths: lossStrengths, goodMoves: lossGoodMoves } = detectStrengths(stats, summary);

  return {
    outcome: 'loss',
    headline: safeHead || local.headline,
    motivational: false,
    strengths: lossStrengths,
    goodMoves: lossGoodMoves,
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
