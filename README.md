# Smart Garage

One repository, five pieces of one system. All of them talk to the same
Firebase project, so a car checked in at the gate is on the boss's screen
before the receptionist has put the phone down.

| Folder | What it is | How it ships |
| --- | --- | --- |
| `garage/` | The admin desktop app (React) and its Electron shell in `garage/desktop`. Works fully offline; syncs when the internet comes back. | Windows `.exe` on the GitHub release |
| `garage-boss-dashboard/` | The owner's web view of the same data — read-mostly, openable from anywhere. | Vercel |
| `reception-android/` | The Kotlin/Compose phone app the client fills in on arrival. | `.apk` on the GitHub release |
| `reception/` | The same check-in flow as an installable web app, for a tablet at the desk. | Vercel |
| `website/` | The public marketing site, editable by the admin without touching code. | Vercel |
| `shared/` | Types both the web surfaces agree on. | imported directly |

## Releasing the desktop app and the APK

Push a tag. That is the whole procedure.

```bash
git tag v1.2.0
git push origin v1.2.0
```

`.github/workflows/release.yml` then builds the Windows installer and the
Android APK in parallel and publishes **one** release carrying both, at
`https://github.com/map-boy/smart-garage/releases`. The version in the tag is
stamped onto both artifacts, so the installer says 1.2.0 and so does the phone.

You can also run it by hand from the **Actions** tab (*Release* → *Run
workflow*) and type the version, which is useful for a rebuild without a new
tag.

## Deploying the three websites

Merging to `main` deploys them. Only the app whose files changed is rebuilt, so
a copy tweak on the marketing site does not redeploy the dashboard. Every pull
request gets its own preview URL, printed in the run summary.

Each site is a separate Vercel project pointed at this repository with its
**Root Directory** set to that folder (`website`, `reception`,
`garage-boss-dashboard`).

## Secrets to set

**Settings → Secrets and variables → Actions.** Nothing here is optional
magic — each one is named where it is used, and a missing one produces a
warning in the run rather than a mysterious failure.

| Secret | Needed for |
| --- | --- |
| `VERCEL_TOKEN` | all three site deploys |
| `VERCEL_ORG_ID` | all three site deploys |
| `VERCEL_PROJECT_ID_WEBSITE` | marketing site |
| `VERCEL_PROJECT_ID_RECEPTION` | reception PWA |
| `VERCEL_PROJECT_ID_BOSS` | boss dashboard |
| `FIREBASE_PROJECT_ID` | Android build |
| `FIREBASE_ANDROID_APP_ID` | Android build |
| `FIREBASE_API_KEY` | Android build |
| `FIREBASE_MESSAGING_SENDER_ID` | Android build |
| `FIREBASE_STORAGE_BUCKET` | Android build |
| `ANDROID_KEYSTORE_BASE64` | signing the APK properly |
| `ANDROID_KEYSTORE_PASSWORD` | signing the APK properly |
| `ANDROID_KEY_ALIAS` | signing the APK properly |
| `ANDROID_KEY_PASSWORD` | signing the APK properly |

`VERCEL_ORG_ID` and each `VERCEL_PROJECT_ID_*` are in that project's
`.vercel/project.json` after running `vercel link`, or under Vercel *Project
Settings → General*.

The `VITE_FIREBASE_*` values the three sites need are **not** GitHub secrets —
set them in each Vercel project's *Environment Variables*. They end up in the
public JavaScript bundle either way; what protects the data is `firestore.rules`,
not keeping those values quiet.

### Signing the APK

Without `ANDROID_KEYSTORE_BASE64` the release APK is signed with the debug key.
It installs and runs, but a properly signed build can never upgrade over it, so
create the keystore before the first real hand-out:

```bash
keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias smartgarage
base64 -w0 release.jks    # paste into ANDROID_KEYSTORE_BASE64
```

Keep `release.jks` somewhere safe and backed up. Lose it and the app can never
be updated on a phone that already has it — it has to be uninstalled first.

## Running any of it locally

```bash
cd website && npm ci && npm run dev            # or reception, garage-boss-dashboard
cd garage  && npm ci && npm run dev            # admin app in the browser
cd garage/desktop && npm ci && npm run dev     # admin app in its Electron window
```

For the phone app, copy `reception-android/local.properties.example` to
`local.properties`, fill in the Firebase values, and open the folder in Android
Studio.

## What CI checks

Every push builds and typechecks all four web apps and compiles the Android
app. The Windows installer is packaged on `main` and on demand only, because
Windows runner minutes bill at double rate.

## Known loose ends

- Desktop auto-update is switched off in `garage/desktop/electron/src/main.js`.
  `electron-updater` reads the release feed over plain HTTPS with no
  credentials, which a private repository refuses. Turn it on when this repo
  goes public, or host `latest.yml` somewhere reachable.
- `garage/functions/` still holds a pile of one-off `.sh` and `.txt`
  debugging scratch, and there are `*.bak*` copies of source files tracked in
  git. Harmless, but worth deleting when convenient.
