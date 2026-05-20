# Agent-by-agent Walkthrough

For each of the 9 agents, the design intent, exact responsibility, input/output, and where it lives in the codebase.

---

## 1. difficultyAgent — Pure-logic difficulty selector

**File:** `backend/agents/difficultyAgent.js`

**Why:** Difficulty selection should be deterministic and explainable. Using AI for this would make it slow and unpredictable. Player should be able to *read* why the AI chose this difficulty.

**Input:** `playerStats` (roundsPlayed, avgWordsFound, avgTimeLeft), optional `levelNumber`.

**Output:** `{ difficulty, gridSize, wordCount, timeLimit, reason }`.

**Logic:**
- If `levelNumber` is set (1–15) → return that level's fixed config (see LEVEL_CONFIG table).
- Otherwise (Quick Play):
  - First round (no stats) → easy
  - `avgWordsRatio > 0.8 AND avgTimeRatio > 0.4` → hard
  - `avgWordsRatio > 0.5` → medium
  - else → easy

---

## 2. levelGeneratorAgent — Word-search puzzle generator

**File:** `backend/agents/levelGeneratorAgent.js`

**Why:** Every puzzle must feel fresh. Hardcoded categories get boring fast. gpt-4o-mini gives infinite variety.

**Input:** `difficulty`, `wordCount`, `gridSize`, `language`, `levelNumber`, `dailySeed`, `lastCategory`, optionally `reshuffleWords` (for Level Mode retry).

**Output:** `{ category, categoryEmoji, words[], grid[][], wordPositions[], funFact }`.

**Logic:**
- **Reshuffle fast-path:** if `reshuffleWords` provided (Level Mode retry), skip LLM, just rebuild grid with same words in a new arrangement.
- Otherwise call gpt-4o-mini with a tight prompt that respects gridSize (`maxLen = min(tierMax, gridSize)`), excludes last category, requests strict JSON.
- Place each word in the grid using one of 4 directions (H, V, ↘, ↙). Fill blanks with random uppercase letters.
- Emergency fallback to a tiny seed-word pool if LLM is offline.

---

## 3. refereeAgent — Score & validity arbiter

**File:** `backend/agents/refereeAgent.js`

**Why:** The client cannot be trusted to score itself. One agent computes the truth.

**Input:** submitted word, full wordList, foundWords so far, timeLeft, current score, current streak.

**Output:** `{ isValid, alreadyFound, pointsEarned, newScore, message, breakdown }`.

**Logic:**
- Already found? → no points, friendly message.
- Not in list? → no points, "try again".
- Valid → compute `basePoints = len*10`, `timeBonus = floor(timeLeft/10)*5`, multiply by combo (1× / 1.5× / 2× / 3× based on streak).

---

## 4. rewardAgent — Badges + narrative

**File:** `backend/agents/rewardAgent.js`

**Why:** Players should feel rewarded with both tangible badges AND a personalised message. Splitting these: deterministic badge logic + LLM-generated text.

**Input:** wordsFound, totalWords, timeLeft, score, roundNumber, streak, language.

**Output:** `{ badges[], streakUpdated, encouragement, nextRoundPreview }`.

**Logic:**
- Pure-logic badge eval (5 conditions).
- gpt-4o-mini generates encouragement + one-sentence "what the AI will do next round" preview.

---

## 5. tutorAgent — Cultural / educational explanation

**File:** `backend/agents/tutorAgent.js`

**Why:** Found a word? Learn something. Turns the puzzle into a micro-lesson.

**Input:** word, category, optional funFact context, language.

**Output:** `{ explanation }` — single sentence.

**Logic:** Short prompt to gpt-4o-mini, 10s timeout, empty string on failure (UI gracefully handles).

---

## 6. commentatorAgent — Live in-round commentary

**File:** `backend/agents/commentatorAgent.js`

**Why:** Makes the game feel alive. AI sees your progress and reacts.

**Triggers:** `word_found` (every 2nd word), `streak` (at 3, 5, 7), `half_time`, `low_time` (15s left), `idle` (no word for 20s).

**Output:** `{ comment }` — one short line.

**Logic:** Per-trigger templated fallback so something always shows. LLM call (7s timeout) replaces fallback when available. Spoken in the player's language.

---

## 7. coachAgent — End-of-session analysis

**File:** `backend/agents/coachAgent.js`

**Why:** Closes the feedback loop. Shows the player what they're good at and what to work on next time.

**Input:** totalScore, rounds, bestStreak, avgWordsPerRound, avgTimeLeftPerRound, categoriesPlayed, weakCategories, language.

**Output:** `{ headline, strengths[], improvements[] }`.

**Logic:** gpt-4o-mini with structured JSON prompt. Falls back to rule-based analysis if LLM unavailable.

---

## 8. chaalbaazAgent — Adversary agent

**File:** `backend/agents/chaalbaazAgent.js`

**Why:** Antagonist character. Showcases agent personality + adaptive difficulty escalation.

**Two modes:**

- **tune:** pure-logic. If `currentStreak >= 5` OR `avgWordsFound >= 4.5 AND avgTimeLeft >= 25`, override difficulty to hard with shorter time. Returned to client as `chaalbaazActive: true`.
- **chat:** gpt-4o-mini-powered banter. System persona: witty, cocky, Roman Urdu/English mix, never insulting, ends with a tiny challenge.

---

## 9. quizAgent — Trivia question generator

**File:** `backend/agents/quizAgent.js`

**Why:** Adds a non-word-search game mode. Same agentic pattern: LLM does the heavy lifting, our code enforces shape + dedup.

**Input:** count (20), language, difficulty, excludeQuestions (last 40 shown).

**Output:** `{ topic, topicEmoji, questions: [{ question, options[4], correctIndex, explanation }] }`.

**Logic:**
- Pick 2 random theme seeds → push toward variety.
- Include last-5 exclude list to discourage repeats.
- gpt-4o-mini call (22s timeout, JSON mode).
- Filter out questions whose text matches the exclude set.
- Fallback path: if full-count fails, retry with `count/2`.
