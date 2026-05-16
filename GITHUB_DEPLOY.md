# 📤 GitHub Push + Vercel Auto-Deploy Guide

Goal: Code GitHub pe push karna, phir Vercel ko GitHub se connect karna —
taa keh future mein code push karte hi backend auto-redeploy ho jaye.

Total time: **~10 min**.

---

## Part A — GitHub pe push

### Step 1 — GitHub pe naya repo banao

Browser mein: **https://github.com/new**

- **Repository name:** `wordquest-pakistan`
- **Description:** `AI-powered Pakistan-themed word puzzle game — Antigravity Hackathon #AISeekho2026`
- **Visibility:** **Public** (hackathon submission ke liye usually public chahiye)
- ⚠️ **Do NOT initialize with README, .gitignore, or license** — humara already hai
- Click **"Create repository"**

GitHub ab ek page dikhayega "...or push an existing repository from the command line" — wahan se URL copy karna hai. Ya niche steps follow karo.

### Step 2 — Remote add + push

PowerShell mein:

```powershell
cd C:\Users\Huzi\Desktop\cricket-game\wordquest
git remote add origin https://github.com/YOUR_USERNAME/wordquest-pakistan.git
git push -u origin main
```

(`YOUR_USERNAME` ki jagah apna GitHub username daalo.)

Pehli baar push pe **GitHub login prompt** aayega:
- Browser kholega → GitHub login → "Authorize Git Credential Manager" click karo
- Wapas terminal mein push complete hoga

Done — code ab GitHub pe hai. URL: `https://github.com/YOUR_USERNAME/wordquest-pakistan`

---

## Part B — Vercel ko GitHub se connect karo

### Step 3 — Vercel pe new project

Browser mein: **https://vercel.com/new**

- **"Import Git Repository"** section dikhega
- Pehli baar ho to **"Install GitHub App"** click karo → permissions allow karo (sirf jo repo deploy karna hai uska access do)
- Apna `wordquest-pakistan` repo dhoondo → **"Import"** click karo

### Step 4 — Configure project

Important settings:

| Field | Value |
|---|---|
| **Framework Preset** | Other |
| **Root Directory** | `backend` ⚠️ (click "Edit" → select `backend`) |
| **Build Command** | (leave empty) |
| **Output Directory** | (leave empty) |
| **Install Command** | `npm install` |

### Step 5 — Environment variables add karo

"Environment Variables" section expand karo:

- **Name:** `GEMINI_API_KEY`
- **Value:** `AIzaSyDuKquszNRNV4kjCpbnVbQ3o3kM1JcPSHA`
- All 3 environments check karo (Production, Preview, Development)
- **"Add"** click karo

### Step 6 — Deploy

Bada **"Deploy"** button click karo.

30-60 second wait karo. Build logs live dikhenge. End mein:

```
✅ Production: https://wordquest-pakistan-xxx.vercel.app
```

URL copy karo.

### Step 7 — Test

Browser mein open karo:
```
https://wordquest-pakistan-xxx.vercel.app/api/health
```

`{"status":"ok"}` aana chahiye ✅

---

## Part C — Mobile app ko deployed URL pe point karo

Edit `mobile/src/utils/api.js`:

```js
export const BASE_URL = 'https://wordquest-pakistan-xxx.vercel.app';
```

Phir commit karke push karo:

```powershell
cd C:\Users\Huzi\Desktop\cricket-game\wordquest
git add mobile/src/utils/api.js
git commit -m "Point mobile app to deployed Vercel backend"
git push
```

Expo Go mein shake → **Reload** → test karo. Ab phone kisi bhi network par ho, game chalega 🎉

---

## 🎁 Auto-deploy bonus

Ab onwards, **har baar jab tum code push karoge `main` branch pe, Vercel
automatically redeploy karega** — 30-60 second mein latest code live ho jata
hai. Manual `vercel --prod` nahi chalana padega.

Example workflow:
```powershell
# Code mein kuch change karo (e.g., naya badge add karo)
git add backend/agents/rewardAgent.js
git commit -m "Add Karachi King badge"
git push
# ↑ ye push hote hi Vercel auto-build kar dega
```

Vercel dashboard pe har deploy ki history dikhti hai — rollback bhi 1 click mein.

---

## Troubleshooting

### Push pe `Permission denied (publickey)` ya `403 Forbidden`
- HTTPS URL use karo (jo step 2 mein hai), SSH nahi
- Git Credential Manager popup mein dobara login karo

### Push pe `failed to push some refs`
Local mein `main` branch hai but GitHub default `master` expect kar raha hai:
```powershell
git branch -M main
git push -u origin main
```
(Already maine `-b main` se init kiya hai, but just in case.)

### Vercel build fails: `Cannot find module 'express'`
**Root Directory** `backend` set nahi kiya. Project settings → General → Root Directory → `backend` → Save → Redeploy.

### `Function timed out`
Gemini call slow ho gaya. `backend/vercel.json` mein add karo:
```json
{
  "version": 2,
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "/server.js" }],
  "functions": {
    "server.js": { "maxDuration": 30 }
  }
}
```
Commit → push → auto-redeploy.

### Vercel deploy successful but mobile app error `Network Error`
- API URL mein `https://` hai? (Vercel HTTPS deta hai, `http://` nahi chalega)
- `api.js` save kiya aur Expo reload kiya?

---

## Quick reference

```powershell
# Daily workflow after setup:
git add .
git commit -m "Description"
git push
# ↑ Vercel auto-redeploys backend
```

```powershell
# Mobile changes ke liye Metro restart:
cd mobile
npx expo start -c
```
