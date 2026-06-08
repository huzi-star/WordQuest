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
        meta: {
          tool: 'OpenAI · gpt-4o-mini',
          decision: 'EMPTY response — agent will fall back',
          reason: 'OpenAI returned no content for this request.',
          fallback: true,
        },
      });
      throw new Error('Empty response from OpenAI');
    }

    // Auto-synthesize a DECISION + CONFIDENCE/REASON summary so EVERY
    // LLM-backed agent surfaces a non-empty value in the admin trace
    // dropdown — even when the agent itself hasn't wrapped its call
    // with explicit meta. Callers can override either by passing
    // opts.deriveMeta(text) → { decision, reason }.
    let decision = null;
    let reason = null;
    try {
      if (typeof opts.deriveMeta === 'function') {
        const m = opts.deriveMeta(text) || {};
        decision = m.decision || null;
        reason = m.reason || null;
      }
    } catch (_) { /* never block the agent on summarization failure */ }
    if (!decision) {
      // Fallback: a short single-line preview of the AI output. Works
      // for free-form prose AND JSON (just grabs the first meaningful
      // characters either way).
      const oneLine = String(text).replace(/\s+/g, ' ').trim().slice(0, 120);
      decision = oneLine || `${agent} responded ok`;
    }
    if (!reason) {
      reason = `gpt-4o-mini · temp=${temperature} · ${usage.total_tokens || 0} tok · ${Date.now() - startedAt}ms`;
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
      meta: { tool: 'OpenAI · gpt-4o-mini', decision, reason, fallback: false },
    });
    return text.trim();
  } catch (err) {
    logger.push({
      agent, model: body.model, status: 'error',
      durationMs: Date.now() - startedAt,
      error: err.message || String(err),
      prompt: prompt.slice(0, 600),
      meta: {
        tool: 'OpenAI · gpt-4o-mini',
        decision: `ERROR — ${String(err.message || err).slice(0, 80)}`,
        reason: 'LLM call failed; agent will use its fallback path.',
        fallback: true,
      },
    });
    throw err;
  }
}

function isConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

module.exports = { generate, isConfigured };
