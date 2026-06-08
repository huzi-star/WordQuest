// chaalbaazAgent.js — Adversary "Chaalbaaz" (OpenAI gpt-4o-mini).
//
// HYBRID DESIGN (post-tier-system):
//   The player's tier is the BASE difficulty (Bronze→Master). Chaalbaaz sits
//   on top: if the player dominates inside their own tier, Chaalbaaz bumps
//   the difficulty one step (more words / smaller grid / less time). It never
//   downgrades. Sub-tier escalation only — never crosses tier boundaries.
//
// Two modes:
//   mode: "tune" → pure-logic difficulty bump (no AI call). Input is the
//                   tier-resolved difficulty + recent playerStats; output is
//                   either null (leave alone) or a partial diff to merge.
//   mode: "chat" → free-form English banter via OpenAI for ChaalbaazChatScreen.
//
// All player-facing text is English (was Roman Urdu in the legacy version).
const { generate, isConfigured } = require('../utils/llm');
const { guardText, guardInput } = require('../utils/guardrailRunner');

const SYSTEM_PERSONA = `You are "Chaalbaaz" — a witty, slightly cocky adversary
in a word puzzle game. You speak in clear, friendly English. You challenge the
player playfully, never insult, and you respect skill. Keep replies under
30 words. End most replies with a tiny challenge or quip.`;

// Decide whether the player is "dominating" inside their current tier.
// Thresholds are intentionally conservative — we only fire after the player
// has shown a real pattern of crushing puzzles, not on a single lucky round.
function isDominating(playerStats = {}, baseDifficulty = {}) {
  const {
    roundsPlayed = 0,
    avgWordsFound = 0,
    avgTimeLeft = 0,
    currentStreak = 0,
  } = playerStats;
  if (roundsPlayed < 2) return false;
  const targetWords = baseDifficulty.wordCount || 6;
  // Found 80%+ of words on average AND finished with time left.
  const crushing = avgWordsFound >= targetWords * 0.8 && avgTimeLeft >= 15;
  // Or just on a tear regardless of avg.
  const streakStrong = currentStreak >= 5;
  return crushing || streakStrong;
}

// Produce the difficulty bump. Caller already has a tier-resolved difficulty;
// we return a partial diff to MERGE on top (not a full replacement). null
// means "no bump — keep the tier baseline".
async function chaalbaazTune(payload = {}) {
  const { playerStats = {}, baseDifficulty = {} } = payload;
  if (!isDominating(playerStats, baseDifficulty)) return null;

  // One-step bump within the tier: +1 word, -10s, slightly larger grid (but
  // clamped so we don't blow past the tier's intent).
  const bumpedWords = Math.min((baseDifficulty.wordCount || 6) + 1, 12);
  const bumpedTime  = Math.max((baseDifficulty.timeLimit || 60) - 10, 25);
  const bumpedGrid  = Math.min((baseDifficulty.gridSize  || 8) + 1, 12);

  const why = (playerStats.currentStreak || 0) >= 5
    ? `Streak of ${playerStats.currentStreak} — Chaalbaaz cranked up the heat.`
    : 'You are crushing this tier — Chaalbaaz wants a real challenge.';

  return {
    difficulty: 'hard',
    wordCount: bumpedWords,
    timeLimit: bumpedTime,
    gridSize:  bumpedGrid,
    reason: why,
  };
}

async function chaalbaazChat({ history = [], message = '', playerStats = {}, userId = null }) {
  const fallback = "Hmm... thinking. I'll catch you on the next round 😏";
  // INPUT GUARDRAIL — block toxic kid input before it gets near the LLM.
  // Returning the same neutral fallback keeps Chaalbaaz from being baited
  // into producing the same content the player just tried to provoke.
  const inputCheck = await guardInput(message, 'message', { ageGroup: 'kid', userId });
  if (!inputCheck.ok) return { reply: fallback, blocked: true, reason: inputCheck.reason };
  if (!isConfigured()) return { reply: fallback };

  const turns = (history || []).slice(-6).map((t) => {
    const speaker = t.role === 'assistant' ? 'CHAALBAAZ' : 'PLAYER';
    return `${speaker}: ${String(t.text || '').slice(0, 200)}`;
  });
  const statContext = playerStats?.currentStreak
    ? ` [Player streak: ${playerStats.currentStreak}, avg words: ${(playerStats.avgWordsFound || 0).toFixed(1)}]`
    : '';

  const prompt = `${SYSTEM_PERSONA}

Conversation so far:
${turns.join('\n')}
PLAYER: ${message}${statContext}
CHAALBAAZ:`;

  try {
    const text = await generate(prompt, {
      agent: 'chaalbaazAgent',
      timeoutMs: 14000,
      temperature: 0.95,
      maxTokens: 120,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    // OUTPUT GUARDRAIL — never surface an unsafe banter line to a kid.
    const safe = await guardText(cleaned, 'message', { ageGroup: 'kid', userId });
    return { reply: (safe || fallback) };
  } catch (err) {
    return { reply: fallback };
  }
}

// Pre-round taunt shown as a modal on the Quick Play preview screen, ONLY
// when a HARD level is about to start AND the player has been crushing it.
// The modal pauses the user on the preview screen until they tap Continue,
// then the game begins.
async function chaalbaazIntro(payload = {}) {
  const { playerStats = {}, difficulty = {}, userId = null } = payload;
  const fallback = "Ho ho — getting too fast for the easy stuff! 😏 Here's a HARD challenge. Bet I catch you this round.";
  if (!isConfigured()) return { active: true, message: fallback };
  const streak = playerStats.currentStreak || 0;
  const avg = Number(playerStats.avgWordsFound || 0);
  const prompt = `${SYSTEM_PERSONA}

The player has been crushing puzzles (streak: ${streak}, avg words: ${avg.toFixed(1)}).
A HARD level is about to start (${difficulty.gridSize || 10}x${difficulty.gridSize || 10} grid, ${difficulty.wordCount || 8} words, ${difficulty.timeLimit || 50}s timer).

Write ONE short playful taunt (max 30 words, English only). Tease the player for being too fast, brag that you've raised the difficulty, and promise to catch them this round. End with a tiny challenge or quip.

CHAALBAAZ:`;
  try {
    const text = await generate(prompt, {
      agent: 'chaalbaazAgent',
      timeoutMs: 12000,
      temperature: 0.95,
      maxTokens: 80,
    });
    const cleaned = String(text || '').trim().replace(/^["']|["']$/g, '');
    const safe = await guardText(cleaned, 'message', { ageGroup: 'kid', userId });
    return { active: true, message: safe || fallback };
  } catch (_) {
    return { active: true, message: fallback };
  }
}

// Exposed so server.js can decide whether to fire the intro modal without
// duplicating the dominating-check logic.
function isPlayerDominating(playerStats, baseDifficulty) {
  return isDominating(playerStats, baseDifficulty);
}

async function chaalbaazAgent(payload = {}) {
  const { mode = 'chat' } = payload;
  if (mode === 'tune') return chaalbaazTune(payload);
  if (mode === 'intro') return chaalbaazIntro(payload);
  return chaalbaazChat(payload);
}

chaalbaazAgent.isPlayerDominating = isPlayerDominating;
module.exports = chaalbaazAgent;
