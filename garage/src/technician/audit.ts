/**
 * Every technician mutation, written down before it happens.
 *
 * The console can edit any document in the project, so the only thing making a
 * bad edit survivable is knowing exactly what it replaced. Each entry carries
 * the document path, the value before, the value after, who did it and when -
 * enough to put a document back by hand from the log alone.
 *
 * The entry is written before the mutation, so a mutation that lands while the
 * log fails cannot happen. But it is not waited on to the server: with a
 * persistent cache a Firestore write only resolves once the server
 * acknowledges it, so awaiting here would hang the console indefinitely on a
 * bad connection - which is exactly the situation a technician is called out
 * for. `settle` below reports which of the three things happened instead.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { sessionId } from './session';

export type AuditOp =
  | 'create'
  | 'update'
  | 'delete'
  | 'storage-upload'
  | 'storage-delete';

export interface AuditEntry {
  op: AuditOp;
  /** Full Firestore path, or a Storage path for the storage operations. */
  path: string;
  before: unknown;
  after: unknown;
  /** Set when the technician was acting on one garage in particular. */
  garageId?: string;
  note?: string;
}

/** Firestore rejects `undefined`; the console hands us plenty of it. */
function scrub(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? null : v)));
}

/**
 * A whole document is usually small, but an archive chunk is not, and a log
 * entry that cannot be written records nothing at all. Oversized values are
 * stored as a marker so the entry itself always survives.
 */
const MAX_VALUE_CHARS = 20_000;

function cap(value: unknown): unknown {
  const scrubbed = scrub(value);
  try {
    const text = JSON.stringify(scrubbed);
    if (text && text.length > MAX_VALUE_CHARS) {
      return {
        __truncated: true,
        chars: text.length,
        preview: text.slice(0, 2_000),
      };
    }
  } catch {
    return { __unserializable: true };
  }
  return scrubbed;
}

export type Settled = 'confirmed' | 'queued' | 'refused';

/**
 * Waits a short while for a write to be acknowledged, then stops waiting.
 *
 * Firestore gives three genuinely different outcomes and only distinguishes
 * two of them by itself:
 *
 *   confirmed - the server took it.
 *   refused   - the server rejected it, and never will take it.
 *   queued    - nobody has answered yet. The write is safe in the local cache
 *               and will go up on its own, but pretending that is the same as
 *               "saved" is how a sync failure ends up looking like a success.
 *
 * The promise is left running after the timeout on purpose: the write is still
 * queued and will still land. Only the waiting stops.
 */
export function settle(write: Promise<unknown>, ms = 6_000): Promise<Settled> {
  return Promise.race([
    write.then<Settled>(() => 'confirmed').catch<Settled>((e) => {
      if ((e as { code?: string })?.code === 'permission-denied') return 'refused';
      throw e;
    }),
    new Promise<Settled>((resolve) => setTimeout(() => resolve('queued'), ms)),
  ]);
}

/** Files the entry and reports whether the server has it yet. */
export function recordAction(entry: AuditEntry): Promise<Settled> {
  return settle(addDoc(collection(db, 'technicianActions'), {
    op: entry.op,
    path: entry.path,
    before: cap(entry.before),
    after: cap(entry.after),
    garageId: entry.garageId ?? null,
    note: entry.note ?? null,
    bySession: sessionId(),
    at: serverTimestamp(),
    // The server stamp is null until it round-trips, and the console wants to
    // sort the log the moment it is written.
    atLocal: new Date().toISOString(),
  }));
}
