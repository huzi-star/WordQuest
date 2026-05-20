// llm.js — single entry point for all AI calls. Currently routes to
// OpenAI gpt-4o-mini. Replaces the prior Gemini-based wrappers used by
// each agent.

const OpenAI = require('openai');
const logger = require('./logger');

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
    agent = 'unknown',     // for log tagging
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

  const startedAt = Date.now();
  try {
    const completion = await Promise.race([
      client.chat.completions.create(body),
      new Promise((_, reject) => setTimeout(() => reject(new Error('llm timeout')), timeoutMs)),
    ]);

    const text = completion?.choices?.[0]?.message?.content || '';
    const usage = completion?.usage || {};
    if (!text) {
      logger.push({
        agent, model: body.model, status: 'error',
        durationMs: Date.now() - startedAt,
        error: 'Empty response',
        prompt: prompt.slice(0, 600),
      });
      throw new Error('Empty response from OpenAI');
    }

    logger.push({
      agent, model: body.model, status: 'ok',
      durationMs: Date.now() - startedAt,
      tokens: {
        prompt: usage.prompt_tokens || 0,
        completion: usage.completion_tokens || 0,
        total: usage.total_tokens || 0,
      },
      prompt: prompt.slice(0, 600),
      response: text.slice(0, 600),
    });
    return text.trim();
  } catch (err) {
    logger.push({
      agent, model: body.model, status: 'error',
      durationMs: Date.now() - startedAt,
      error: err.message || String(err),
      prompt: prompt.slice(0, 600),
    });
    throw err;
  }
}

function isConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

module.exports = { generate, isConfigured };
