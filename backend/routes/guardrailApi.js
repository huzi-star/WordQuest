// guardrailApi.js — public endpoint for the Safety Guardrail Agent.
//
//   POST /api/guardrail/check       — validate one or more strings
//
// Body: { content, type, ageGroup, userId, context, allowList, useLLM }

const express = require('express');
const router = express.Router();
const guardrailAgent = require('../agents/guardrailAgent');
const { insertLog } = require('../utils/supabaseLogger');

function traceId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

router.post('/api/guardrail/check', async (req, res) => {
  const started = Date.now();
  const id = traceId();
  const body = req.body || {};
  try {
    const result = await guardrailAgent(body);
    insertLog({
      id, agent: 'guardrailAgent',
      status: (result.blocked && (Array.isArray(result.blocked) ? result.blocked.length : result.blocked === true)) ? 'block' : 'ok',
      durationMs: Date.now() - started, model: body.useLLM ? 'gpt-4o-mini' : null,
      prompt: JSON.stringify({ content: body.content, type: body.type, ageGroup: body.ageGroup }),
      response: JSON.stringify(result),
      meta: {
        userId: body.userId,
        decision: Array.isArray(result.allowed)
          ? `${(result.allowed || []).length} allowed · ${(result.blocked || []).length} blocked`
          : (result.allowed ? `ALLOW "${String(body.content || '').slice(0, 60)}"` : `BLOCK "${String(body.content || '').slice(0, 60)}"`),
        reason: result.reason,
        tool: body.useLLM ? 'OpenAI · gpt-4o-mini + deterministic rules' : 'Deterministic rules (blocklist + caps + repeat)',
      },
    });
    res.json(result);
  } catch (err) {
    insertLog({ id, agent: 'guardrailAgent', status: 'error', durationMs: Date.now() - started, error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
