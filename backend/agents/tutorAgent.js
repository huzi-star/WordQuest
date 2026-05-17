// tutorAgent.js — AI-only word explainer. No hardcoded fallbacks.

const { GoogleGenerativeAI } = require('@google/generative-ai');

async function tutorAgent({ word, category = '', funFact = '', language = 'urdu' }) {
  const upper = String(word || '').toUpperCase();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    return { explanation: '' };
  }

  const langInstruction = language === 'english'
    ? 'Write in clear English (max 20 words).'
    : 'Mix Urdu and English casually like Pakistanis chat (Roman Urdu, max 20 words).';

  const prompt = `You are a friendly trivia tutor.
The player just found the word "${upper}" in the category "${category}".
${funFact ? `Category context: ${funFact}` : ''}

Return ONE short educational sentence explaining what this word means or
why it's culturally / historically significant. ${langInstruction}

Output ONLY the sentence — no quotes, no labels.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('tutor timeout')), 12000)),
    ]);
    const text = (result.response.text() || '').trim().replace(/^["']|["']$/g, '');
    if (!text || text.length > 220) return { explanation: '' };
    return { explanation: text };
  } catch (err) {
    return { explanation: '' };
  }
}

module.exports = tutorAgent;
