# WordQuest — Implementation Plan

**Challenge:** Google Antigravity Hackathon #AISeekho2026 — Challenge 4: Agentic Game Quest
**Goal:** Build a fully-playable AI-powered mobile word puzzle game that demonstrates true agentic behaviour.

---

## Phase 1 — Architecture

**Decision:** Multi-agent system. Each game responsibility = its own narrow-focus agent. Backend orchestrates the agents per request.

**Agents identified:**

| # | Agent | Engine | Reason it exists |
|---|---|---|---|
| 1 | difficultyAgent | Pure logic | Decide difficulty/grid/time from player history |
| 2 | levelGeneratorAgent | gpt-4o-mini | Create themed word-search puzzles |
| 3 | refereeAgent | Pure logic | Single source of truth for scoring + validation |
| 4 | rewardAgent | gpt-4o-mini | Award badges + write narrative |
| 5 | tutorAgent | gpt-4o-mini | Educational explanation per found word |
| 6 | commentatorAgent | gpt-4o-mini | Live in-round encouragement |
| 7 | coachAgent | gpt-4o-mini | End-of-session strengths/improvements |
| 8 | chaalbaazAgent | gpt-4o-mini + logic | Adversarial difficulty escalation + chat |
| 9 | quizAgent | gpt-4o-mini | Generate fresh trivia MCQs |

**Tech choices:**
- Mobile: Expo SDK 54 (React Native) — quick iteration, EAS Build for APKs
- Backend: Node.js + Express on Vercel — serverless, free tier covers traffic
- LLM: OpenAI gpt-4o-mini — cheap, fast, reliable for both creative + JSON output
- Auth + sync: Supabase — real email/password auth + per-user Postgres row
- Storage: AsyncStorage on device, scoped per logged-in user

---

## Phase 2 — Game design

**4 game modes:**

1. **Quick Play** — adaptive AI difficulty, endless loop
2. **Level Mode** — 15 fixed-config levels, unlock progression, retry reshuffles same words
3. **Daily Challenge** — 10×10 / 10 words / 100 s / 500 pts per word, one attempt per day
4. **Quiz Mode** — 20 AI-generated MCQs per session

**15-level config table:**
```
L1:  3×3  / 2 words / 40s
L2:  4×4  / 4 words / 40s
L3:  5×5  / 4 words / 45s
L4:  5×5  / 5 words / 45s
L5:  6×6  / 6 words / 60s
L6:  6×6  / 7 words / 76s
L7:  7×7  / 8 words / 80s
L8:  7×7  / 7 words / 80s
L9:  8×8  / 7 words / 100s
L10: 8×8  / 8 words / 100s
L11: 9×9  / 8 words / 110s
L12: 9×9  / 9 words / 110s
L13: 10×10/ 9 words / 120s
L14: 10×10/10 words / 120s
L15: 12×12/12 words / 130s
```

**Scoring rules (refereeAgent):**
- basePoints = wordLength * 10
- timeBonus = floor(timeLeft / 10) * 5
- comboMultiplier: 1x (streak<2), 1.5x (streak 2-3), 2x (streak 4-5), 3x (streak ≥6)
- totalPoints = floor((basePoints + timeBonus) * comboMultiplier)
- **Daily Challenge override:** flat 500 per word, no time bonus, no combo

**Badge conditions (rewardAgent):**
- SPEED_DEMON: timeLeft > 45 AND wordsFound ≥ 3
- PERFECT_ROUND: wordsFound === totalWords
- ON_FIRE: streak ≥ 5
- EXPERT: roundNumber ≥ 10 AND score > 1000
- COMEBACK_KID: 0 < wordsFound < totalWords/2

---

## Phase 3 — Premium UX

- 🎨 4-theme picker (Green/Gold/Purple/Neon Cyan)
- 🌐 Bilingual UI (English default, Roman Urdu toggle)
- 🔐 Real authentication via Supabase + Change Password screen
- 🎙 Live AI commentary popups during play (from top of screen)
- 🏆 Per-level high scores tracked + displayed on tiles
- 🌟 Animated wooden-plank level complete screen with 3-star rating
- 🎉 Emoji rain on win (Pakistani flag + sparkles)
- 💔 Crying emoji rain on level fail with "Try Again" CTA
- 💡 Hint power-up (30 pts, 3/round, reveals one letter)
- ⏱ Daily Challenge midnight lock + countdown UI
- 🛡 Game screen swipe-back disabled, only Quit + confirm modal
- 📊 Stats Dashboard (XP/level, totals, history, heatmap)
- 🐾 Premium ConfirmModal component for destructive actions
- 🎬 Animated splash screen with logo zoom + sparkle ring

---

## Phase 4 — Cross-device cloud sync

Lock states, onboarding flag, per-level high scores all persisted to Supabase `user_stats.preferences` JSONB so they survive sign-out / sign-in across devices.

`syncDown` merges remote with local using `Math.max` per timestamp — prevents bypassing cooldowns by reinstalling.

---

## Phase 5 — Production deployment

- Backend deployed to Vercel with 60s function timeout
- APK built via EAS Build (Expo cloud)
- Supabase project provisioned with `user_stats` table
- Environment variable `OPENAI_API_KEY` set on Vercel

**Live URLs:**
- APK: https://expo.dev/artifacts/eas/w3vQCSrhE5iBBm8hacExkH.apk
- Backend: https://backend-liart-three-60.vercel.app
- GitHub: https://github.com/huzi-star/puzzle
