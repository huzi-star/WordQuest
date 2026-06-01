# 🎬 Antigravity Usage Video — Voiceover Script

**Target length:** 2:30 (within the 2–3 min hackathon range)
**Purpose:** Show how Antigravity-style agentic development shaped WordQuest — the architecture, the iterative flow, and the live observability.
**Style:** Calmer than the demo. More like a screen-share / walkthrough. Voiceover dubbed on top.

---

## 🎙 Section breakdown

| Section | Length | Screen content | Voiceover |
|---|---|---|---|
| 1. Hook & framing | 0:00 – 0:20 | Title card / project README in editor | Below ⬇ |
| 2. The 9-agent architecture | 0:20 – 0:55 | `backend/agents/` folder view | Below ⬇ |
| 3. One agent end-to-end | 0:55 – 1:25 | Open `levelGeneratorAgent.js` | Below ⬇ |
| 4. Orchestration | 1:25 – 1:50 | Open `server.js` | Below ⬇ |
| 5. Live observability (the proof) | 1:50 – 2:20 | Browser → /logs dashboard with live calls | Below ⬇ |
| 6. Close | 2:20 – 2:30 | GitHub link + repo file tree | Below ⬇ |

---

## 🎙 Full voiceover lines

> Lines below are what you say. `[ACTION]` blocks describe what to film.

---

### 1. Hook & framing (0:00 – 0:20)

`[ACTION]` Open the project README in VS Code or your editor. Show the agents section / architecture diagram. Pause briefly on the diagram.

> "WordQuest was built with an Antigravity-style agentic workflow. Instead of one giant prompt, the game is **nine cooperating AI agents**, each with a narrow responsibility, orchestrated by an Express backend. Let me walk you through how that came together."

---

### 2. The 9-agent architecture (0:20 – 0:55)

`[ACTION]` Open the file explorer → expand `backend/agents/` folder. Show all nine `.js` files. Briefly highlight each name with your cursor.

> "Here's the agent layer. Each file is one agent, with one job. The **difficulty agent** is pure logic — it reads player stats and picks the next round's grid size, word count, and timer. The **level generator** calls GPT-4o-mini to pick a category and build a themed puzzle. The **referee** validates words and computes score. The **tutor** writes a cultural note when a word is found. The **commentator** drops live encouragement during play. The **reward agent** generates a personalised round summary. The **coach** analyses the whole session. The **chaalbaaz** adversary escalates difficulty and trash-talks in chat. And the **quiz agent** generates trivia questions on demand."

`[ACTION]` Scroll to show the file sizes — small, focused files. This visually proves the separation of concerns.

> "Each agent is small, focused, and replaceable. That's the whole point — agents do one thing well."

---

### 3. One agent end-to-end (0:55 – 1:25)

`[ACTION]` Open `backend/agents/quizAgent.js`. Scroll to show the prompt construction, then the API call, then the parsing/filtering logic.

> "Here's the quiz agent in detail. The prompt is templated with two random topic seeds, the difficulty, the player's language preference, and an explicit list of recent questions to avoid. We call GPT-4o-mini in JSON-mode with a tight token budget and a twenty-two second timeout. After parsing, we filter out anything that matches the recent-questions set, and we cap the result to the requested count."

`[ACTION]` Briefly highlight the timeout + retry logic.

> "If the first attempt times out, we retry with a smaller count. Two seconds at the API never blocks the user — it just degrades gracefully."

---

### 4. Orchestration (1:25 – 1:50)

`[ACTION]` Open `backend/server.js`. Scroll to the `/api/generate-level` handler. Highlight where it calls `difficultyAgent`, then `chaalbaazAgent`, then `levelGeneratorAgent`.

> "The Express server is the orchestrator. A single `generate-level` request fans out across three agents — difficulty picks the tier, the adversary checks if the player needs an escalation, and the generator builds the actual puzzle. Each agent returns structured JSON that the next consumer can use without any glue parsing."

`[ACTION]` Scroll to `/api/generate-quiz` and `/api/coach` to show the same pattern.

> "Same pattern for the coach, the tutor, the referee — every endpoint is a tiny orchestration step. That's what makes the system agentic, not just AI-powered."

---

### 5. Live observability (1:50 – 2:20)

`[ACTION]` Switch to a browser tab on `https://backend-liart-three-60.vercel.app/logs`. The premium console is on screen. Idle for two seconds so the viewer can take it in.

> "This is the most important screen. Every single agent call goes through one shared logger — model, latency, prompt, response, token counts — all captured in real time. I built this dashboard specifically to debug the agents while iterating."

`[ACTION]` Trigger an agent call (from your phone, run one round of Quick Play or tap Quiz Mode). Watch the new entry slide in at the top of the dashboard. Click to expand it.

> "Watch — when I play a round on the phone, every prompt and response shows up here within two seconds. Filter by agent, search across prompts, copy the raw exchange. This is the same observability story Antigravity gives you — but custom-built for the running production app."

---

### 6. Close (2:20 – 2:30)

`[ACTION]` Cut to a clean shot of the GitHub link, or the repo file tree zoomed out.

> "Nine agents. One shared LLM helper. Full live trace. Everything in version control on GitHub. That's how Antigravity-style agentic development shaped WordQuest. Thanks."

---

## 🧰 Recording checklist

- [ ] VS Code with the project open at root
- [ ] File explorer panel expanded so all agents are visible
- [ ] Browser tab on `/logs` ready, with at least 5 recent entries to look credible
- [ ] Phone next to laptop so you can trigger a live agent call during section 5
- [ ] Backend awake (`curl /api/health` once before recording — kills Vercel cold-start)
- [ ] No personal info / secrets visible on screen (close `.env`, terminal, etc.)
- [ ] Editor theme set to a clean dark theme — high contrast for the video

## 🎬 Editing tips

- Add gentle text overlays for section names ("AGENT LAYER", "ORCHESTRATION", "LIVE TRACE")
- Use zoom-in animations on code regions to make them readable on small screens
- Keep cursor highlights — drag your cursor over the agent file names to direct attention
- 1080p / 30fps, total under 3 min
- If you want extra credit, add a small picture-in-picture of your face at the corner during voiceover — feels more personal

## 🗣 Tone tips

- Slightly more technical than the demo video — judges are devs
- Pause after each agent name so the viewer can read it
- Show, don't tell: when you say "filter by agent", actually click the chip
- Don't apologise for anything that doesn't work perfectly — just narrate confidently
