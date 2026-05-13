# 🚀 Backend ko Vercel pe deploy karne ka guide

Total time: **~5-10 minutes**.

---

## Step 1 — Vercel account banao (free)

Browser mein: **https://vercel.com/signup**
GitHub / GitLab / email se signup karo.

---

## Step 2 — CLI login

PowerShell mein:

```powershell
cd C:\Users\Huzi\Desktop\cricket-game\wordquest\backend
vercel login
```

- Email daalo (jo Vercel pe signup kiya hai)
- Inbox mein verification email aayega — link click karo
- Terminal mein "Success!" milega

---

## Step 3 — Deploy

```powershell
vercel
```

Ye prompts aayenge:

- **Set up and deploy?** → `Y`
- **Which scope?** → apna account choose karo (Enter dabao)
- **Link to existing project?** → `N`
- **What's your project's name?** → `wordquest-backend` (ya Enter for default)
- **In which directory is your code located?** → `./` (Enter dabao)
- **Want to modify settings?** → `N`

Deploy chalega → **30-60 second**. End mein URL milega:

```
✅ Production: https://wordquest-backend-xxx.vercel.app
```

Wo URL **copy karo**.

---

## Step 4 — Gemini API key add karo

Important: `.env` Vercel pe upload nahi hota. Manually add karna padega.

```powershell
vercel env add GEMINI_API_KEY
```

- **Value daalo:** `AIzaSyDuKquszNRNV4kjCpbnVbQ3o3kM1JcPSHA`
- **Which environments?** → spacebar se sab select karo (Production, Preview, Development) → Enter

Phir redeploy:

```powershell
vercel --prod
```

---

## Step 5 — Test karo

Browser mein open karo:
```
https://wordquest-backend-xxx.vercel.app/api/health
```

Milna chahiye: `{"status":"ok"}` ✅

Phir generate-level test:
```powershell
curl -X POST https://wordquest-backend-xxx.vercel.app/api/generate-level -H "Content-Type: application/json" -d '{\"playerStats\":{\"roundsPlayed\":0}}'
```

JSON response aana chahiye with category, grid, words.

---

## Step 6 — Mobile app ko Vercel URL pe point karo

File: `mobile/src/utils/api.js`

```js
export const BASE_URL = 'https://wordquest-backend-xxx.vercel.app';
```

(Apna actual deployed URL daalo — `xxx` ki jagah.)

Save → Expo Go mein reload (shake → Reload).

Ab phone pe game khelo — ye **kisi bhi network se chalega** kyun ke backend public hai.

---

## Step 7 — APK build karo deployed URL ke saath

Ab APK build karoge to wo bhi public backend use karega:

```powershell
cd ..\mobile
eas build -p android --profile preview
```

Wo `.apk` judges kisi bhi network se install karke khel sakte hain. 🎉

---

## Vercel free tier limits

- 100 GB bandwidth/month
- 100 hours serverless execution/month
- Cold start ~500ms (pehli request slow, baqi fast)

Hackathon ke liye **bohot zyada** hai.

---

## Troubleshooting

### "Function timeout"
Vercel free tier mein 10 second max execution. Gemini call kabhi-kabhi 5-8 sec leta hai — usually fine, but agar issue ho to `vercel.json` mein add karo:
```json
"functions": {
  "server.js": { "maxDuration": 30 }
}
```

### `404 NOT_FOUND` on /api/health
- `vercel.json` ka `routes` check karo
- Redeploy: `vercel --prod`

### Gemini "API key not valid"
- `vercel env ls` se check karo key set hai
- `vercel env rm GEMINI_API_KEY` phir wapas add karo
- `vercel --prod` se redeploy

### CORS error from app
- Already configured: `cors({ origin: '*' })` in server.js
- Agar phir bhi issue → make sure app `https://...` use kar raha hai (Vercel auto-HTTPS deta hai)

---

## Quick reference

```bash
vercel              # deploy preview
vercel --prod       # deploy production
vercel env ls       # list env vars
vercel logs         # see runtime logs
vercel domains      # custom domain (optional)
```
