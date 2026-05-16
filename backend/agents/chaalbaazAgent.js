// chaalbaazAgent.js — "Chaalbaaz" the adversary agent.
//
// Two modes:
//
//   mode: "tune"   → given player stats, suggest a *harder* override on top
//                    of the standard difficulty config (longer words, rarer
//                    categories). Triggers automatically from server when
//                    the player is consistently winning.
//
//   mode: "chat"   → free-form playful trash-talk / banter with the player
//                    via Gemini. Maintains a short conversation history.
//                    Personality: cocky, witty, mixes Urdu + English, never
//                    insulting — challenges the player to do better.

const { GoogleGenerativeAI } = require('@google/generative-ai');

const SYSTEM_PERSONA = `You are "Chaalbaaz" — a witty, slightly cocky adversary
in a Pakistani word puzzle game. You speak in Roman Urdu mixed with English,
like a friendly trash-talking street smart character. You challenge the
player playfully, never insult, and you respect skill. Keep replies under
30 words. End most replies with a tiny challenge or quip.
Examples of your tone:
- "Hahaha — ye level tumhare liye kuch zyada nahi tha?"
- "Babar khel raha lagta hai — par main bhi tayyar hun!"
- "Try karo BADSHAHI dhoondhna — mushkil hai 😏"`;

const TUNE_FALLBACK = {
  difficulty: 'hard',
  timeLimit: 40,
  wordCount: 6,
  reason: 'Chaalbaaz keh raha — tum easy ho, ab hard challenge!',
};

async function chaalbaazTune(playerStats = {}) {
  // Pure logic decision — only inflate if stats look strong.
  const {
    roundsPlayed = 0,
    avgWordsFound = 0,
    avgTimeLeft = 0,
    currentStreak = 0,
  } = playerStats;

  // Default: defer (let difficultyAgent decide)
  if (roundsPlayed < 2) return null;

  const winning = avgWordsFound >= 4.5 && avgTimeLeft >= 25;
  const dominating = currentStreak >= 5;
  if (!winning && !dominating) return null;

  if (dominating) {
    return {
      difficulty: 'hard',
      timeLimit: 35,
      wordCount: 6,
      reason: `Chaalbaaz says: ${currentStreak} streak? Ab dekhte hain real challenge — 35 sec!`,
    };
  }
  return TUNE_FALLBACK;
}

async function chaalbaazChat({ history = [], message = '', playerStats = {} }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const fallback = "Hmm... server thoda dheema hai. Phir bhi — agla round mein dekhte hain kya karte ho 😏";
  if (!apiKey || apiKey === 'your_key_here') return { reply: fallback };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { maxOutputTokens: 100, temperature: 0.95 },
    });

    // Single-shot generateContent is faster than multi-turn startChat on
    // serverless cold starts. Compose the whole conversation into one prompt.
    const turns = (history || []).slice(-6).map(t => {
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

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('chat timeout')), 22000)),
    ]);
    const text = (result.response.text() || '').trim().replace(/^["']|["']$/g, '');
    if (!text) return { reply: fallback };
    return { reply: text };
  } catch (err) {
    console.warn('chaalbaazChat error:', err.message);
    return { reply: fallback };
  }
}

async function chaalbaazAgent(payload = {}) {
  const { mode = 'chat' } = payload;
  if (mode === 'tune') return chaalbaazTune(payload.playerStats || {});
  return chaalbaazChat(payload);
}

module.exports = chaalbaazAgent;
