# 🎬 WordQuest — Demo Video Voiceover Script

**Target length:** 4 minutes (within the 3–5 min hackathon range)
**Style:** Calm, confident voiceover. Mix of English + light Roman Urdu is fine (matches the app).
**Recording tip:** Record the screen first (with phone in screen-mirror or QuickTime / scrcpy), then dub the voiceover on top in a video editor. This is much easier than live narration.

---

## 🎙 Section breakdown

| Section | Length | What's on screen | Voiceover |
|---|---|---|---|
| 1. Hook & intro | 0:00 – 0:20 | Splash → Home screen | Below ⬇ |
| 2. Auth + onboarding | 0:20 – 0:45 | Login screen → enter creds → land on Home | Below ⬇ |
| 3. Quick Play with agents | 0:45 – 1:30 | Home → Quick Play → Category screen → Game | Below ⬇ |
| 4. Win round → AI feedback loop | 1:30 – 2:00 | RoundComplete with stars | Below ⬇ |
| 5. Level Mode + retry agency | 2:00 – 2:30 | Levels screen → tap level 5 → play | Below ⬇ |
| 6. Daily Challenge | 2:30 – 2:50 | Daily Challenge screen | Below ⬇ |
| 7. Quiz Mode | 2:50 – 3:15 | Quiz screen with premium loading | Below ⬇ |
| 8. Live trace dashboard | 3:15 – 3:40 | Browser → /logs page | Below ⬇ |
| 9. Stats + Settings | 3:40 – 3:55 | Stats dashboard → Settings | Below ⬇ |
| 10. Close | 3:55 – 4:00 | GitHub link on screen | Below ⬇ |

---

## 🎙 Full voiceover lines

> Read these in order. The bracketed `[ACTION]` lines tell you what to film, not what to say.

---

### 1. Hook & intro (0:00 – 0:20)

`[ACTION]` Open the app from the home screen. The animated splash plays — logo zoom-in, sparkle ring, then fade to Home.

> "This is **WordQuest** — an AI-powered word puzzle game I built for the Antigravity Hackathon Challenge Four: Agentic Game Quest. Every puzzle, every quiz, every coaching line is generated on demand by **nine cooperating AI agents** — not a single hardcoded round. Let me show you how."

---

### 2. Auth + onboarding (0:20 – 0:45)

`[ACTION]` Tap "Sign in" → type email/password → success → land on Home. Briefly show the eye-icon toggling password visibility.

> "Real authentication, real cloud sync. Players sign in once and their progress, theme, daily-challenge lock state, and per-level high scores follow them across devices via Supabase. Everything you see here is per-user."

---

### 3. Quick Play with agents (0:45 – 1:30)

`[ACTION]` Tap the big green "Play Game" button. Show the AI-thinking Category screen with rotating step indicators, then the result: category, difficulty, time, words.

> "When I tap Play, the **difficulty agent** reads my recent performance and picks the right tier. Then the **level generator agent** asks GPT-4o-mini for a themed word list and weaves it into a grid with words running horizontally, vertically, and diagonally — completely fresh every round."

`[ACTION]` Tap "I'm Ready". Game screen loads. Drag a finger across letters diagonally to find one word. Show the reveal wave + score popup + AI bubble appearing at the top with commentary.

> "While I play, the **commentator agent** drops live encouragement from the top. The **referee agent** validates each word and computes score with a combo multiplier. The **tutor agent** writes a one-sentence cultural note for the word I just found."

`[ACTION]` Find one or two more words to show the combo multiplier `⚡ 1.5x` appearing in the top-right.

> "Streak two words back-to-back and the combo multiplier kicks in — fifteen hundred to three thousand percent score bonus when you're hot."

---

### 4. Win round → AI feedback loop (1:30 – 2:00)

`[ACTION]` Either time-out or finish all words. RoundComplete screen appears with the wooden-plank graphic and stars. Confetti rains down — Pakistani flag, sparkles, crown, trophy emojis.

> "When I clear the round, the **reward agent** generates a personalised encouragement line and tells me what the AI plans for the next round — closing the feedback loop. Stars, badges, score breakdown, all real-time."

`[ACTION]` Scroll down to show "Next Round" or "Try Again" button.

> "On failure, the **same words** get reshuffled into a fresh grid and I retry — the AI never moves me on until I beat the level."

---

### 5. Level Mode + retry agency (2:00 – 2:30)

`[ACTION]` Go back to Home → tap "Levels" card → Levels screen with the premium 3-per-row grid, lock icons, completion stars, and per-level high scores.

> "Level mode has fifteen progressively-harder levels — three by three grid with two words, all the way up to twelve by twelve with twelve words. Each level shows my personal best. If I fail one, the retry button reshuffles the **same words** into a brand-new grid layout — same difficulty, new puzzle."

`[ACTION]` Tap level 5 to start.

---

### 6. Daily Challenge (2:30 – 2:50)

`[ACTION]` Back to Home → tap "Daily Challenge" card. Show either the unlocked card (10×10, 10 words, 100s, 500 points per word reward) or the locked screen with the live countdown ticking.

> "Daily Challenge is a single ten-by-ten round per day with a flat five-hundred-point bonus per word. After I attempt it, a countdown locks the challenge until midnight — so every player worldwide gets a fresh AI-picked category every day."

---

### 7. Quiz Mode (2:50 – 3:15)

`[ACTION]` Tap Quiz Mode → show the premium loading screen with the rotating halo, step cycling, and the stat strip ("20 questions · +200 per answer · 7s per question · Powered by gpt-4o-mini"). Then 1–2 quiz questions.

> "Quiz Mode is a totally different agent — the **quiz agent** asks GPT-4o-mini for twenty fresh multiple-choice trivia questions, with topic variety enforced and recent questions explicitly excluded from the prompt. Seven seconds per question, two hundred points each, total goes into the high score."

`[ACTION]` Answer one question correctly to show the explanation.

---

### 8. Live trace dashboard (3:15 – 3:40)

`[ACTION]` Open a browser, navigate to `https://backend-liart-three-60.vercel.app/logs`. Show the live console with stats grid, agent filter chips, recent traces.

> "This is the real proof of agency. Every single AI call — across all nine agents, in real time — is logged here. Latency, token counts, prompts, responses, errors. I can search, filter by agent, pause the stream, expand any call to see the exact prompt and response. This is how I tuned the agents during development."

`[ACTION]` Click an agent chip (e.g. `quizAgent`), then click a log entry to expand and show the Prompt + Response blocks. Click "Copy".

---

### 9. Stats + Settings (3:40 – 3:55)

`[ACTION]` Back to phone. Home → tap Stats icon top-right. Show the dashboard (total games, words found, time spent, XP/level, recent scores, category mastery).

> "The stats dashboard tracks everything — total rounds, words found, time played, category mastery, recent scores."

`[ACTION]` Tap Settings icon. Quickly cycle through theme picker (Green/Gold/Purple/Neon), language toggle (English/Urdu), and the Change Password row.

> "Four themes, bilingual UI, change-password with three eye-toggle fields, and reset all stats with a premium confirm modal. Daily and Quiz cooldowns are preserved across resets so cheating is impossible."

---

### 10. Close (3:55 – 4:00)

`[ACTION]` Cut to a clean shot of the GitHub link, or the home screen with the brand logo.

> "WordQuest. Nine agents, four game modes, real auth, real cloud sync, live trace observability. Built solo with Antigravity. Code is open on GitHub — link in description. Thanks for watching."

---

## 🧰 Recording checklist

- [ ] Phone screen-record turned on (Android: pull down → Screen Record)
- [ ] Sign out and back in to start at the auth screen for a clean demo
- [ ] Make sure live `/logs` page is in another browser tab, ready to switch to
- [ ] Backend is awake (load `/api/health` once before recording — wakes Vercel cold-start)
- [ ] Sound effects on, vibration on
- [ ] Theme set to Green (default, most legible)
- [ ] Language set to English (universal)

## 🎬 Editing tips

- Add a 30-second background music bed (royalty-free instrumental, low volume)
- Overlay a small bottom-left text label for each scene name ("QUICK PLAY", "DAILY CHALLENGE", etc) for clarity
- Use a 1-second cross-dissolve between major scene cuts — keeps the pace alive
- If your screen-record is laggy on the phone, drag the video into editor at 1.25× speed for the gameplay segments
- Render at 1080p / 30fps minimum
- Keep total under 5 minutes — judges are time-poor

## 🗣 Tone tips for voiceover

- Speak at a steady, slightly slower pace — easier for judges to absorb
- Smile while reading — voice sounds warmer
- Pause for half a beat after each sentence
- Don't whisper — record close to mic, in a quiet room (closet or under a blanket works great)
- If you flub a line, just pause, restart that sentence — clean it up in editor
