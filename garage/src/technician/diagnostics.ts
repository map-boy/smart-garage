/**
 * The "check everything" run behind the technician console.
 *
 * The point of this file is to answer *which* thing is broken. "Something went
 * wrong" is what the staff already know by the time they call. So every check
 * distinguishes the two failures that look identical from the outside:
 *
 *   - the network is down: reads still work from the local cache, writes queue
 *     up and nothing is lost, and the fix is to wait or fix the connection.
 *   - the rules rejected this: the network is fine, the write will never land
 *     no matter how long anyone waits, and the fix is a rules or profile change.
 *
 * Firestore reports the first as `unavailable` and the second as
 * `permission-denied`, and the only way to tell them apart is to force a
 * server round trip - a plain read is served from cache and looks healthy
 * while the account is being refused on every write.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  limit,
  query,
  setDoc,
} from 'firebase/firestore';
import { listAll, ref } from 'firebase/storage';
import { db, auth } from '../lib/firebase';
import { storage } from '../lib/storage';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  /** One specific sentence naming what happened. */
  detail: string;
  /** What to do about it, when there is something to do. */
  hint?: string;
}

/** A record that has been waiting to sync long enough to be worth flagging. */
export interface StuckWrite {
  path: string;
  id: string;
  title: string;
  /** Local wall clock when the app first wrote it, if the record carries one. */
  since: string | null;
  ageMinutes: number | null;
}

export const STUCK_AFTER_MINUTES = 10;

function errorCode(e: unknown): string {
  return (e as { code?: string })?.code ?? '';
}

function errorMessage(e: unknown): string {
  return (e as Error)?.message ?? String(e);
}

/** Collections worth sweeping for writes that never made it up. */
const PENDING_SWEEP = [
  { path: 'arrivals', localField: 'arrivedAtLocal', title: 'plate' },
  { path: 'stockMovements', localField: 'atLocal', title: 'partName' },
  { path: 'enquiries', localField: 'createdAtLocal', title: 'name' },
  { path: 'invoices', localField: 'createdAtLocal', title: 'invoiceNumber' },
  { path: 'jobs', localField: 'createdAtLocal', title: 'description' },
];

/**
 * Signed-in identity. Almost every "insufficient permissions" report starts
 * here, because the rules answer every question by looking up users/{uid}.
 */
async function checkIdentity(): Promise<CheckResult> {
  const user = auth.currentUser;
  if (!user) {
    return {
      id: 'identity',
      label: 'Signed in',
      status: 'fail',
      detail: 'No Firebase session at all. Every server read and write is refused.',
      hint: 'The app signs in anonymously on its own once it can reach the network.',
    };
  }

  try {
    const snap = await getDocFromServer(doc(db, 'users', user.uid));
    if (!snap.exists()) {
      return {
        id: 'identity',
        label: 'Signed in',
        status: 'fail',
        detail:
          `Signed in as ${user.uid} but there is no users/${user.uid} document. ` +
          'firestore.rules reads that document to decide who you are, so every ' +
          'owner and manager action is refused.',
        hint: 'Open Users in this console and create it with the right garageId and role.',
      };
    }
    const data = snap.data() as { role?: string; garageId?: string };
    return {
      id: 'identity',
      label: 'Signed in',
      status: 'ok',
      detail:
        `${user.isAnonymous ? 'Anonymous' : user.email || user.uid} - ` +
        `role ${data.role || 'unset'}, garage ${data.garageId || 'unset'}.`,
    };
  } catch (e) {
    const code = errorCode(e);
    if (code === 'unavailable') {
      return {
        id: 'identity',
        label: 'Signed in',
        status: 'warn',
        detail: 'Cannot reach the server to confirm this account. Working from cache.',
      };
    }
    return {
      id: 'identity',
      label: 'Signed in',
      status: 'fail',
      detail: `Reading users/${user.uid} was refused: ${code || errorMessage(e)}.`,
      hint: 'A rules change, not a network problem. Waiting will not fix it.',
    };
  }
}

/** Forces a server round trip so a warm cache cannot fake a healthy system. */
async function checkFirestoreReachable(garageId: string): Promise<CheckResult> {
  try {
    const snap = await getDocFromServer(doc(db, 'garages', garageId));
    return {
      id: 'firestore-read',
      label: 'Firestore reachable',
      status: 'ok',
      detail: snap.exists()
        ? `Read garages/${garageId} from the server.`
        : `Server answered, but garages/${garageId} does not exist.`,
      hint: snap.exists()
        ? undefined
        : 'The garage document was never created. Owner actions that read settings will fall back to defaults.',
    };
  } catch (e) {
    const code = errorCode(e);
    if (code === 'permission-denied') {
      return {
        id: 'firestore-read',
        label: 'Firestore reachable',
        status: 'fail',
        detail: `The server is reachable, but rules rejected the read of garages/${garageId}.`,
        hint: 'This account is not a member of that garage. Check users/{uid}.garageId.',
      };
    }
    return {
      id: 'firestore-read',
      label: 'Firestore reachable',
      status: 'fail',
      detail: `No answer from Firestore (${code || errorMessage(e)}).`,
      hint: 'Network or project configuration. Local work continues and queues.',
    };
  }
}

/**
 * Writes and removes a scratch document under the garage, which is the only
 * way to know a write would actually be accepted rather than queued forever.
 */
async function checkScopedWrite(garageId: string): Promise<CheckResult> {
  const probe = doc(db, 'garages', garageId, 'diagnosticsProbe', 'technician-check');
  try {
    // A write resolves only when the server acknowledges it, so a timeout here
    // means offline, not refused - those are different answers for the user.
    await withTimeout(
      setDoc(probe, { at: new Date().toISOString(), by: auth.currentUser?.uid ?? null }),
      8_000
    );
    await withTimeout(deleteDoc(probe), 8_000).catch(() => undefined);
    return {
      id: 'firestore-write',
      label: 'Writes accepted',
      status: 'ok',
      detail: `Wrote and removed a scratch document under garages/${garageId}.`,
    };
  } catch (e) {
    const code = errorCode(e);
    if (code === 'permission-denied') {
      return {
        id: 'firestore-write',
        label: 'Writes accepted',
        status: 'fail',
        detail:
          `Rules rejected a write to garages/${garageId}/diagnosticsProbe for this account.`,
        hint:
          'Writes from this machine will never land. Check the role on users/{uid} ' +
          'against the rule for the collection being written.',
      };
    }
    if (errorMessage(e) === 'timeout') {
      return {
        id: 'firestore-write',
        label: 'Writes accepted',
        status: 'warn',
        detail:
          'The write was queued but the server did not acknowledge it within 8 seconds.',
        hint: 'Offline or a slow link. Nothing is lost - it drains when the link returns.',
      };
    }
    return {
      id: 'firestore-write',
      label: 'Writes accepted',
      status: 'fail',
      detail: `Write failed: ${code || errorMessage(e)}.`,
    };
  }
}

async function checkStorage(garageId: string): Promise<CheckResult> {
  try {
    const result = await withTimeout(listAll(ref(storage, `invoices/${garageId}`)), 8_000);
    return {
      id: 'storage',
      label: 'File storage reachable',
      status: 'ok',
      detail: `Listed invoices/${garageId}: ${result.items.length} file(s).`,
    };
  } catch (e) {
    const code = errorCode(e);
    if (code === 'storage/unauthorized') {
      return {
        id: 'storage',
        label: 'File storage reachable',
        status: 'fail',
        detail: `Storage rules rejected listing invoices/${garageId}.`,
        hint: 'Invoice PDFs will fail to save. This is a Storage rules problem.',
      };
    }
    if (code === 'storage/object-not-found') {
      return {
        id: 'storage',
        label: 'File storage reachable',
        status: 'ok',
        detail: 'Storage answered. Nothing stored for this garage yet.',
      };
    }
    return {
      id: 'storage',
      label: 'File storage reachable',
      status: 'warn',
      detail: `Could not reach Storage (${code || errorMessage(e)}).`,
    };
  }
}

/** How long since each paired phone last said anything. */
async function checkDeviceHeartbeats(garageId: string): Promise<CheckResult[]> {
  try {
    const snap = await getDocs(collection(db, 'garages', garageId, 'devices'));
    if (snap.empty) {
      return [
        {
          id: 'devices',
          label: 'Paired phones',
          status: 'warn',
          detail: 'No phones are paired to this garage.',
          hint: 'Generate a pairing code in Settings if reception or stock should have one.',
        },
      ];
    }
    return snap.docs.map((d) => {
      const data = d.data() as {
        staffName?: string;
        role?: string;
        lastSeenAt?: { toDate?: () => Date };
      };
      const who = `${data.staffName || d.id} (${data.role || 'unknown role'})`;
      const seen = data.lastSeenAt?.toDate?.();
      if (!seen) {
        return {
          id: `device-${d.id}`,
          label: `Phone: ${who}`,
          status: 'warn' as CheckStatus,
          detail: 'Paired, but has never checked in since.',
        };
      }
      const hours = (Date.now() - seen.getTime()) / 3_600_000;
      if (hours > 48) {
        return {
          id: `device-${d.id}`,
          label: `Phone: ${who}`,
          status: 'warn' as CheckStatus,
          detail: `Last seen ${Math.round(hours)} hours ago (${seen.toLocaleString()}).`,
          hint: 'The phone is off, out of signal, or the app has been uninstalled.',
        };
      }
      return {
        id: `device-${d.id}`,
        label: `Phone: ${who}`,
        status: 'ok' as CheckStatus,
        detail: `Last seen ${seen.toLocaleString()}.`,
      };
    });
  } catch (e) {
    const code = errorCode(e);
    return [
      {
        id: 'devices',
        label: 'Paired phones',
        status: code === 'permission-denied' ? 'fail' : 'warn',
        detail:
          code === 'permission-denied'
            ? `Rules rejected listing garages/${garageId}/devices.`
            : `Could not list devices (${code || errorMessage(e)}).`,
      },
    ];
  }
}

/**
 * Records the local cache still holds unsynced writes for.
 *
 * Firestore exposes this per document as `metadata.hasPendingWrites`, which the
 * apps already use to show a "syncing" mark. Here it answers a different
 * question: has anything been sitting unsent long enough that it is not just
 * slow but stuck?
 */
export async function findStuckWrites(garageId: string): Promise<StuckWrite[]> {
  const stuck: StuckWrite[] = [];
  for (const sweep of PENDING_SWEEP) {
    try {
      const snap = await getDocs(
        query(collection(db, 'garages', garageId, sweep.path), limit(200))
      );
      for (const d of snap.docs) {
        if (!d.metadata.hasPendingWrites) continue;
        const data = d.data() as Record<string, unknown>;
        const since = typeof data[sweep.localField] === 'string'
          ? (data[sweep.localField] as string)
          : null;
        const ageMinutes = since
          ? Math.round((Date.now() - new Date(since).getTime()) / 60_000)
          : null;
        if (ageMinutes !== null && ageMinutes < STUCK_AFTER_MINUTES) continue;
        stuck.push({
          path: `garages/${garageId}/${sweep.path}`,
          id: d.id,
          title: String(data[sweep.title] ?? d.id),
          since,
          ageMinutes,
        });
      }
    } catch {
      // A collection we cannot read tells us nothing about stuck writes; the
      // rules checks above already report why it is unreadable.
    }
  }
  return stuck;
}

async function checkPendingWrites(garageId: string): Promise<CheckResult> {
  const stuck = await findStuckWrites(garageId);
  if (stuck.length === 0) {
    return {
      id: 'pending',
      label: 'Unsynced records',
      status: 'ok',
      detail: 'Nothing has been waiting to sync longer than ' +
        `${STUCK_AFTER_MINUTES} minutes.`,
    };
  }
  const oldest = stuck.reduce(
    (worst, s) => ((s.ageMinutes ?? 0) > (worst.ageMinutes ?? 0) ? s : worst),
    stuck[0]
  );
  return {
    id: 'pending',
    label: 'Unsynced records',
    status: 'warn',
    detail:
      `${stuck.length} record(s) still waiting to reach the server. Oldest: ` +
      `${oldest.title} in ${oldest.path}, ${oldest.ageMinutes ?? '?'} minutes.`,
    hint:
      'If the checks above show the network is fine, these were rejected rather ' +
      'than delayed - open Stuck writes below to retry or discard them.',
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
}

/**
 * Runs everything in order, reporting as it goes so a run that stalls on one
 * check still shows what already passed.
 */
export async function runAllChecks(
  garageId: string,
  onResult: (r: CheckResult) => void
): Promise<void> {
  onResult(await checkIdentity());
  onResult(await checkFirestoreReachable(garageId));
  onResult(await checkScopedWrite(garageId));
  onResult(await checkStorage(garageId));
  for (const r of await checkDeviceHeartbeats(garageId)) onResult(r);
  onResult(await checkPendingWrites(garageId));
}
