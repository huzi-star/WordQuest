// llm.js — single entry point for all AI calls. Currently routes to
// OpenAI gpt-4o-mini. Replaces the prior Gemini-based wrappers used by
// each agent.

const OpenAI = require('openai');

let cachedClient = null;
function getClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

// Returns the assistant's text response, or throws on failure.
//
// opts:
//   timeoutMs:     hard ceiling on the request (default 20000)
//   temperature:   default 0.8
//   maxTokens:     default 1200
//   responseFormat 'json'|'text' (default 'text')
async function generate(prompt, opts = {}) {
  const client = getClient();
  if (!client) throw new Error('OPENAI_API_KEY not configured');

  const {
    timeoutMs = 20000,
    temperature = 0.8,
    maxTokens = 1200,
    responseFormat = 'text',
  } = opts;

  const body = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens,
  };
  if (responseFormat === 'json') {
    body.response_format = { type: 'json_object' };
  }

  const completion = await Promise.race([
    client.chat.completions.create(body),
    new Promise((_, reject) => setTimeout(() => reject(new Error('llm timeout')), timeoutMs)),
  ]);

  const text = completion?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Empty response from OpenAI');
  return text.trim();
}

function isConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

module.exports = { generate, isConfigured };
