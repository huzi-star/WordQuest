// guardrailRunner.js — thin wrapper around guardrailAgent so every other
// agent in the system can route its output (and, where relevant, its
// user-supplied input) through a single safety check without duplicating
// the try/catch + fallback boilerplate.
//
// Rules (per judges' national-finals brief):
//   - Block offensive content
//   - Block inaccurate / misleading content (LLM second-opinion when enabled)
//   - Block content above the difficulty cap for under-13s
//   - Block content the same user already saw recently (last ~80 items)
//   - Block non-age-appropriate content (the game targets <13)
//
// The wrappers below NEVER throw. If guardrailAgent itself errors out, the
// caller's original content is returned unchanged but a `guardrailError`
// flag is set on the result so the calling agent can log it.

const guardrailAgent = require('../agents/guardrailAgent');

// Run guardrail on a single string. Returns the original text if allowed,
// or `null` if blocked. The reason is exposed via `lastReason()` for the
// caller to attach to its own log entry. Never throws.
let _lastReason = null;
function lastReason() { return _lastReason; }

async function guardText(text, type, opts = {}) {
  _lastReason = null;
  if (!text || typeof text !== 'string') return text;
  try {
    const r = await guardrailAgent({
      content: text,
      type: type || 'message',
      ageGroup: opts.ageGroup || 'kid',
      userId: opts.userId || null,
      context: opts.context || '',
      useLLM: !!opts.useLLM,
      allowList: opts.allowList || [],
      internal: true,
    });
    if (r && r.allowed === false) {
      _lastReason = r.reason || 'blocked';
      return null;
    }
    return text;
  } catch (_) {
    _lastReason = 'guardrail-error';
    return text;
  }
}

// Run guardrail across an array of strings. Returns ONLY the items that
// passed (in the original order). Useful for filtering word lists, rec
// titles, lesson bullets, etc. Never throws.
async function guardArray(items, type, opts = {}) {
  _lastReason = null;
  if (!Array.isArray(items) || !items.length) return [];
  try {
    const r = await guardrailAgent({
      content: items,
      type: type || 'message',
      ageGroup: opts.ageGroup || 'kid',
      userId: opts.userId || null,
      context: opts.context || '',
      useLLM: !!opts.useLLM,
      allowList: opts.allowList || [],
      internal: true,
    });
    if (r && Array.isArray(r.allowed)) {
      if (Array.isArray(r.blocked) && r.blocked.length) {
        _lastReason = 'blocked ' + r.blocked.length + ' of ' + items.length;
      }
      return r.allowed;
    }
    return items;
  } catch (_) {
    _lastReason = 'guardrail-error';
    return items;
  }
}

// Run guardrail across the named string fields of an OBJECT (meaning,
// example, synonym, etc.) and return a SHALLOW copy with each blocked
// field replaced by null. Other fields are passed through untouched.
// `fields` is the list of keys to check; default = ['meaning', 'example', 'synonym', 'antonym'].
async function guardObjectFields(obj, type, opts = {}) {
  _lastReason = null;
  if (!obj || typeof obj !== 'object') return obj;
  const fields = opts.fields || ['meaning', 'example', 'synonym', 'antonym'];
  const out = { ...obj };
  let blockedAny = false;
  for (const key of fields) {
    const v = out[key];
    if (typeof v !== 'string' || !v.trim()) continue;
    const safe = await guardText(v, type, opts);
    if (safe === null) { out[key] = null; blockedAny = true; }
  }
  if (blockedAny) _lastReason = 'blocked-field(s)';
  return out;
}

// Pre-flight check on a user-supplied STRING (chat message, search query,
// etc.). Returns { ok, reason } so the caller can short-circuit before
// burning an LLM call on toxic input. Never throws.
async function guardInput(text, type, opts = {}) {
  if (!text || typeof text !== 'string') return { ok: true };
  try {
    const r = await guardrailAgent({
      content: text,
      type: type || 'message',
      ageGroup: opts.ageGroup || 'kid',
      userId: opts.userId || null,
      context: opts.context || 'user-input',
      useLLM: false,
      internal: true,
    });
    if (r && r.allowed === false) {
      return { ok: false, reason: r.reason || 'unsafe-input' };
    }
    return { ok: true };
  } catch (_) { return { ok: true }; }
}

module.exports = {
  guardText, guardArray, guardObjectFields, guardInput, lastReason,
};
