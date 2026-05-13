# 📦 Building the WordQuest Pakistan APK with EAS

Step-by-step. Total time: **~15-20 minutes** (mostly cloud build wait).

> ⚠️ **Before you build** — the APK ships with whatever `BASE_URL` is in
> `mobile/src/utils/api.js` at build time. Phone can't reach `localhost`
> from inside an installed APK on another network, so for a submission
> build you must either:
> - Deploy the backend (Render / Railway / Fly.io) and put the public URL
>   in `api.js` **before** building, OR
> - Keep the LAN IP for a "demo on the same Wi-Fi" build.
>
> If the judges are on a different network, you **must** deploy the backend.
> Ping me and I'll set up Render deploy.

---

## 1. One-time setup

### Make an Expo account (free)
- Go to https://expo.dev/signup
- Sign up with email/Google. Remember the **username** — you'll need it.

### Install EAS CLI
```bash
npm install -g eas-cli
```

Verify:
```bash
eas --version
```

### Log in
```bash
eas login
```
Paste your Expo username + password.

---

## 2. Initialize the project on EAS

From the `mobile/` folder:

```bash
cd mobile
eas init
```

It will ask:
- "Would you like to create a project?" → **Yes**
- It writes `extra.eas.projectId` into `app.json` automatically.

(`eas.json` is already in the repo with `preview` = APK profile.)

---

## 3. Build the APK

```bash
eas build -p android --profile preview
```

It will ask:
- "Generate a new Android Keystore?" → **Yes** (EAS manages it for you).
- Wait — the build runs **in the cloud**, not on your computer.

You'll see a URL like:
```
https://expo.dev/accounts/<your-name>/projects/wordquest-pakistan/builds/<id>
```

Open it in browser to watch progress. Typical build time: **10-15 minutes**.

When done, the page shows a big **"Download"** button → `application-<hash>.apk`.
Use this `.apk` for the hackathon submission.

---

## 4. Install on a phone (testing)

- Download the APK on the phone.
- Open it from the file manager.
- If Android blocks it ("install from unknown sources"), allow it for the
  browser/file manager you used to download.
- App icon appears as **WordQuest Pakistan**.

---

## 5. Common errors and fixes

### `Project does not contain "android.package"`
Already fixed in `app.json` (`com.wordquest.pakistan`).

### `Failed to resolve EAS project`
Run `eas init` again from inside `mobile/`.

### Build fails on `react-native-screens` / autolinking
Run `npx expo install --fix` inside `mobile/`, commit the result, retry.

### APK installs but instantly closes
- Backend URL is wrong / unreachable from the phone.
- Open `mobile/src/utils/api.js`, set `BASE_URL` to a public URL
  (deployed backend), rebuild.

### Phone shows "App not installed"
Usually a duplicate signing key — uninstall the older copy first.

---

## 6. Free tier limits

Expo's free tier gives you **30 free Android builds per month**, which is
plenty for a hackathon. Build queues for free accounts can sit for a few
minutes during peak hours — be patient.

---

## 7. Quick reference

```bash
# From the mobile/ folder, after eas login:
eas init                                  # link project (first time only)
eas build -p android --profile preview    # produces an APK
eas build:list                            # see your builds
```

Submit the `.apk` URL or download it and attach to the hackathon form.
