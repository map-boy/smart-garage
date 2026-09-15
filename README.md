# Smart Garage

One repository, six pieces of one system. All of them talk to the same
Firebase project, so a car checked in at the gate is on the boss's screen
before the receptionist has put the phone down.

| Folder | What it is | How it ships |
| --- | --- | --- |
| `garage/` | The admin desktop app (React) and its Electron shell in `garage/desktop`. Works fully offline; syncs when the internet comes back. | Windows `.exe` on the GitHub release |
| `garage-boss-dashboard/` | The owner's web view of the same data — read-mostly, openable from anywhere. | Vercel |
| `reception-android/` | The Kotlin/Compose phone app the receptionist fills in at the gate: who arrived, what they want, which parts go on the car. | `.apk` on the GitHub release |
| `stock-android/` | The Kotlin/Compose phone app the stock manager keeps the shelf straight with — receive, recount, and read the ledger. | `.apk` on the GitHub release |
| `reception/` | The same check-in flow as an installable web app, for a tablet at the desk. | Vercel |
| `website/` | The public marketing site, editable by the admin without touching code. | Vercel |
| `shared/` | Types both the web surfaces agree on. | imported directly |

## Quick links

Everything live, in one place.

| What | Link |
| --- | --- |
| Marketing site (public) | https://smart-garage-xi.vercel.app |
| Boss dashboard | [Vercel project `garage-website`](https://vercel.com/map-boys-projects/garage-website) |
| Desktop renderer on the web | [Vercel project `garage-management`](https://vercel.com/map-boys-projects/garage-management) |
| Desktop installer + APK downloads | [Releases](https://github.com/map-boy/smart-garage/releases) |
| Latest build (v1.0.0) | [Windows installer](https://github.com/map-boy/smart-garage/releases/download/v1.0.0/Garage.Management.Pro-Setup-1.0.0.exe) &middot; [Reception APK](https://github.com/map-boy/smart-garage/releases/download/v1.0.0/smart-garage-reception-1.0.0.apk) &middot; [Stock APK](https://github.com/map-boy/smart-garage/releases/download/v1.0.0/smart-garage-stock-1.0.0.apk) |
| Build and release runs | [Actions](https://github.com/map-boy/smart-garage/actions) |
| Technician console | [TECHNICIAN.md](TECHNICIAN.md) - hidden support screen in the desktop app |
| Repository secrets | [Settings → Secrets → Actions](https://github.com/map-boy/smart-garage/settings/secrets/actions) |

The two Vercel entries link to the project rather than a fixed address,
because only the marketing site has a production URL pinned so far. Open the
project and its current domain is at the top; paste it here once it settles.

Every pull request also gets its own preview URL for each site, posted by the
Vercel bot as a comment on the PR.

## Releasing the desktop app and the two APKs

Push a tag. That is the whole procedure.

```bash
git tag v1.2.0
git push origin v1.2.0
```

`.github/workflows/release.yml` then builds three things in parallel — the
Windows installer, the reception APK and the stock APK — and publishes **one**
release carrying all of them, at
`https://github.com/map-boy/smart-garage/releases`:

| File | Goes on |
| --- | --- |
| `Garage.Management.Pro-Setup-<version>.exe` | the boss's Windows machine |
| `smart-garage-reception-<version>.apk` | the gate phone |
| `smart-garage-stock-<version>.apk` | the store phone |

The version in the tag is stamped onto all three, so the installer says 1.2.0
and so do both phones. `latest.yml` and the `.blockmap` beside the installer
are what `electron-updater` reads; leave them on the release.

You can also run it by hand from the **Actions** tab (*Release* → *Run
workflow*) and type the version, which is useful for a rebuild without a new
tag.

## Deploying the websites

Vercel's own GitHub integration handles this: it is connected to this
repository and builds on every push, with a preview URL on each pull request.
There is no deploy workflow in `.github/workflows` — adding one would mean two
systems deploying the same folder on the same push.

Each site is a separate Vercel project pointed at this repository with its
**Root Directory** set to that folder. Currently connected:

| Vercel project | Root Directory | What it serves |
| --- | --- | --- |
| `garage-website` | `garage-boss-dashboard` | the owner's admin dashboard for the desktop app |
| `garage-management` | `garage` | the desktop app's renderer, served on the web |

The project names predate the folder layout; `garage-website` is the admin
dashboard, not the marketing site. `website/` and `reception/` have no Vercel
project yet — create one for each when they are ready to go live, with Root
Directory set accordingly.

Each folder carries a `vercel.json` holding only what the dashboard cannot
express: the single-page rewrite that keeps deep links working, long cache
headers for fingerprinted assets, and (for `reception`) a no-cache header on
the service worker so a phone cannot pin itself to last week's build. Build and
install commands are deliberately **not** set there, so the Vercel project's own
settings stay in charge.

Firebase values (`VITE_FIREBASE_*`) belong in each Vercel project's
Environment Variables. They are compiled into the public bundle either way, so
`firestore.rules` is what actually protects the data.

## Secrets to set

**Settings → Secrets and variables → Actions.** Nothing here is optional
magic — each one is named where it is used, and a missing one produces a
warning in the run rather than a mysterious failure.

Websites need nothing here — Vercel deploys them through its own GitHub
connection, and their environment variables live in Vercel.

| Secret | Needed for |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Android build |
| `FIREBASE_ANDROID_APP_ID` | Android build |
| `FIREBASE_API_KEY` | Android build |
| `FIREBASE_MESSAGING_SENDER_ID` | Android build |
| `FIREBASE_STORAGE_BUCKET` | Android build |
| `ANDROID_KEYSTORE_BASE64` | signing the APK properly |
| `ANDROID_KEYSTORE_PASSWORD` | signing the APK properly |
| `ANDROID_KEY_ALIAS` | signing the APK properly |
| `ANDROID_KEY_PASSWORD` | signing the APK properly |

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
app, so a commit that breaks one is visible before Vercel tries to deploy it.
The Windows installer is packaged on `main` and on demand only, because Windows
runner minutes bill at double rate.

## Known loose ends

- Desktop auto-update is switched off in `garage/desktop/electron/src/main.js`.
  `electron-updater` reads the release feed over plain HTTPS with no
  credentials, which a private repository refuses. Turn it on when this repo
  goes public, or host `latest.yml` somewhere reachable.
- `garage/functions/` still holds a pile of one-off `.sh` and `.txt`
  debugging scratch, and there are `*.bak*` copies of source files tracked in
  git. Harmless, but worth deleting when convenient.
