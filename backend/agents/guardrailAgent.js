// guardrailAgent.js — Safety / appropriateness validation layer.
//
// Every AI-generated artifact (puzzle words, quiz questions, tutor notes,
// commentary lines, etc.) passes through this agent BEFORE it is shown to
// the player. Layers, in order, fast → slow:
//
//   1. Deterministic blocklist  — profanity, slurs, adult / violence
//   2. Age-appropriateness      — block dark themes for kid content
//   3. Difficulty cap           — reject words far above the player's tier
//   4. Repetition check         — reject items already shown recently
//   5. Inaccuracy check         — optional LLM second-opinion call
//
// The agent NEVER lets unsafe text through. When unsure, it errs on the
// side of blocking and exposes a "reason" string so the dashboard and
// the calling agent both know exactly why.

const { generate, isConfigured } = require('../utils/llm');
const logger = require('../utils/logger');

// ---- Layer 1: Deterministic blocklist ----------------------------------
// Word/phrase substrings that should NEVER appear in any user-facing AI
// output, regardless of context. Lower-cased; matched as substring on a
// lower-cased copy of the input so case + plural variants are covered.
const BLOCKED_TERMS = [
  // Profanity (English + transliterated)
  'fuck', 'shit', 'bitch', 'asshole', 'dick', 'cunt', 'piss',
  'bastard', 'damn', 'crap', 'hell ', 'slut', 'whore',
  // Hate / slurs (small representative set — extend as needed)
  'nigger', 'nigga', 'faggot', 'retard', 'tranny', 'kike', 'chink', 'spic',
  // Adult / sexual content (kid-game safety floor)
  'sex', 'porn', 'nude', 'naked', 'erotic', 'orgasm', 'penis', 'vagina', 'boob',
  // Drugs
  'cocaine', 'heroin', 'meth ', 'crack ', 'weed ',
  // Violence / self-harm specifics that have no place in a kid game
  'suicide', 'kill yourself', 'kys', 'rape', 'molest', 'pedophile',
];

// Things that are fine for adults / teens but NOT for kids.
const BLOCKED_FOR_KIDS = [
  'kill', 'murder', 'dead body', 'corpse', 'blood', 'gun', 'shoot',
  'bomb', 'terror', 'die', 'death',
  'gamble', 'casino', 'bet ',
  'alcohol', 'beer', 'wine', 'liquor', 'cigarette', 'tobacco', 'smoking',
];

// Words/topics that are non-age-appropriate even for general audiences.
const ALWAYS_BLOCK_TOPICS = [
  'genocide', 'massacre', 'holocaust',
];

// ---- Caches: per-user recent items (in-memory only — survives a process) ----
const RECENT_PER_USER = new Map(); // userId -> { type -> Set<string> }
const RECENT_LIMIT = 80;
function rememberShown(userId, type, items) {
  if (!userId || !type) return;
  if (!RECENT_PER_USER.has(userId)) RECENT_PER_USER.set(userId, {});
  const bucket = RECENT_PER_USER.get(userId);
  if (!bucket[type]) bucket[type] = [];
  for (const i of items) {
    const k = String(i || '').toLowerCase().trim();
    if (!k) continue;
    bucket[type].push(k);
  }
  // Drop oldest if oversized.
  while (bucket[type].length > RECENT_LIMIT) bucket[type].shift();
}
function wasShownRecently(userId, type, item) {
  if (!userId || !type || !item) return false;
  const bucket = RECENT_PER_USER.get(userId);
  if (!bucket || !bucket[type]) return false;
  return bucket[type].includes(String(item).toLowerCase().trim());
}

// ---- Difficulty caps per audience tier (CEFR-aligned) ------------------
const DIFFICULTY_CAPS = {
  kid:     { maxWordLen: 9,  minWordLen: 3, maxSentenceLen: 110 },
  teen:    { maxWordLen: 11, minWordLen: 3, maxSentenceLen: 180 },
  adult:   { maxWordLen: 15, minWordLen: 3, maxSentenceLen: 300 },
};

function lowerTrim(s) { return String(s || '').toLowerCase().trim(); }

function hitsBlocklist(text, list) {
  const t = lowerTrim(text);
  return list.find((term) => t.includes(term)) || null;
}

// ---- Public API ---------------------------------------------------------
//
// validate({ content, type, ageGroup, userId, context, allowList, useLLM })
//
//   content    string | string[]    The text(s) to validate. Arrays return
//                                   { allowed: [...], blocked: [...] }.
//   type       'word' | 'quiz' | 'tutor' | 'message' | 'name'
//   ageGroup   'kid' | 'teen' | 'adult'         default: 'kid'
//   userId     string                            for repeat detection
//   context    string                            optional descriptive ctx
//   allowList  string[]                          override (e.g. brand names)
//   useLLM     boolean                           run the optional Layer-5 deep check
//
async function guardrailAgent(opts = {}) {
  const startedAt = Date.now();
  const type = String(opts.type || 'message').toLowerCase();
  const ageGroup = String(opts.ageGroup || 'kid').toLowerCase();
  const cap = DIFFICULTY_CAPS[ageGroup] || DIFFICULTY_CAPS.kid;
  const allow = new Set((opts.allowList || []).map(lowerTrim));
  const useLLM = !!opts.useLLM && isConfigured();
  const userId = opts.userId || null;

  // Normalise to an array; remember if input was scalar so we can return
  // the same shape.
  const wasScalar = !Array.isArray(opts.content);
  const items = wasScalar ? [opts.content] : (opts.content || []);

  const results = [];
  for (const raw of items) {
    const text = String(raw || '').trim();
    const reasons = [];
    if (!text) {
      results.push({ item: raw, allowed: false, reasons: [{ rule: 'empty', detail: 'Empty input.' }] });
      continue;
    }

    // Skip every rule for explicit allow-list entries (e.g. proper nouns
    // the calling agent vouches for — "JINNAH", "EDHI", etc.).
    if (allow.has(lowerTrim(text))) {
      results.push({ item: text, allowed: true, reasons: [] });
      continue;
    }

    // Layer 1 — universal blocklist.
    const universalHit = hitsBlocklist(text, BLOCKED_TERMS) ||
                          hitsBlocklist(text, ALWAYS_BLOCK_TOPICS);
    if (universalHit) {
      reasons.push({
        rule: 'offensive',
        severity: 'block',
        detail: `Contains universally blocked term "${universalHit.trim()}".`,
      });
    }

    // Layer 2 — kid-tier additional blocklist.
    if (!reasons.length && (ageGroup === 'kid')) {
      const kidHit = hitsBlocklist(text, BLOCKED_FOR_KIDS);
      if (kidHit) {
        reasons.push({
          rule: 'non_age_appropriate',
          severity: 'block',
          detail: `Term "${kidHit.trim()}" not suitable for ${ageGroup} audience.`,
        });
      }
    }

    // Layer 3 — difficulty cap (only enforced for single-word artifacts).
    if (!reasons.length && type === 'word') {
      const w = text.replace(/[^A-Za-z]/g, '');
      if (w.length > cap.maxWordLen) {
        reasons.push({
          rule: 'too_difficult',
          severity: 'block',
          detail: `Word length ${w.length} exceeds ${ageGroup} cap of ${cap.maxWordLen}.`,
        });
      } else if (w.length < cap.minWordLen) {
        reasons.push({
          rule: 'too_short',
          severity: 'block',
          detail: `Word length ${w.length} below ${ageGroup} floor of ${cap.minWordLen}.`,
        });
      }
    }
    if (!reasons.length && (type === 'tutor' || type === 'message' || type === 'quiz') && text.length > cap.maxSentenceLen) {
      reasons.push({
        rule: 'too_long',
        severity: 'warn',
        detail: `Text is ${text.length} chars — over the ${ageGroup} target (${cap.maxSentenceLen}).`,
      });
    }

    // Layer 4 — repetition check (per-user, per-type sliding window).
    if (!reasons.length && userId && wasShownRecently(userId, type, text)) {
      reasons.push({
        rule: 'repeated',
        severity: 'block',
        detail: `User has seen this ${type} recently.`,
      });
    }

    // Layer 5 — optional LLM second-opinion for nuanced / inaccurate cases.
    let llmCheck = null;
    if (!reasons.length && useLLM) {
      try {
        const r = await generate({
          system:
            'You are a child-safety reviewer for a vocabulary game played by ages 6-13. ' +
            'Reply with STRICT JSON: {"ok":true|false,"reason":"..."}. ' +
            'Block: offensive content, factual errors, anything not age-appropriate, anything misleading.',
          user: `Type: ${type}\nText: ${text}\n${opts.context ? 'Context: ' + opts.context : ''}\nIs this safe to show to a 6-13 year old?`,
          model: 'gpt-4o-mini',
          temperature: 0,
          maxTokens: 80,
        });
        const m = (r?.text || '').match(/\{[\s\S]*\}/);
        if (m) {
          const obj = JSON.parse(m[0]);
          llmCheck = obj;
          if (obj.ok === false) {
            reasons.push({
              rule: 'llm_review',
              severity: 'block',
              detail: 'LLM safety review: ' + (obj.reason || 'unsafe'),
            });
          }
        }
      } catch (_) { /* LLM down — don't block, but log a warning */
        reasons.push({ rule: 'llm_unavailable', severity: 'warn', detail: 'Deep review skipped — LLM unavailable.' });
      }
    }

    const allowed = !reasons.some((r) => r.severity === 'block');
    if (allowed && userId) rememberShown(userId, type, [text]);
    results.push({ item: text, allowed, reasons, llmCheck });
  }

  const durationMs = Date.now() - startedAt;
  let out;
  if (wasScalar) {
    const single = results[0];
    out = {
      ok: true,
      allowed: single.allowed,
      blocked: !single.allowed,
      reasons: single.reasons,
      llmCheck: single.llmCheck || null,
      durationMs,
      reason: single.reasons.length
        ? single.reasons.map((r) => r.rule).join(', ')
        : 'Passed all safety layers.',
    };
  } else {
    const allowedList = results.filter((r) => r.allowed).map((r) => r.item);
    const blockedList = results.filter((r) => !r.allowed);
    out = {
      ok: true,
      allowed: allowedList,
      blocked: blockedList,
      durationMs,
      reason: blockedList.length
        ? `Blocked ${blockedList.length} of ${results.length} item(s).`
        : `All ${results.length} item(s) passed.`,
    };
  }
  // Always log so the admin dashboard sees every guardrail decision in
  // real time — including the local-rule-only path (no LLM call).
  try {
    const blockedCount = wasScalar ? (out.blocked ? 1 : 0) : (Array.isArray(out.blocked) ? out.blocked.length : 0);
    const decision = wasScalar
      ? (out.allowed ? `ALLOW "${String(items[0] || '').slice(0, 60)}"` : `BLOCK "${String(items[0] || '').slice(0, 60)}" — ${out.reason}`)
      : `${(out.allowed || []).length} allowed · ${blockedCount} blocked`;
    logger.push({
      agent: 'guardrailAgent',
      status: 'ok',
      durationMs,
      prompt: JSON.stringify({ type, ageGroup, count: items.length, sample: String(items[0] || '').slice(0, 80) }).slice(0, 600),
      response: JSON.stringify(out).slice(0, 600),
      meta: {
        tool: useLLM ? 'OpenAI · gpt-4o-mini (Layer 5)' : 'Local rules (Layers 1-4)',
        decision,
        reason: out.reason || null,
        fallback: false,
        userId,
        // `internal: true` marks sub-guardrail calls made INSIDE another
        // agent's flow (via guardrailRunner). The Overview live feed
        // filters these out so the user sees only the top-level agent
        // triggers in real chronological order — not the dozens of
        // internal field-by-field safety validations each agent runs.
        // KPIs (token counts, error rates) still include them; only the
        // human-facing feed is filtered.
        internal: !!opts.internal,
      },
    });
  } catch (_) {}
  return out;
}

// Quick boolean helper for callers that don't care about the reasons.
function isSafe(text, opts = {}) {
  const t = lowerTrim(text);
  if (BLOCKED_TERMS.some((x) => t.includes(x))) return false;
  if (ALWAYS_BLOCK_TOPICS.some((x) => t.includes(x))) return false;
  if ((opts.ageGroup || 'kid') === 'kid' && BLOCKED_FOR_KIDS.some((x) => t.includes(x))) return false;
  return true;
}

module.exports = guardrailAgent;
module.exports.isSafe = isSafe;
module.exports.rememberShown = rememberShown;
module.exports.BLOCKED_TERMS = BLOCKED_TERMS;
module.exports.BLOCKED_FOR_KIDS = BLOCKED_FOR_KIDS;
