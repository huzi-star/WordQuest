# WordQuest — AI Agent Reference

> A complete, current-state reference for every AI / logic agent powering WordQuest.
> Each section explains **what the agent does**, **where it is wired up**, and **what the player actually sees** as a result.

---

## Quick Map

| # | Agent | Type | Lives In | Triggered By |
|---|-------|------|----------|--------------|
| 1 | levelGeneratorAgent | LLM (gpt-4o-mini) | `agents/levelGeneratorAgent.js` | Quick Play, Daily Challenge, Practice, 1v1 Battle, Pakistan Quest |
| 2 | difficultyAgent | Pure logic | `agents/difficultyAgent.js` | Quick Play (legacy fallback only) |
| 3 | refereeAgent | Pure logic | `agents/refereeAgent.js` | Word selection validation (server-side) |
| 4 | rewardAgent | Pure logic | `agents/rewardAgent.js` | Round-complete score breakdown |
| 5 | tutorAgent | LLM | `agents/tutorAgent.js` | "Explain this word" + AI Tutor screen |
| 6 | commentatorAgent | LLM | `agents/commentatorAgent.js` | Endpoint exists, mobile now uses local templates |
| 7 | coachAgent | LLM | `agents/coachAgent.js` | Game Over coach tip |
| 8 | chaalbaazAgent | Hybrid (logic + LLM) | `agents/chaalbaazAgent.js` | Quick Play, Practice — difficulty escalation |
| 9 | quizAgent | LLM | `agents/quizAgent.js` | Quiz mode |
| 10 | wordDetailAgent | LLM | `agents/wordDetailAgent.js` | Word Found card (meaning + example + syn/ant) |
| 11 | wordOfDayAgent | LLM | `agents/wordOfDayAgent.js` | Home screen banner |
| 12 | translateAgent | LLM | `agents/translateAgent.js` | Word detail translation button |
| 13 | lessonAgent | LLM | `agents/lessonAgent.js` | Learn tab lesson screens |
| 14 | learningPathAgent | Stateful logic + Supabase | `agents/learningPathAgent.js` | Home "Recommended for You" + after every round |
| 15 | guardrailAgent | Pure logic | `agents/guardrailAgent.js` | Safety pass on AI output (kids mode strict) |
| 16 | kidWordAgent | LLM | `agents/kidWordAgent.js` | Kids mode levels |
| 17 | kidQuestionAgent | LLM | `agents/kidQuestionAgent.js` | Kids mode questions |

---

## 1. levelGeneratorAgent

**What it does**
Generates the actual word-search puzzle: an N × N grid of letters with target words placed horizontally, vertically, or diagonally (forwards or backwards). It picks the category, the words themselves, an emoji for the category, and a short fun fact.

**Inputs**: difficulty (easy / medium / hard), grid size, word count, language (English / Urdu), optional category override (Pakistan Quest pack, Practice mode), optional tier hints for CEFR-aligned word style.

**Outputs**: `{ category, categoryEmoji, words[], grid[][], wordPositions[], funFact }`

**Where it is used**
- **Quick Play** — every round at `POST /api/generate-level`
- **Daily Challenge** — same endpoint with `dailySeed` parameter for stable daily puzzles
- **Practice Mode** — `POST /api/practice/round` (category forced from a curated pool)
- **1v1 Battle** — `POST /api/battle/queue` generates a single shared level for both players
- **Pakistan Quest** — `POST /api/pakistan-quest/level` uses curated Pakistani vocabulary

**What the player sees**
The actual grid, the highlighted target words list, the category banner, the fun-fact ribbon at the bottom of the result screen.

---

## 2. difficultyAgent

**What it does**
Pure logic (no LLM call) that decides difficulty parameters (grid size, word count, time limit) from rolling player stats. Returns one of easy / medium / hard plus the numeric settings.

**Where it is used**
- **Quick Play legacy fallback** in `server.js` — only fires when no tier is supplied. Modern Quick Play uses the player's **tier** as the source of truth, so this is the fallback path.
- **Level Mode** — uses the same agent indexed by `levelNumber` to pull a locked difficulty table.

**What the player sees**
Indirectly — the grid size and timer they get. They never see this agent's reasoning string.

---

## 3. refereeAgent

**What it does**
Pure logic. Given the player's selected letter sequence and the target word list, decides whether the selection is a valid word find. Handles forward + reverse + all 8 directions.

**Where it is used**
- `POST /api/validate-word` — called every time the player completes a swipe across the grid in Quick Play / Daily / Level mode.

**What the player sees**
The instant "found!" animation + score popup OR the shake-rejection on a wrong selection.

---

## 4. rewardAgent

**What it does**
Pure logic. After a round, takes the words found, time left, hints used, perfect-clear flag, and produces the final score breakdown: base points, bonuses, penalties.

**Where it is used**
- `POST /api/round-complete` — fires from `RoundCompleteScreen.js` after every Quick Play / Daily / Level round.

**What the player sees**
The score breakdown card on the round-complete screen: "Words found", "Completion %", "Penalty", "New total".

> Note: Current scoring also runs client-side via `letters + 2` base formula and `+25` perfect-clear bonus. The reward agent handles the canonical server-side tally.

---

## 5. tutorAgent

**What it does**
LLM-powered AI tutor. Two purposes:
1. **Word explanation** — give the meaning, example sentence, and a short lesson on a single word.
2. **Free chat tutor** — multi-turn AI Tutor conversation (Pro Max only, 30 messages / day cap).

**Where it is used**
- `POST /api/explain-word` — wired in `GameScreen.js` when player taps "Explain" on a found word
- **AI Tutor Screen** (`TutorScreen.js`) — chat interface with bobbing robot, daily cap counter, TTS speaker button

**What the player sees**
A clean explanation card in-game; or the full AI Tutor screen where they can ask follow-up questions and hear the tutor speak the reply.

---

## 6. commentatorAgent

**What it does**
LLM-powered live commentary lines for game events ("Nice combo!", "Halfway there!", "Watch the clock!").

**Where it is used**
- Endpoint `POST /api/commentary` still exists, but the **mobile client no longer calls it** — `GameScreen.js` uses local commentary templates for instant feedback (no network round-trip, no stacking lag). The agent is effectively **dormant** in production.

**What the player sees**
Local commentary popups during play. The LLM agent itself is currently bypassed.

---

## 7. coachAgent

**What it does**
LLM that reviews a finished round and produces one short coaching tip ("You found 7 / 10 — focus on diagonal scanning next time").

**Where it is used**
- `POST /api/coach` — called from `GameOverScreen.js` after the player loses or runs out of time.

**What the player sees**
The "Coach says…" card on the Game Over screen.

---

## 8. chaalbaazAgent (hybrid — recently revived)

**What it does**
The in-game "adversary". Two modes:
- **`tune` (pure logic)** — When the player is dominating their current tier or difficulty (streak ≥ 5 OR average 80%+ words found with time to spare), Chaalbaaz **bumps the difficulty one step**: +1 word, –10 sec, +1 grid cell. Never downgrades.
- **`chat` (LLM)** — English banter persona ("witty, slightly cocky, never insults"). Powers the standalone ChaalbaazChatScreen.

**Where it is used**
- **Quick Play** (`server.js` — tier branch) — tier sets the base difficulty, Chaalbaaz can escalate on top
- **Practice Mode** (`practiceApi.js`) — same escalation on top of the difficulty selector

**What the player sees**
The red "**😏 ADVERSARY ACTIVATED**" banner above the puzzle, with a one-line reason ("Streak of 6 — Chaalbaaz cranked up the heat."). The actual grid is bigger / harder.

---

## 9. quizAgent

**What it does**
LLM that generates a 20-question multiple-choice vocabulary quiz tailored to the player's tier / level. Each question has a correct answer + 3 plausible distractors + a short explanation.

**Where it is used**
- `POST /api/generate-quiz` — fired by **QuizScreen.js** at quiz start.

**What the player sees**
The full Quiz mode: question card, four options, instant correct/wrong feedback, final score screen with percentage.

---

## 10. wordDetailAgent

**What it does**
LLM that returns the rich detail for a single word: meaning, example sentence, synonym, antonym, optional translation.

**Where it is used**
- Routed via `tierApi.js` — called whenever the **Word Found card** appears (Quick Play, Daily, Level, Practice).

**What the player sees**
The card that pops up when they find a word, containing meaning + example + synonym + antonym. The full TTS read-aloud (speak everything in sequence) reads from this payload.

---

## 11. wordOfDayAgent

**What it does**
LLM that picks **one word of the day** with meaning + example + audio prompt, calibrated to the player's tier (Bronze gets simple words, Master gets advanced).

**Where it is used**
- Routed via `tierApi.js` — called once on **HomeScreen** load.

**What the player sees**
The "Word of the Day" banner card on the Home screen, with a speaker button to hear it read aloud.

---

## 12. translateAgent

**What it does**
LLM translator. Converts an English word/phrase into Urdu (Nastaliq script) and Roman Urdu.

**Where it is used**
- Routed via `tierApi.js` — used by **Word Detail card** when the player taps the translation toggle.

**What the player sees**
Urdu / Roman Urdu translation appearing alongside the English meaning.

---

## 13. lessonAgent

**What it does**
LLM that generates a structured lesson for the **Learn** tab: introductory text, key vocabulary, a short story / dialogue, and 3 practice questions.

**Where it is used**
- Mounted in `learnApi.js` — powers Lesson screens of the Learn path.

**What the player sees**
The Lesson detail page in the Learn flow — title, intro paragraph, highlighted vocab, story, and practice questions at the bottom.

---

## 14. learningPathAgent (Personalized Learning Path)

**What it does**
A **stateful** agent that maintains a per-player memory blob in Supabase (`wq_player_memory`). After every round it:
- Updates rolling **EMA** metrics (avg score, avg words found, completion rate, time pressure, hint usage, diagonal speed, quiz accuracy)
- Tracks per-category accuracy
- Detects **weaknesses** (slow diagonals, hint overuse, low completion, time pressure, low quiz accuracy, weak categories)
- Generates a **next-3 recommendation** prescription tied to those weaknesses

When the home screen loads it returns the latest recommendations. **Cold start is tier-aware**: a new Elite-tier player gets Master Tier Climb / 1v1 / AI Tutor Deep Dive — *not* "Warm-up Practice".

**Where it is used**
- `POST /api/learning/session` — RoundCompleteScreen, QuizScreen, PracticeScreen all call this after a finished round
- `GET /api/learning/recommendations/:userId?tier=elite` — HomeScreen fetches on focus

**What the player sees**
The **🧠 RECOMMENDED FOR YOU** card on Home, with weakness chips (`⚠ Poor quiz accuracy`, `⚠ Slow at diagonal words`) and three numbered, tappable prescriptions, each routing to the right mode (Tutor / Quiz / Practice / 1v1 / Quick Play).

---

## 15. guardrailAgent (Safety Layer)

**What it does**
Pure-logic 5-layer safety filter that screens any AI output before it reaches the player. Layers:
1. Blocked terms (profanity, violence, NSFW)
2. Kid-mode strict block list (additional terms)
3. Always-block topics (regardless of mode)
4. Difficulty cap per age group
5. Final allow / block split with a reason string

**Where it is used**
- `POST /api/guardrail/check` — direct probe endpoint
- Conceptually a wrapper that every AI agent's response can be passed through. In kid mode it runs strictly.

**What the player sees**
Nothing visible when it passes. If content is blocked, the player gets a generic safe replacement / category swap. The block reason is logged to the admin Monitoring Dashboard.

---

## 16. kidWordAgent

**What it does**
LLM specialized for very young learners. Picks age-appropriate easy words (3–5 letters) for a chosen category, with friendly category emojis.

**Where it is used**
- Mounted in `kidsApi.js` — drives Kids Mode levels.

**What the player sees**
Kid-mode puzzles where every word is age-safe and short.

---

## 17. kidQuestionAgent

**What it does**
LLM that generates simple multiple-choice questions for Kids mode (e.g. "Which one is a fruit? 🍎 🚗 🐶 ⚽").

**Where it is used**
- Mounted in `kidsApi.js` — drives Kids Mode quizzes.

**What the player sees**
Kid-mode quiz screen with large emojis and simple questions.

---

## Monitoring & Observability

Every agent call is logged through `utils/supabaseLogger.js` to the `wq_agent_logs` table. Each row captures:
- `agent` (name) · `status` (ok / error) · `durationMs` · `model` used
- `prompt` + `response` snapshots
- `meta`: userId, tool / reason / fallback pills, agent-specific metadata

The **Admin Monitoring Dashboard** (`adminDashboard.js`) shows this live with three tabs:
- **Overview** — recent agent calls with tool / reason / fallback pills
- **Pipelines** — session-grouped traces (silent refresh, won't kick you off the page)
- **User Drill-down** — per-user agent history

---

## Summary by Mode

| Game Mode | Agents involved |
|-----------|-----------------|
| Quick Play | levelGenerator · difficulty (fallback) · referee · reward · wordDetail · coach · chaalbaaz · learningPath · guardrail |
| Daily Challenge | levelGenerator · referee · reward · wordDetail · learningPath · guardrail |
| Practice | levelGenerator · referee · chaalbaaz · learningPath · wordDetail · guardrail |
| 1v1 Battle | levelGenerator · referee (client) · learningPath · guardrail |
| Quiz | quiz · learningPath · guardrail |
| AI Tutor | tutor · guardrail |
| Pakistan Quest | levelGenerator (curated pack) · wordDetail · translate · guardrail |
| Kids Mode | kidWord · kidQuestion · guardrail (strict) |
| Learn Tab | lesson · guardrail |
| Home Screen | wordOfDay · learningPath |

---

*Document generated from the live codebase. For any agent's exact prompt or implementation detail, see the source file in `wordquest/backend/agents/`.*
