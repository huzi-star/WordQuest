// coachAgent.js
// End-of-session AI coach. Gemini reviews the player's whole session and
// gives a personalized analysis: strengths, weaknesses, recommended words
// to practice. Falls back to derived rules when Gemini is offline.

const { GoogleGenerativeAI } = require('@google/generative-ai');

function analyzeLocally(stats) {
  const {
    totalScore = 0,
    rounds = 0,
    bestStreak = 0,
    badgesCount = 0,
    avgWordsPerRound = 0,
    avgTimeLeftPerRound = 0,
    categoriesPlayed = [],
    weakCategories = [],
  } = stats;

  const strengths = [];
  const improvements = [];

  if (avgTimeLeftPerRound > 30) strengths.push('Tum bohot fast ho — time bonus regularly milta hai.');
  if (avgWordsPerRound >= 4) strengths.push('Word recognition strong hai — most words spot kar lete ho.');
  if (bestStreak >= 5) strengths.push(`Streak ${bestStreak} — focus tumhara mazboot hai.`);
  if (badgesCount >= 3) strengths.push('Badges collector! Achievement hunting style mein khelte ho.');
  if (strengths.length === 0) strengths.push('Tum consistently improve kar rahe ho — har round se seekha.');

  if (avgWordsPerRound < 3) improvements.push('Aur words spot karne ki practice karo — horizontal/vertical patterns dekho.');
  if (avgTimeLeftPerRound < 15) improvements.push('Time pressure feel ho raha — pehle category samjho phir search.');
  if (weakCategories.length) improvements.push(`Ye categories thori mushkil rahi: ${weakCategories.join(', ')}.`);
  if (improvements.length === 0) improvements.push('Aur hard difficulty try karo — limits push karo!');

  const practice = [];
  if (weakCategories.includes('Urdu Words')) practice.push('MOHABBAT', 'SUKOON');
  if (weakCategories.includes('Cricket Players')) practice.push('SHAHEEN', 'RIZWAN');
  if (weakCategories.includes('Pakistani Foods')) practice.push('HALEEM', 'NIHARI');
  if (!practice.length) practice.push('IQBAL', 'LAHORE', 'BIRYANI');

  return {
    headline: rounds >= 5 ? `Solid ${rounds}-round session — score ${totalScore}!` : `Achi shuruwat — ${rounds} round khele.`,
    strengths,
    improvements,
    practice,
    nextMove: bestStreak >= 4
      ? 'Next session: hard difficulty try karo, streak push karo.'
      : 'Next session: warm-up easy se start karo, phir medium try karo.',
  };
}

async function coachAgent(stats) {
  const local = analyzeLocally(stats || {});
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') return local;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a friendly personal AI coach for a Pakistani word puzzle game.
The player just finished a session. Analyze and give personalized feedback.

Session stats:
- Total score: ${stats.totalScore || 0}
- Rounds played: ${stats.rounds || 0}
- Best streak: ${stats.bestStreak || 0}
- Badges earned: ${stats.badgesCount || 0}
- Avg words per round: ${(stats.avgWordsPerRound || 0).toFixed(1)}
- Avg time left per round: ${(stats.avgTimeLeftPerRound || 0).toFixed(0)}s
- Categories played: ${(stats.categoriesPlayed || []).join(', ') || 'mixed'}
- Categories where they struggled: ${(stats.weakCategories || []).join(', ') || 'none specific'}

Return STRICTLY valid JSON with these keys (no markdown, no extra text):
{
  "headline": "single-sentence summary of the session (Roman Urdu mix)",
  "strengths": ["2-3 short bullets about what they did well"],
  "improvements": ["2-3 short bullets about what to improve"],
  "practice": ["3-5 SPECIFIC UPPERCASE words from Pakistani categories they should practice"],
  "nextMove": "one-sentence recommendation for the next session"
}

All copy in Roman Urdu / English mix, like a friendly Pakistani trainer.
Max 15 words per bullet.`;

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('coach timeout')), 7000)),
    ]);
    const text = result.response.text().trim();
    const cleaned = text.replace(/```json|```/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    return {
      headline: parsed.headline || local.headline,
      strengths: Array.isArray(parsed.strengths) && parsed.strengths.length ? parsed.strengths : local.strengths,
      improvements: Array.isArray(parsed.improvements) && parsed.improvements.length ? parsed.improvements : local.improvements,
      practice: Array.isArray(parsed.practice) && parsed.practice.length ? parsed.practice.map(w => String(w).toUpperCase()) : local.practice,
      nextMove: parsed.nextMove || local.nextMove,
    };
  } catch (err) {
    return local;
  }
}

module.exports = coachAgent;
