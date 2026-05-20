// chaalbaazAgent.js — Adversary "Chaalbaaz" (OpenAI gpt-4o-mini).
//
// Two modes:
//   mode: "tune" → pure-logic difficulty escalation (no AI call)
//   mode: "chat" → free-form banter via OpenAI

const { generate, isConfigured } = require('../utils/llm');

const SYSTEM_PERSONA = `You are "Chaalbaaz" — a witty, slightly cocky adversary
in a Pakistani word puzzle game. You speak in Roman Urdu mixed with English,
like a friendly trash-talking street smart character. You challenge the
player playfully, never insult, and you respect skill. Keep replies under
30 words. End most replies with a tiny challenge or quip.`;

const TUNE_FALLBACK = {
  difficulty: 'hard',
  timeLimit: 40,
  wordCount: 6,
  reason: 'Chaalbaaz keh raha — tum easy ho, ab hard challenge!',
};

async function chaalbaazTune(playerStats = {}) {
  const {
    roundsPlayed = 0,
    avgWordsFound = 0,
    avgTimeLeft = 0,
    currentStreak = 0,
  } = playerStats;
  if (roundsPlayed < 2) return null;
  const winning = avgWordsFound >= 4.5 && avgTimeLeft >= 25;
  const dominating = currentStreak >= 5;
  if (!winning && !dominating) return null;
  if (dominating) {
    return {
      difficulty: 'hard', timeLimit: 35, wordCount: 6,
      reason: `Chaalbaaz says: ${currentStreak} streak? Ab dekhte hain real challenge — 35 sec!`,
    };
  }
  return TUNE_FALLBACK;
}

async function chaalbaazChat({ history = [], message = '', playerStats = {} }) {
  const fallback = 'Hmm... thinking right now. Agla round mein dekhte hain kya karte ho 😏';
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
    const text = await generate(prompt, { agent: 'chaalbaazAgent',
      timeoutMs: 14000,
      temperature: 0.95,
      maxTokens: 120,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    return { reply: cleaned || fallback };
  } catch (err) {
    return { reply: fallback };
  }
}

async function chaalbaazAgent(payload = {}) {
  const { mode = 'chat' } = payload;
  if (mode === 'tune') return chaalbaazTune(payload.playerStats || {});
  return chaalbaazChat(payload);
}

module.exports = chaalbaazAgent;
