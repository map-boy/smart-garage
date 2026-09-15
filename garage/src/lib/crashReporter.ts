/**
 * Where crashes go now that there is no crash-reporting service.
 *
 * Every install writes uncaught errors to one global `diagnostics` collection,
 * so the technician console can see failures across every machine and phone in
 * one place instead of asking people what the screen said. Deliberately
 * self-hosted: no third-party SDK, no paid tier to exhaust.
 *
 * Three things this must never do, because a crash reporter that misbehaves is
 * worse than none:
 *
 *   - crash. Every path here swallows its own failures.
 *   - loop. Reporting failures are never themselves reported.
 *   - flood. A render loop can throw hundreds of times a second, so identical
 *     errors are collapsed and the whole reporter is rate limited.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const APP = 'garage-desktop';
const DEVICE_KEY = 'garage.deviceId.v1';

/** No more than this many reports per session, however bad things get. */
const MAX_PER_SESSION = 20;
/** The same message is only worth recording once per this window. */
const DEDUPE_MS = 60_000;

let installed = false;
let sent = 0;
let reporting = false;
const lastSeen = new Map<string, number>();

function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const c = globalThis.crypto as Crypto | undefined;
    const id =
      c && typeof c.randomUUID === 'function'
        ? c.randomUUID()
        : 'd-' + Math.random().toString(36).slice(2);
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return 'd-unknown';
  }
}

function appVersion(): string {
  return (import.meta.env.VITE_APP_VERSION as string | undefined) || 'dev';
}

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || 'Error',
      stack: (error.stack || '').slice(0, 4_000),
    };
  }
  try {
    return { message: String(error).slice(0, 500), stack: '' };
  } catch {
    return { message: 'Unserializable error', stack: '' };
  }
}

/**
 * Records one error. Safe to call from anywhere, including an error boundary.
 * Returns nothing and never rejects.
 */
export function reportCrash(
  error: unknown,
  context?: Record<string, unknown>
): void {
  if (reporting) return;
  if (sent >= MAX_PER_SESSION) return;

  const { message, stack } = describe(error);
  const key = message + '|' + stack.slice(0, 200);
  const now = Date.now();
  const previous = lastSeen.get(key);
  if (previous && now - previous < DEDUPE_MS) return;
  lastSeen.set(key, now);
  sent += 1;

  reporting = true;
  void (async () => {
    try {
      await addDoc(collection(db, 'diagnostics'), {
        app: APP,
        version: appVersion(),
        deviceId: deviceId(),
        message,
        stack,
        route: typeof location !== 'undefined' ? location.hash || location.pathname : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        online: typeof navigator !== 'undefined' ? navigator.onLine : null,
        context: context ? JSON.parse(JSON.stringify(context)) : null,
        at: serverTimestamp(),
        // The server stamp is null until it reaches the server, and a crash
        // report is most useful exactly when it has not got there yet.
        atLocal: new Date().toISOString(),
      });
    } catch {
      // Offline, or rules refused. The write is queued by Firestore either
      // way; if it genuinely cannot be stored, losing a crash report is
      // strictly better than reporting the failure to report.
    } finally {
      reporting = false;
    }
  })();
}

/** Hooks the browser-level handlers. Call once, at startup. */
export function installCrashReporter(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    reportCrash(event.error ?? event.message, { kind: 'window.error' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportCrash(event.reason, { kind: 'unhandledrejection' });
  });
}
