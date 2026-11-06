# C & V Smart Garage (hub app)

Last updated: 2026-11-06
<!-- code-hash: 9696f9b016d1 -->

## What this is

One installable web app (PWA) that replaces two separate apps: the receptionist laptop app and the Android app. Reception, workers, the boss and the admin all use the same app, each seeing only what their role allows. Anyone can install it:

- **Phone (Android, Chrome):** open the site, menu, "Install app" or "Add to Home screen".
- **iPhone (Safari):** Share button, "Add to Home Screen".
- **Laptop (Chrome or Edge):** click the install icon in the address bar.

## Works offline (offline-first)

Every check-in and status change is saved on the device first and uploaded to the database automatically when the connection returns. Items not uploaded yet show "not synced yet", and the sidebar shows Online or Offline plus a "waiting to sync" count. After the first online sign-in, the app opens and works offline. Customer suggestions also work offline because the customer list is cached on the device. Creating accounts needs internet. Installed copies update themselves on the next open.

## Roles and screens

| Role | Screens | What they do |
|------|---------|--------------|
| technician (admin) | Dashboard, Reception, My jobs, Team | Everything, plus creates and disables accounts |
| secretary | Reception | Registers visits, assigns workers, marks visits done |
| worker | My jobs | Sees jobs assigned to them today, starts and finishes them, adds notes |
| boss | Dashboard | Sees the day's visits, weekly chart, status split, workers, customers |

## Signing in

The login screen has three choices:

- **Boss** and **Admin**: password only. The username is fixed (`boss` or `admin`).
- **Staff** (reception and workers): username and password.

Behind the scenes a username becomes `username@hub.local` in Firebase Auth. There is no public sign-up. The admin creates accounts in Team; a boss account needs only a password.

The two starting accounts (admin and boss) are created or updated by `scripts/bootstrap-garage.cjs`. Passwords are written to `admin-login.txt`, which is never committed. Running the script with a password argument sets that password: `node scripts/bootstrap-garage.cjs <adminPassword> [bossPassword]`.

## Reception check-in suggestions

Typing in Name or Phone shows known customers (name, phone, number of visits, last visit, last reason). Picking one fills both boxes and shows everything about that person: phone, total visits, last visit and the full history (reason, date, worker, note, status). The Reason box suggests the person's earlier reasons and common ones.

## Firebase (important)

This app uses the SAME Firebase project as the garage management system: **garage-management-6f1eb**. To keep the two apart:

- Hub data lives only in the collections `hubUsers`, `hubOrgs/{orgId}/visits` and `hubOrgs/{orgId}/visitors`.
- The hub rules are a separate block inside the parent file `../firestore.rules`. A copy is kept in `docs/firestore-hub-rules.txt`.
- **Never run `firebase deploy` for rules from inside this folder.** This folder has no firebase.json on purpose. Rules are deployed from the parent folder, after comparing with the live rules.
- The old project vaf-hub-48441 is not used.

Organisation id used by all accounts: `cv-smart-garage`.

## Run it locally

    npm install
    npm run dev -- --port 5199 --strictPort --open

Use port 5199 so the browser does not mix this app's service worker with other local apps. Settings come from `.env` (copied from the garage project's web config, never committed). Keys are listed in `.env.example`.

## Build

    npm run build

The build first runs `scripts/readme-check.mjs`. If the code changed but this README was not updated, the build fails.

## Rule: keep this README current

Every change to the app must update this README: add a line to the Changelog, fix any section that changed, then run `npm run readme:stamp`. The stamp records a fingerprint of `src/`, `vite.config.ts`, `index.html` and `docs/firestore-hub-rules.txt`.

## Project layout

- `src/main.tsx`, `src/App.tsx`: app shell, sidebar, routing by role
- `src/auth.tsx`: sign-in state and the user's profile
- `src/firebase.ts`: Firebase setup, offline cache, account creation
- `src/hooks.ts`: live data hook, online and sync status helpers
- `src/pages/`: Login, Reception, Worker, Boss (dashboard), Technician (Team)
- `src/styles.css`: the look (dark sidebar, glass cards, charts)
- `scripts/`: account bootstrap and the README check
- `docs/firestore-hub-rules.txt`: the hub's Firestore rules block
- `vite.config.ts`: PWA manifest (app name, colours, icons, offline caching)

## Secrets and safety

- `.env`, `admin-login.txt`, `recon/` and `backups/` are git-ignored. Do not commit them.
- Do not commit `../service-account.json`. It is used only by the scripts.
- Back up before changing rules; the live rules were saved to `backups/` before the hub block was added.

## Changelog

- 2026-11-06: Added a receptionist role (add-only: new visits, no editing or marking done). Secretary/technician get an all-visits log on Reception. Admin can type a chosen password when resetting, not only random.

- 2026-11-06: Admin can reset a staff/boss password from Team (Cloud Function, admin-only); shows the new password once.

- 2026-11-06: Renamed to "C & V Smart Garage". Moved the hub onto the garage Firebase project (garage-management-6f1eb) with its own `hubUsers` and `hubOrgs` collections and rules block. Added the admin bootstrap script and this README with its build check.
- 2026-11-06: Fixed the admin bootstrap script (service-account path, firebase-admin modular imports, login file location).
- 2026-11-06: Hub rules block deployed to the live garage project with the Firebase CLI from the parent folder (docs/firestore-hub-rules.txt is the copy).
- 2026-11-06: New interface (dark sidebar, glass cards, dashboard with weekly chart and status donut, mobile bottom bar). Reception name and phone suggestions with a full customer history card. Offline-first sync status. Boss and Admin password-only login; boss account created. Admin password changed.