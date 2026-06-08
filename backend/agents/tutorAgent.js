// tutorAgent.js — AI-only word explainer (OpenAI gpt-4o-mini).

const { generate, isConfigured } = require('../utils/llm');
const { guardText, guardInput } = require('../utils/guardrailRunner');

async function tutorAgent({ word, category = '', funFact = '', language = 'english', userId = null }) {
  if (!isConfigured()) return { explanation: '' };
  const upper = String(word || '').toUpperCase();
  if (!upper) return { explanation: '' };

  // INPUT GUARDRAIL — refuse to call the LLM on an unsafe head-word or
  // category. Saves tokens AND stops the agent from "explaining" a slur.
  const safeWord = await guardText(upper, 'word', { ageGroup: 'kid', userId });
  if (safeWord === null) return { explanation: '', blocked: true, reason: 'unsafe input' };
  if (category) {
    const okCat = await guardInput(String(category), 'message', { ageGroup: 'kid', userId });
    if (!okCat.ok) return { explanation: '', blocked: true, reason: okCat.reason };
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
    const text = await generate(prompt, { agent: 'tutorAgent',
      timeoutMs: 10000,
      temperature: 0.7,
      maxTokens: 100,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    if (!cleaned || cleaned.length > 220) return { explanation: '' };
    // SAFETY GUARDRAIL — never return an explanation that fails the
    // safety check. Returning an empty string is the existing "skip"
    // contract, so callers handle it gracefully.
    try {
      const guardrailAgent = require('./guardrailAgent');
      const gr = await guardrailAgent({ content: cleaned, type: 'tutor', ageGroup: 'kid' });
      if (gr && gr.allowed === false) return { explanation: '', blocked: true, reason: gr.reason };
    } catch (_) {}
    return { explanation: cleaned };
  } catch (err) {
    return { explanation: '' };
  }
}

module.exports = tutorAgent;
