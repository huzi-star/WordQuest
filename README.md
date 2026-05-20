# WordQuest 🎮

**AI-powered word puzzle game for Android.**
Built for **Google Antigravity Hackathon #AISeekho2026 — Challenge 4: Agentic Game Quest.**

Every puzzle, quiz, encouragement line and coaching analysis is generated on
demand by AI. Difficulty adapts to the player. Stats sync across devices via
Supabase. The result is a fully-playable production-grade mobile app that
showcases real agentic behaviour from start to finish.

---

## ✨ Submission quick-links

| What | Link |
|---|---|
| 📱 Mobile App (APK) | https://expo.dev/artifacts/eas/w3vQCSrhE5iBBm8hacExkH.apk |
| 💻 GitHub | https://github.com/huzi-star/puzzle |
| 🌐 Backend (live) | https://backend-liart-three-60.vercel.app |
| 🗄 Supabase project | https://supabase.com/dashboard/project/epjndqbazobrfhovhpza |

---

## 🤖 Why this fits "Agentic Game Quest"

The game is not one prompt — it's **nine cooperating agents**, each with a
narrow responsibility, orchestrated by an Express backend. Players literally
**see the agents thinking** — the difficulty agent's reasoning is surfaced on
the category screen, the referee's verdicts pop up live during play, the
coach analyses your performance after the session, and the adversary
"Chaalbaaz" can talk trash if you call him out.

### The 9 agents

| Agent | Engine | Role |
|---|---|---|
| 🎚 **difficultyAgent** | Pure logic | Reads rolling player stats, picks easy/medium/hard + grid + time. Returns a human-readable reason. |
| 🎨 **levelGeneratorAgent** | **gpt-4o-mini** | Picks a category, generates words for that gridSize, builds an 8-direction word-search grid (H/V/diagonals), writes a fun fact. |
| ⚖ **refereeAgent** | Pure logic | Validates each word, computes base + time bonus + combo multiplier (1.5x → 3x). Single source of truth for scoring. |
| 🏅 **rewardAgent** | **gpt-4o-mini** | Evaluates 5 badge conditions, generates encouragement + a forward-looking "next round" preview. |
| 🎓 **tutorAgent** | **gpt-4o-mini** | When a word is found, writes a 1-sentence cultural/educational note in the player's language. |
| 🎙 **commentatorAgent** | **gpt-4o-mini** | Live in-round commentary on milestones (half-time, low-time, streak, idle). Falls back to templates. |
| 🧠 **coachAgent** | **gpt-4o-mini** | End-of-session full analysis: strengths, areas to improve, headline summary. |
| 😏 **chaalbaazAgent** | **gpt-4o-mini** + logic | Adversary persona. Two modes: silently escalates difficulty when player is dominating ("tune"), and chats trash-talk on demand. |
| ❓ **quizAgent** | **gpt-4o-mini** | Generates 20 multi-choice trivia questions per session, varied topics, anti-repeat (recent question texts excluded from prompt). |

---

## 🎮 Game modes

| Mode | Spec | Notes |
|---|---|---|
| **Quick Play** | Adaptive — AI picks easy/medium/hard each round | Endless loop, difficulty bands react to your performance |
| **Level Mode** | 15 fixed-config levels (3×3 → 12×12) | Unlock progression, per-level high scores tracked, **retry reshuffles same words** into a new grid via AI |
| **Daily Challenge** | 10×10 / 10 words / 100s / 500 pts per word | One attempt per day, locks until next midnight, fresh AI-picked category daily |
| **Quiz Mode** | 20 questions / 200 pts each / 7s per question | gpt-4o-mini writes fresh MCQs every session, anti-repeat list |

---

## 🏗 Architecture

```
   ┌──────────────────────────┐         ┌────────────────────────────┐
   │  Expo / React Native app │         │  Express on Vercel         │
   │  (SDK 54, Poppins fonts) │ ◄─────► │  /api/* endpoints          │
   │                          │  axios  │                            │
   │  Screens: Home, Category │         │  ┌───────────────────────┐ │
   │  Game, RoundComplete,    │         │  │ 9 agents orchestrate  │ │
   │  GameOver, Levels,       │         │  │ each /api/* call      │ │
   │  Daily, Quiz, Stats,     │         │  │ (logic + OpenAI)      │ │
   │  Settings, Auth, etc.    │         │  └───────────────────────┘ │
   └──────┬───────────────────┘         └──────────┬─────────────────┘
          │                                        │
          ▼                                        ▼
   ┌────────────────────┐               ┌────────────────────────┐
   │ AsyncStorage       │               │ OpenAI gpt-4o-mini     │
   │ (per-user scoped)  │               │ (single LLM helper)    │
   └──────┬─────────────┘               └────────────────────────┘
          │
          ▼
   ┌──────────────────────────┐
   │ Supabase (auth + sync)   │
   │ Postgres `user_stats`    │
   │ + auth.users             │
   └──────────────────────────┘
```

### Orchestration example: starting a level

```
HomeScreen → tap "Levels" → LevelsScreen → tap level 5
        ▼
[POST /api/generate-level { levelNumber: 5, ... }]
        │
        ├─→ difficultyAgent({}, { levelNumber: 5 })
        │     returns { gridSize: 6, wordCount: 6, timeLimit: 60 }
        │
        └─→ levelGeneratorAgent({ gridSize, wordCount, language, levelNumber })
              │ if retry: pass cached words → just reshuffles grid layout
              │ else: ask gpt-4o-mini for category + words + funFact
              ▼
              { category, categoryEmoji, words, grid, wordPositions, funFact }
        ▼
CategoryScreen → shows AI reasoning + fun fact
        ▼
GameScreen → player taps/drags letters
        ▼ on each completed word
[Client-side refereeAgent equivalent for instant validation]
        ▼ when timer hits 0 OR all words found
[POST /api/round-complete { wordsFound, totalWords, timeLeft, ... }]
        │
        └─→ rewardAgent → { badges, streakUpdated, encouragement, nextRoundPreview }
        ▼
RoundCompleteScreen → wooden plank with stars
        - All found      → 3 stars, "LEVEL COMPLETED"
        - Any miss       → 0 stars, "FAILED", "Try Again" with reshuffled words
        ▼
Pass: unlock next level + record per-level high score (synced to Supabase)
```

---

## 🔑 Tech stack

- **Mobile**: Expo SDK 54, React Native 0.81, React Navigation 7, Animated API, AsyncStorage, Axios, Poppins Google Font
- **Backend**: Node.js + Express, OpenAI SDK, dotenv, CORS — deployed on Vercel (`maxDuration: 60`)
- **AI**: **OpenAI gpt-4o-mini** for all generative agents (chat completions + JSON mode)
- **Auth + Cloud Sync**: Supabase (auth + Postgres + RLS)
- **CI / Build**: GitHub → EAS Build (Expo cloud) → APK

---

## 📁 Folder structure

```
wordquest/
├── backend/
│   ├── server.js                       # Express orchestrator
│   ├── vercel.json                     # 60s function timeout
│   ├── utils/
│   │   └── llm.js                      # single OpenAI helper
│   └── agents/
│       ├── difficultyAgent.js          # pure logic
│       ├── levelGeneratorAgent.js      # gpt-4o-mini
│       ├── refereeAgent.js             # pure logic
│       ├── rewardAgent.js              # gpt-4o-mini
│       ├── tutorAgent.js               # gpt-4o-mini
│       ├── commentatorAgent.js         # gpt-4o-mini
│       ├── coachAgent.js               # gpt-4o-mini
│       ├── chaalbaazAgent.js           # gpt-4o-mini + logic
│       └── quizAgent.js                # gpt-4o-mini
└── mobile/
    ├── App.js                          # Stack navigator
    ├── app.json                        # Expo config, icon, splash
    ├── eas.json                        # build profiles
    └── src/
        ├── screens/
        │   ├── OnboardingScreen.js
        │   ├── AuthScreen.js
        │   ├── ChangePasswordScreen.js
        │   ├── HomeScreen.js
        │   ├── LevelsScreen.js
        │   ├── DailyChallengeScreen.js
        │   ├── QuizScreen.js
        │   ├── CategoryScreen.js
        │   ├── GameScreen.js
        │   ├── RoundCompleteScreen.js
        │   ├── GameOverScreen.js
        │   ├── StatsScreen.js
        │   └── SettingsScreen.js
        ├── components/
        │   ├── WordGrid.js             # drag + tap + diagonal lines
        │   ├── WordList.js
        │   ├── Timer.js
        │   ├── AgentThinking.js        # AI bubble at top of game
        │   ├── ScorePopup.js
        │   ├── Confetti.js             # emoji rain
        │   ├── ConfirmModal.js         # premium reusable dialog
        │   ├── AnimatedNumber.js
        │   └── AnimatedSplash.js
        └── utils/
            ├── api.js                   # axios + slow client (75s)
            ├── auth.js                  # AuthProvider + syncDown/Up
            ├── supabase.js              # client + signUp/signIn/changePassword
            ├── storage.js               # per-user scoped AsyncStorage
            ├── settings.js              # SettingsProvider + i18n + themes
            ├── theme.js                 # 4 color palettes
            └── sound.js                 # ding sound effect
```

---

## 💎 Premium features

- 🌐 **Bilingual UI** — English (default) or Roman Urdu, toggle in Settings
- 🎨 **4 themes** — Green, Gold, Purple, Neon Cyan
- 🔐 **Real auth** — Supabase email/password, change-password screen with eye-toggle on all fields
- 📊 **Stats dashboard** — XP/level, totals, recent scores, category mastery, activity heatmap
- 🏆 **Per-level high scores** — shown on each level tile
- 🌟 **Daily Challenge** — single attempt, locks until midnight with live countdown
- ⚡ **Combo multiplier** — back-to-back words give 1.5x → 2x → 3x
- 💡 **Hint power-up** — 3 hints per round, reveals one letter, 30-point cost
- 🎙 **Premium animated UI** — onboarding flow, splash with logo zoom, animated quiz loading, premium ConfirmModal for Reset Stats and Quit Game, custom level-completed wooden plank with 3 stars
- 📳 **Sound + Vibration** — toggleable, per-action haptics
- 🎉 **Win celebration** — Pakistani flag + sparkle emoji rain on perfect rounds
- 💔 **Loss screen** — crying emoji rain on level fail with "Try Again" that reshuffles same words
- 🤖 **Live AI commentary** — half-time, low-time, streak, idle bubbles from the top
- 🛡 **Swipe-back disabled in-game** — only Quit + premium confirm modal can exit
- 🔄 **Cloud sync** — Daily/Quiz lock, onboarding flag, per-level scores all survive logout/login

---

## 🚀 Running locally

### Backend

```bash
cd backend
npm install
# create .env with OPENAI_API_KEY=sk-...
npm start
```

Backend boots at `http://localhost:5001`. Healthcheck: `curl http://localhost:5001/api/health`.

### Mobile

```bash
cd mobile
npm install
# put your LAN IP into src/utils/api.js BASE_URL
npx expo start
```

Scan QR with Expo Go (SDK 54 build) on Android. Phone + PC must share Wi-Fi.

---

## 📦 Building an APK

```bash
cd mobile
eas login
eas build -p android --profile preview
```

A `.apk` URL is returned when the cloud build finishes.

---

## 🙏 Credits

Built solo for **Google Antigravity Hackathon #AISeekho2026 — Challenge 4: Agentic Game Quest.**

Tech: Expo · React Native · OpenAI gpt-4o-mini · Supabase · Vercel · EAS Build.
