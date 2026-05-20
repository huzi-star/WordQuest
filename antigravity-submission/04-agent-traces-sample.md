# Sample Agent Traces

Each section shows a real request/response shape for the corresponding agent.
These are captured from the live production backend.

---

## levelGeneratorAgent — Level 5 request

**Request:**
```http
POST /api/generate-level
Content-Type: application/json

{
  "playerStats": { "roundsPlayed": 0 },
  "language": "english",
  "levelNumber": 5
}
```

**Response:**
```json
{
  "ok": true,
  "difficulty": {
    "difficulty": "easy",
    "gridSize": 6,
    "wordCount": 6,
    "timeLimit": 60,
    "reason": "Level 5 — 6×6 grid, 6 words, 60s.",
    "levelNumber": 5
  },
  "level": {
    "category": "FOOD",
    "categoryEmoji": "🍽️",
    "words": ["BREAD","SPICE","CURRY","FISH","RICE","SALT"],
    "grid": [["..."]],
    "wordPositions": [{"word":"BREAD","startRow":0,"startCol":0,"direction":"horizontal"}],
    "funFact": "Curry is a staple in many South Asian cuisines."
  }
}
```

---

## quizAgent — quiz request

**Request:**
```http
POST /api/generate-quiz
Content-Type: application/json

{
  "count": 20,
  "language": "english",
  "difficulty": "medium",
  "excludeQuestions": ["Q1", "Q2"]
}
```

**Response (truncated to first 2 questions):**
```json
{
  "ok": true,
  "result": {
    "topic": "World Geography and Capital Cities",
    "topicEmoji": "🌍",
    "questions": [
      {
        "question": "What is the capital of Canada?",
        "options": ["Ottawa","Toronto","Vancouver","Montreal"],
        "correctIndex": 0,
        "explanation": "Ottawa is the capital city of Canada, located in the province of Ontario."
      },
      {
        "question": "Which city is the capital of Japan?",
        "options": ["Tokyo","Kyoto","Osaka","Hokkaido"],
        "correctIndex": 0,
        "explanation": "Tokyo is the capital and most populous city of Japan."
      }
    ]
  }
}
```

---

## refereeAgent — word validation

**Request:**
```http
POST /api/validate-word

{
  "word": "MANGO",
  "wordList": ["MANGO","GRAPE","PEACH","APPLE"],
  "foundWords": ["GRAPE"],
  "timeLeft": 67,
  "score": 130,
  "streak": 3
}
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "isValid": true,
    "alreadyFound": false,
    "pointsEarned": 127,
    "newScore": 257,
    "message": "Awesome! +127 points",
    "breakdown": {
      "basePoints": 50,
      "timeBonus": 30,
      "multiplier": 1.5,
      "effectiveStreak": 4
    }
  }
}
```

---

## rewardAgent — end of round

**Request:**
```http
POST /api/round-complete

{
  "wordsFound": 6,
  "totalWords": 6,
  "timeLeft": 32,
  "score": 850,
  "roundNumber": 5,
  "streak": 5,
  "language": "english"
}
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "badges": [
      { "id": "PERFECT_ROUND", "name": "🎯 Perfect Round", "message": "" },
      { "id": "ON_FIRE", "name": "🔥 On Fire", "message": "" }
    ],
    "streakUpdated": 6,
    "roundSummary": { "wordsFound": 6, "totalWords": 6, "pointsEarned": 850, "timeLeft": 32 },
    "encouragement": "Brilliant round! Every word found and on a hot streak!",
    "nextRoundPreview": "The AI will push the difficulty up — get ready for a sharper grid."
  }
}
```

---

## coachAgent — end of session

**Request:**
```http
POST /api/coach

{
  "totalScore": 4250,
  "rounds": 8,
  "bestStreak": 6,
  "avgWordsPerRound": 4.8,
  "avgTimeLeftPerRound": 22,
  "categoriesPlayed": ["FOOD","ANIMALS","SPORTS"],
  "weakCategories": ["MYTHOLOGY"],
  "language": "english"
}
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "headline": "Solid 8-round session — total score 4,250.",
    "strengths": [
      "Strong word recognition — you find most words on the board.",
      "Streak of 6 — your focus is solid."
    ],
    "improvements": [
      "Take a beat to read the category before searching.",
      "These categories tripped you up: MYTHOLOGY."
    ]
  }
}
```

---

## chaalbaazAgent (chat) — banter

**Request:**
```http
POST /api/chat-chaalbaaz

{
  "history": [],
  "message": "Tum kya kar sakte ho mujhe?",
  "playerStats": { "currentStreak": 4, "avgWordsFound": 5 }
}
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "reply": "Streak 4 par itni hawa? Agla round dekhte hain — main words chhupane mein bhi master hun 😏"
  }
}
```

---

## tutorAgent — word explanation

**Request:**
```http
POST /api/explain-word

{ "word": "BIRYANI", "category": "FOOD", "language": "english" }
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "explanation": "Biryani is a layered rice dish flavored with saffron, spices, and meat — popular across South Asia."
  }
}
```

---

## commentatorAgent — half-time prompt

**Request:**
```http
POST /api/commentary

{
  "trigger": "half_time",
  "category": "ANIMALS",
  "wordsFound": 3,
  "totalWords": 6,
  "timeLeft": 45,
  "timeLimit": 90,
  "streak": 1,
  "language": "english"
}
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "comment": "Halfway there — three more to lock down the round!"
  }
}
```
