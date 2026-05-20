// tutorAgent.js — AI-only word explainer (OpenAI gpt-4o-mini).

const { generate, isConfigured } = require('../utils/llm');

async function tutorAgent({ word, category = '', funFact = '', language = 'english' }) {
  if (!isConfigured()) return { explanation: '' };
  const upper = String(word || '').toUpperCase();
  if (!upper) return { explanation: '' };

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
    const text = await generate(prompt, { agent: 'tutorAgent',
      timeoutMs: 10000,
      temperature: 0.7,
      maxTokens: 100,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    if (!cleaned || cleaned.length > 220) return { explanation: '' };
    return { explanation: cleaned };
  } catch (err) {
    return { explanation: '' };
  }
}

module.exports = tutorAgent;
