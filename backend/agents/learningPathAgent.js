// learningPathAgent — retired. The agent was removed from the product.
// Stub exports return empty/no-op shapes so any lingering import doesn't
// blow up (defensive — nothing in the codebase requires this anymore).

async function recordSession() { return { ok: false, error: 'learningPathAgent retired' }; }
async function getRecommendations() {
  return {
    ok: false,
    error: 'learningPathAgent retired',
    recommendations: [],
    memory: { weaknesses: [], strengths: [], sessions_logged: 0 },
  };
}
async function fetchMemory() {
  return { user_id: null, metrics: {}, category_stats: {}, weaknesses: [], strengths: [], recommendations: [], sessions_logged: 0 };
}

module.exports = { recordSession, getRecommendations, fetchMemory };
