# Technician console

A hidden screen inside the desktop app for fixing a garage's install without a
database client, a deploy, or a phone call to whoever built it.

## Opening it

1. Open the desktop app.
2. In the sidebar, below the user card, there is a small grey wrench labelled
   **Service**. It is deliberately not a menu item — staff should never wander
   into it.
3. Enter the technician password.

The password is `garage-technician` unless `VITE_TECHNICIAN_PASSWORD` was set
when the app was built.

The session stays unlocked for 8 hours, survives navigation and restarts, and
can be ended at any time with **Exit technician mode** in the top right.

## What each section does

### Diagnostics

**Check everything** runs, in order: who you are signed in as, whether
Firestore answers, whether a write is actually accepted, whether file storage
answers, when each paired phone last checked in, and whether anything is stuck
unsynced.

Each check forces a real round trip to the server. That matters: Firestore
serves reads from the local cache, so an install that is refusing every write
looks perfectly healthy until something makes it talk to the server.

Every line tells you which of the two failures you have:

- **"No answer from Firestore"** — the network. Nothing is lost, writes are
  queued, it fixes itself when the connection returns.
- **"Rules rejected …"** — not the network. The write will never land, however
  long anyone waits. Something about the account or the rules has to change.

**Stuck writes** lists records this machine wrote that the server still has not
confirmed after 10 minutes. While the checks above show the connection is down,
that is normal. If they show the connection is fine, those records were refused
rather than delayed — **Retry** will say which.

### Data

Browse and edit any collection in the project: garages, users, pairing codes,
website content, crash reports, the audit log, and everything under a garage
(devices, stock, ledger, arrivals, clients, vehicles, jobs, invoices,
reminders, enquiries, archives).

The editor is raw JSON. That is on purpose — a console that only shows the
fields someone built a form for is useless exactly when you need it, which is
when a record has a shape nobody expected. **Save** stays disabled until the
JSON parses, so a malformed document cannot be written.

The stock ledger (`stockMovements`) is read-only here, because the rules forbid
editing it for everyone. A wrong movement is corrected with another movement.

Deleting more than five documents at once requires typing `DELETE`.

### Files

Firebase Storage: browse, open, upload, replace and delete. This is where
invoice PDFs and the website's images live, so a picture on the public site can
be swapped here without a deploy.

## Adding content to the website without a deploy

`site/content` now takes an optional `sections` array, rendered on the public
site between *About* and the request panel. Edit it under **Data → Website
content**. Each entry:

```json
{
  "id": "winter-offer",
  "kind": "text",
  "order": 1,
  "hidden": false,
  "eyebrow": "THIS MONTH",
  "title": "Free brake check",
  "body": "Bring the car in before the end of the month.",
  "ctaLabel": "Ask about this",
  "ctaHref": "#ask"
}
```

`kind` is `text`, `banner` (adds `imageUrl` behind the text) or `cards` (adds
`cards: [{title, body, imageUrl}]`). Set `hidden: true` to take a section off
the site without losing it. A `kind` the deployed site does not recognise is
skipped rather than breaking the page.

## The audit log

Every change made from this console writes a `technicianActions` document
first, carrying the full value before and after. If an edit turns out to be
wrong, the previous value is in that log and can be pasted back.

The log is append-only in the rules — nobody can edit or delete an entry,
including the person who wrote it. Values over 20,000 characters are stored
truncated so the entry itself always survives.

## Crash reports

All three apps — desktop, reception phone, stock phone — write uncaught errors
to one global `diagnostics` collection, readable under **Data → Crash
reports**. This replaced Sentry, whose free tier ran out.

Reports are deduplicated (the same error is recorded at most once a minute) and
capped at 20 per desktop session, so a render loop cannot flood the
collection. Phones keep a 30-second gap between reports.

Nothing rolls old reports off automatically. Reading is capped at the newest 50,
and clearing out old ones is a manual delete from the same screen — deliberately,
so that reports are never discarded by a background job that nobody is watching.

## Security, and what is not done yet

The password check runs **in the browser, against a value compiled into the
app**. Anyone who can open developer tools can read it, and anyone who can edit
local storage can forge an unlocked session.

That is acceptable while every install is on a machine you control. Before this
build goes onto a client machine you do not control, it has to be replaced with
a server-side check: a Cloud Function that verifies the password and sets a
`technician` custom claim, with `firestore.rules` gating on that claim.

Every marker for that work is tagged in the source:

```
grep -rn "TODO(security)" garage/src
```

They are all in `garage/src/technician/session.ts`.

### The console cannot actually cross garages yet

The console has no per-garage scoping in its *own* code — the garage is a
dropdown, not read from your profile. But Firestore still enforces the rules
against whoever is signed in, and those rules scope by `users/{uid}.garageId`.

So today the console can edit **any collection**, but only within the garage the
signed-in account belongs to. Editing another garage's data needs the custom
claim described above. This is the honest state of it: the UI is ready for
cross-garage work, the authorization is not, and the rules were deliberately
left strict rather than opened up to make the UI's promise true.

## When someone reports "it is not saving"

1. Open **Diagnostics**, run **Check everything**.
2. If **Signed in** fails with no `users/{uid}` document — that is the cause.
   Rules answer every question by reading that document. Create it under
   **Data → Users** with the right `garageId` and `role`.
3. If **Writes accepted** says rules rejected — compare the account's `role`
   against the rule for the collection in `firestore.rules`.
4. If both pass but **Unsynced records** lists things — they were refused, not
   delayed. Hit **Retry** on one to see the real error.
