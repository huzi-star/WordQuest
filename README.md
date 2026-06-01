# WordQuest 🎮

**AI-powered word-puzzle game for Android — built for kids (13 and under).**

Players climb a 7-tier ladder (Bronze → Master), follow a 32-unit CEFR learning
path (A1 → B1), battle real opponents 1v1, and chat with a personal AI tutor.
Every puzzle, quiz question, lesson, encouragement line and coaching note is
generated on demand by AI. Stats sync across devices via Supabase, three
subscription tiers gate premium features, and the whole UI is built in a
polished cartoonish 3D style.

---

## ✨ Quick links

| What | Link |
|---|---|
| 📱 Latest APK (v3.8.0) | https://expo.dev/artifacts/eas/85gHn8ZeWBrEGhCBQjxk72.apk |
| 💻 GitHub | https://github.com/huzi-star/WordQuest |
| 🌐 Backend (live) | https://backend-liart-three-60.vercel.app |
| 🧠 Agent traces | https://backend-liart-three-60.vercel.app/logs |
| 📡 Game dashboard | https://backend-liart-three-60.vercel.app/dashboard |
| 🗄 Supabase project | https://supabase.com/dashboard/project/epjndqbazobrfhovhpza |

---

## 🎮 Game modes

| Mode | What it is | Scoring |
|---|---|---|
| **Quick Play** | Adaptive AI puzzle — grid + word count + time scale with the player's tier | Tier-based points/word (Bronze 1 pt → Master 2 pts) |
| **Daily Challenge** | One global puzzle every 24h, same words for everyone | **5 pts/word**, credited per-word, locks until next midnight |
| **Quiz Mode** | 20 multi-choice trivia questions, fresh AI MCQs every session | **2 pts/correct**, credited per-question |
| **1v1 Battle** | Real-time MMR-ranked match against a player in your tier | Elo (K=32) win/loss, leaderboard ranking |
| **Learning Path** | 32 CEFR-graded units (A1 → A2 → A2+ → B1), 4 lessons per unit | XP-based, unlocks tier progression bonuses |
| **Level Mode** | 15 fixed-config levels (3×3 → 12×12), unlock chain | Per-level personal bests |

---

## 🏆 Tier ladder

7 tiers gated by lifetime `totalScoreEver`:

| Tier | Threshold | Grid | Words | Time | Pts/word |
|---|---|---|---|---|---|
| 🥉 Bronze    | 0     | 6×6  | 4 | 90s | 1 |
| 🥈 Silver    | 300   | 7×7  | 5 | 80s | 1 |
| 🏅 Gold      | 600   | 8×8  | 6 | 70s | 1 |
| 💠 Platinum  | 900   | 9×9  | 7 | 60s | 2 |
| 💎 Diamond   | 1,500 | 10×10 | 8 | 50s | 2 |
| 👑 Elite     | 2,100 | 11×11 | 9 | 45s | 2 |
| 🔥 Master    | 2,500 | 12×12 | 10 | 40s | 2 |

When a player crosses a threshold, a full-screen **Tier Up celebration** plays
— corner confetti bursts, badge spring-bounce, glow halo, staggered trophies,
"Let's Go!" bouncing CTA — and Supabase is updated immediately so the
celebration never fires twice across devices.

---

## 💎 Subscription plans

| Plan | Price (₨) | Limits | Unlocks |
|---|---|---|---|
| **Free** | 0 | 5 Quick Play / day, 1 Daily, 1 Quiz | A1 stage, Bronze + Silver tiers, ads |
| **Pro** ⭐ | 299/mo · 1999/yr | Unlimited | All tiers, 1v1 Battle, A1+A2 (24 units), no ads, 5 hints, voice pronunciation (5 languages) |
| **Pro Max** 👑 | 599/mo · 3999/yr | Unlimited | Everything in Pro + full A1→B1 (32 units), Parent Dashboard, AI Tutor 1-on-1 chat, custom avatars, offline mode |

Coupons: `HUZIQUEST` → 7-day Pro · `HUZIBUILD` → 7-day Pro Max.

7-day free Pro trial available on first sign-up.

---

## 🤖 Backend AI agents

The backend is an Express server orchestrating **nine specialised agents**
behind a small REST surface (deployed on Vercel).

| Agent | Engine | Role |
|---|---|---|
| 🎚 **difficultyAgent** | Pure logic | Reads rolling player stats, picks easy/medium/hard + grid + time. Surfaces a human-readable reason. |
| 🎨 **levelGeneratorAgent** | gpt-4o-mini | Picks a category, generates words for that grid size, builds an 8-direction word-search grid (horizontal / vertical / 4 diagonals), writes a fun fact. |
| ⚖ **refereeAgent** | Pure logic | Validates each word, computes base + bonuses. Single source of truth for scoring. |
| 🏅 **rewardAgent** | gpt-4o-mini | Evaluates badge conditions, generates encouragement + a forward-looking next-round preview. |
| 🎓 **tutorAgent** | gpt-4o-mini | After a found word, writes a one-sentence cultural / educational note. |
| 🎙 **commentatorAgent** | gpt-4o-mini | Live in-round commentary on milestones (half-time, low-time, streak, idle). Falls back to templates. |
| 🧠 **coachAgent** | gpt-4o-mini | End-of-session analysis: strengths, areas to improve, headline summary. |
| 😏 **chaalbaazAgent** | gpt-4o-mini + logic | Adversary persona — silently escalates difficulty when player is dominating, plus on-demand trash talk. |
| ❓ **quizAgent** | gpt-4o-mini | Generates 20 multi-choice questions per session, varied topics, anti-repeat (recent question texts excluded from prompt). |

Additional services:

- **lessonAgent** — generates 4 lesson types (vocabulary / grammar / scramble / quiz) per learning unit; cached per `unit_id × lesson_index × lesson_type`
- **wordOfDayAgent** — one global "Word of the Day" per tier, same word for every player
- **wordDetailAgent** — kid-safe word card (meaning, sentence, example) on tap
- **translateAgent** — translates the meaning into 5 languages on demand
- **tutorChat (`/api/tutor/chat`)** — Pro Max 1-on-1 AI tutor chat with kid-safe system prompt
- **parentApi (`/api/parent/summary`)** — weekly progress chart for the Parent Dashboard

---

## 🎓 Learning Academy (CEFR)

32 units across 4 CEFR stages:

| Stage | Units | Focus |
|---|---|---|
| **A1 Foundations** | 1–8 | Greetings, numbers, family, basic verbs |
| **A2 Building Blocks** | 9–16 | Daily routines, food, weather, hobbies |
| **A2+ Vocabulary** | 17–24 | Travel, work, feelings, descriptions |
| **B1 Intermediate** | 25–32 | Opinions, future plans, abstract topics |

Each unit has 4 lessons (vocabulary, grammar, scramble, quiz) cached in
Supabase so the same lesson is identical across devices.

---

## 🛠 Architecture

```
┌──────────────────┐      HTTPS      ┌──────────────────┐
│  Expo / RN app   │ ◀──────────────▶│  Express backend │
│  (Android APK)   │                 │  (Vercel)        │
└────────┬─────────┘                 └────────┬─────────┘
         │                                    │
         │ Auth + Stats sync                  │ Reads / writes
         ▼                                    ▼
   ┌─────────────────────────────────────────────┐
   │  Supabase                                   │
   │  ├ auth.users                               │
   │  ├ user_stats  (per-user lifetime stats)    │
   │  ├ wq_user_leaderboard  (tier ranking)      │
   │  ├ wq_subscriptions  (plan + trial state)   │
   │  ├ wq_daily_usage    (per-day usage caps)   │
   │  ├ wq_learn_progress / wq_learn_attempts    │
   │  ├ wq_learn_lesson_cache                    │
   │  └ Storage bucket: avatars                  │
   └─────────────────────────────────────────────┘
```

- **Mobile** — Expo SDK 54, React Native 0.81, React Navigation 7, expo-av
  (BGM + SFX), expo-image-picker, expo-speech.
- **Backend** — Node.js + Express, deployed on Vercel. Stateless; all
  persistence is Supabase.
- **AI** — OpenAI `gpt-4o-mini` via `utils/llm.js`.
- **Auth + Storage** — Supabase Postgres with RLS, anon-read policies for
  public leaderboard, `avatars` storage bucket for photo uploads.
- **1v1 Battle MMR** — Elo rating with K = 32, queue matches players within
  the same tier band.

---

## 📡 Live observability

Two trace consoles are mounted on the backend:

| Route | What it shows |
|---|---|
| `/logs` | Every AI agent run — prompt, response, latency, token usage, status. Filter by agent + status + range. |
| `/dashboard` | Game-wide events grouped by category — tier-ups, quiz answers, daily words, battle results, subscriptions, lessons, avatars, auth, paywall hits. 9 tabbed views + per-category counts. |

Mobile fires events via `src/utils/trace.js` (`POST /api/event`) — fire-and-forget,
never blocks gameplay. Backend AI agents log automatically through `utils/logger.js`.
Both surfaces read from the same Supabase `agent_logs` table and refresh every 2–3 s.

---

## 📁 Repository layout

```
wordquest/
├── mobile/                  Expo / React Native app
│   ├── App.js               Stack navigator + provider tree
│   ├── app.json             Expo config (versionCode lives here)
│   ├── home_design/         Visual assets (backgrounds, png icons)
│   ├── assets/sounds/       BGM + SFX (incl. synthesized win + word-found)
│   ├── app-logo.jpeg
│   ├── splash.jpeg
│   └── src/
│       ├── screens/         Every game screen (Home, Game, Battle, etc.)
│       ├── components/      Confetti, ConfirmModal, AnimatedSplash, etc.
│       └── utils/           api, supabase, settings, plan, tiers, sound, storage, theme, auth
├── backend/                 Node.js + Express
│   ├── server.js
│   ├── routes/              quickplayApi, tierApi, battleApi, learnApi, quizApi, subscriptionApi, parentApi, tutorApi
│   ├── agents/              9 AI agents above + lessonAgent etc.
│   ├── config/              tiers ladder, curriculum (32 units)
│   └── WQ_ALL_PATCH.sql     One-shot SQL — tables + RLS + avatars bucket
└── README.md
```

---

## 🚀 Run locally

### Backend

```bash
cd backend
npm install
cp .env.example .env       # set OPENAI_API_KEY + SUPABASE_URL/KEY
npm run dev                # localhost:3000
```

### Mobile

```bash
cd mobile
npm install
npx expo start             # scan QR with Expo Go (dev),
                           # OR build APK with `eas build -p android --profile preview`
```

### Supabase

Run the one-shot SQL once in your project's SQL Editor:

```bash
backend/WQ_ALL_PATCH.sql
```

Creates: `wq_subscriptions`, `wq_daily_usage`, anon-read policies on
`user_stats / wq_player_ranking / wq_learn_progress`, the `avatars` storage
bucket with public access, and adds `avatar_url / avatar_emoji /
avatar_color` columns to `wq_user_leaderboard`.

---

## 🎨 UI / UX features

- **Cartoonish 3D style across every screen** — `ImageBackground` + teal
  tint + wooden plaque titles (#92400e + #fbbf24 border + #451a03 bottom) +
  chunky cards with 3px white borders + 7–9px dark bottom borders for depth.
- **Animations everywhere** — pulsing logo glow halo, bobbing Quick Play CTA,
  swaying sword on 1v1 Battle card, gradient yellow→green progress bar,
  staggered card entrance, glowing tier-colored avatar ring, floating
  particles on most screens.
- **Tier-up celebration** — 8-step animation sequence (fade in → corner
  confetti bursts → staggered trophies → spring-bounce badge → glow halo →
  title slide-up → subtitle fade → bouncing green pill button), continuous
  falling confetti for ~3s.
- **AI Tutor chat** (Pro Max) — custom-drawn cartoon robot avatar with
  pulsing antenna, purple chat bubbles + green user bubbles, pill input with
  glowing border, keyboard-avoiding scroll.
- **Onboarding** — 4 cartoonish slides (Welcome → Find Hidden Words →
  Daily & Quiz → Climb the Tiers) with custom-drawn illustrations,
  diagonal swipe animation, bouncing START button.
- **Custom Avatar** — photo upload (Supabase Storage), 20 emoji avatars,
  10 color backgrounds, 6 nameplate border styles.
- **Sound** — synthesized 1.25s ascending fanfare win jingle (C5→E5→G5→C6 +
  bell chord) and 0.25s "pop" word-found ding, BGM loops on Home + Game,
  separate battle BGM.

---

## 🔐 Age gating

WordQuest is designed exclusively for kids aged 13 and under. On sign-up the
date of birth is captured; if computed age > 13 the user lands on an
"AgeBlocked" screen with a friendly cartoon owl + apologetic sign, and the
sign-out flow resets state and sends them back to the signup form.

---

## 📜 Tech stack summary

- **Mobile**: Expo SDK 54 · React Native 0.81 · React Navigation 7 · expo-av
  · expo-image-picker · expo-speech · base64-arraybuffer for avatar uploads
- **Backend**: Node.js · Express · `@supabase/supabase-js` · `openai`
- **AI**: OpenAI `gpt-4o-mini`
- **Database**: Supabase Postgres + Row-Level Security
- **Storage**: Supabase Storage (avatars bucket)
- **Hosting**: Vercel (backend), Expo Application Services (Android APK)

---

## 📝 License

Built by [@huzi-star](https://github.com/huzi-star) for educational use.
Originally created for the Google Antigravity Hackathon #AISeekho2026
("Agentic Game Quest" track) and evolved into a full kid-oriented
production app.
