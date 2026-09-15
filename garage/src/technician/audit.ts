/**
 * Every technician mutation, written down before it happens.
 *
 * The console can edit any document in the project, so the only thing making a
 * bad edit survivable is knowing exactly what it replaced. Each entry carries
 * the document path, the value before, the value after, who did it and when -
 * enough to put a document back by hand from the log alone.
 *
 * Logging is best-effort on purpose. If writing the audit entry fails the
 * mutation still goes through, because a technician working a live fault must
 * not be blocked by a second write that can fail for its own reasons. The
 * failure is reported to the caller so the console can say so rather than
 * implying the action was recorded.
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

export async function recordAction(entry: AuditEntry): Promise<void> {
  await addDoc(collection(db, 'technicianActions'), {
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
  });
}
