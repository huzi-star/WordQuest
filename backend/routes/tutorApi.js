const express = require('express');
const router = express.Router();
const { generate } = require('../utils/llm');

const TUTOR_SYSTEM = (age) =>
  `You are WordQuest's personal AI Tutor for a child aged ${age}. ` +
  'Be warm, encouraging, and patient. Always answer in simple English at a CEFR A2 level. ' +
  'Use very short sentences. Add a tiny example for every concept. End with one fun follow-up question. ' +
  'NEVER discuss anything outside English vocabulary, grammar, reading, spelling, sentence-building, or general kid-safe topics. ' +
  'If asked about anything adult, violent, religious-controversial, political, or unsafe, politely redirect to a learning topic. ' +
  'Keep replies under 90 words.';

router.post('/api/tutor/chat', async (req, res) => {
  const { messages = [], childAge = 10 } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.json({ ok: false, error: 'No messages' });
  }
  const transcript = messages
    .map((m) => `${(m.role || 'user').toUpperCase()}: ${m.content}`)
    .join('\n');
  const prompt = `${TUTOR_SYSTEM(childAge)}\n\n${transcript}\nASSISTANT:`;
  try {
    const reply = await generate(prompt, { temperature: 0.7, maxTokens: 220, agent: 'tutor' });
    res.json({ ok: true, reply: (reply || '').trim() });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

module.exports = router;
