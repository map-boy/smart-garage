/**
 * Reads and writes for the technician console.
 *
 * Every mutation goes through here rather than talking to Firestore directly,
 * because every mutation has to leave an audit entry carrying the value it
 * replaced. A write that bypassed this file would be the one edit nobody could
 * undo.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { recordAction } from './audit';
import type { CollectionSpec } from './registry';
import { READ_ONLY_COLLECTIONS, resolvePath, rowTitle } from './registry';

export interface DocRow {
  id: string;
  title: string;
  data: Record<string, unknown>;
  /** True while this document has local edits the server has not confirmed. */
  pending: boolean;
}

export const DEFAULT_PAGE = 100;

function collectionRef(spec: CollectionSpec, garageId: string) {
  return collection(db, resolvePath(spec, garageId));
}

export async function listDocs(
  spec: CollectionSpec,
  garageId: string
): Promise<DocRow[]> {
  const size = spec.pageSize ?? DEFAULT_PAGE;
  // Ordering by a field only works where every document has it; a collection
  // part-written by an older build would silently return nothing, so fall back
  // to an unordered read rather than showing an empty screen.
  let snap;
  try {
    snap = spec.orderBy
      ? await getDocs(
          query(collectionRef(spec, garageId), orderBy(spec.orderBy, 'desc'), fbLimit(size))
        )
      : await getDocs(query(collectionRef(spec, garageId), fbLimit(size)));
  } catch {
    snap = await getDocs(query(collectionRef(spec, garageId), fbLimit(size)));
  }

  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      title: rowTitle(spec, d.id, data),
      data,
      pending: d.metadata.hasPendingWrites,
    };
  });
}

export function isReadOnly(spec: CollectionSpec): boolean {
  return READ_ONLY_COLLECTIONS.has(spec.id);
}

/** Reads the current value so the audit entry can record what was replaced. */
async function readBefore(path: string, id: string): Promise<unknown> {
  try {
    const snap = await getDoc(doc(db, path, id));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

export async function saveDoc(
  spec: CollectionSpec,
  garageId: string,
  id: string,
  value: Record<string, unknown>,
  note?: string
): Promise<void> {
  if (isReadOnly(spec)) {
    throw new Error(
      `${spec.label} is append-only - the rules reject updates and deletes for ` +
        'everyone, including this console.'
    );
  }
  const path = resolvePath(spec, garageId);
  const before = await readBefore(path, id);

  // The audit entry is written first. If the mutation then fails, the log has
  // a harmless extra line; if the order were reversed, a mutation that
  // succeeded while the log failed would be invisible.
  await recordAction({
    op: before === null ? 'create' : 'update',
    path: `${path}/${id}`,
    before,
    after: value,
    garageId: spec.scope === 'garage' ? garageId : undefined,
    note,
  });

  await setDoc(doc(db, path, id), value);
}

export async function removeDoc(
  spec: CollectionSpec,
  garageId: string,
  id: string,
  note?: string
): Promise<void> {
  if (isReadOnly(spec)) {
    throw new Error(`${spec.label} is append-only - entries cannot be deleted.`);
  }
  const path = resolvePath(spec, garageId);
  const before = await readBefore(path, id);

  await recordAction({
    op: 'delete',
    path: `${path}/${id}`,
    before,
    after: null,
    garageId: spec.scope === 'garage' ? garageId : undefined,
    note,
  });

  await deleteDoc(doc(db, path, id));
}

/**
 * Deletes several documents, reporting what actually happened per id.
 *
 * Does not stop at the first refusal: a bulk delete that halts halfway leaves
 * the technician guessing which half went, which is worse than finishing and
 * naming the failures.
 */
export async function removeMany(
  spec: CollectionSpec,
  garageId: string,
  ids: string[],
  note?: string
): Promise<{ deleted: string[]; failed: { id: string; reason: string }[] }> {
  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];
  for (const id of ids) {
    try {
      await removeDoc(spec, garageId, id, note);
      deleted.push(id);
    } catch (e) {
      failed.push({
        id,
        reason: (e as { code?: string })?.code || (e as Error)?.message || 'unknown',
      });
    }
  }
  return { deleted, failed };
}

/** Lists the garages this console can offer, falling back to the current one. */
export async function listGarageIds(fallback: string): Promise<string[]> {
  try {
    const snap = await getDocs(query(collection(db, 'garages'), fbLimit(200)));
    const ids = snap.docs.map((d) => d.id);
    return ids.length ? ids : [fallback];
  } catch {
    // Listing garages needs a rule most accounts do not have. Working on the
    // garage this machine belongs to is the normal case anyway.
    return [fallback];
  }
}
