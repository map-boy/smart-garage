/**
 * Who is allowed into the technician console, and for how long.
 *
 * TODO(security): this check happens in the browser, against a value shipped
 * inside the bundle. Anyone who can open the developer tools can read it and
 * anyone who can edit local storage can forge an unlocked session. It is good
 * enough while every install is on a machine we control, and it is deliberately
 * the only thing standing between a technician and full CRUD - so before this
 * build goes onto a client machine, replace it with a real check: a Cloud
 * Function that verifies the password server-side and sets a `technician`
 * custom claim, and firestore.rules gating technicianActions and cross-garage
 * access on that claim rather than on nothing. Every marker for that work is
 * tagged TODO(security); `grep -rn "TODO(security)" garage/src` finds them.
 */

const UNLOCK_KEY = 'garage.technician.unlockedUntil.v1';
const SESSION_KEY = 'garage.technician.sessionId.v1';

/** Long enough to work through a fault, short enough to expire unattended. */
const SESSION_MS = 8 * 60 * 60 * 1000;

/**
 * TODO(security): bundled secret. Set VITE_TECHNICIAN_PASSWORD at build time
 * so at least it is not the published default.
 */
const PASSWORD =
  (import.meta.env.VITE_TECHNICIAN_PASSWORD as string | undefined)?.trim() ||
  'garage-technician';

function now(): number {
  return Date.now();
}

/** A stable id for this unlocked session, stamped onto every audit entry. */
export function sessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const c = globalThis.crypto as Crypto | undefined;
    const id =
      c && typeof c.randomUUID === 'function'
        ? c.randomUUID()
        : 't-' + Math.random().toString(36).slice(2) + now().toString(36);
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return 't-unknown';
  }
}

export function isUnlocked(): boolean {
  try {
    const until = Number(localStorage.getItem(UNLOCK_KEY) || 0);
    return Number.isFinite(until) && until > now();
  } catch {
    return false;
  }
}

/** Returns false on a wrong password; the caller shows the message. */
export function unlock(attempt: string): boolean {
  if (attempt !== PASSWORD) return false;
  try {
    localStorage.setItem(UNLOCK_KEY, String(now() + SESSION_MS));
    sessionId();
  } catch {
    // Private mode. The console still opens, it just re-prompts next launch.
  }
  return true;
}

export function lock(): void {
  try {
    localStorage.removeItem(UNLOCK_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function unlockedUntil(): Date | null {
  try {
    const until = Number(localStorage.getItem(UNLOCK_KEY) || 0);
    return until > now() ? new Date(until) : null;
  } catch {
    return null;
  }
}
