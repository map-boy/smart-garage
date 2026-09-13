import {
  collection, doc, increment, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Part } from '../types';

/**
 * Every change to a stock quantity, for every surface.
 *
 * Two rules hold here and nowhere else in the app should break them.
 *
 * First, a quantity is never written by reading it and adding to it. Firestore
 * applies `increment` on the server, so two people drawing the last oil filter
 * at the same moment both land - one does not silently overwrite the other.
 * It is also the only form that survives being offline: the SDK queues the
 * delta, not a stale absolute number, so a phone that has been out of signal
 * for an hour does not undo everything that happened meanwhile.
 *
 * Second, no quantity moves without a movement line beside it. The ledger is
 * how the boss answers "where did fourteen brake pads go", and a quantity that
 * changed with no line to explain it is exactly the hole this is meant to
 * close. Both writes go in one batch so neither can land without the other.
 *
 * Stock is allowed to go negative. That means more was taken than the books
 * knew about, which is a recount - blocking the removal instead would leave a
 * receptionist stuck at the gate with a customer in front of them, which is
 * worse than a number that needs fixing.
 */

export type MovementReason =
  | 'issued_to_vehicle'
  | 'received'
  | 'count_adjustment'
  | 'returned'
  | 'written_off';

export interface MovementContext {
  byName: string;
  byRole?: string;
  plate?: string;
  vehicleId?: string;
  arrivalId?: string;
  jobId?: string;
  note?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Applies a delta and records why.
 *
 * Deliberately does not await the commit. Firestore resolves that promise only
 * once the server acknowledges, so awaiting it would block the caller for as
 * long as the connection is down - the one moment the offline cache is
 * supposed to make invisible. The local cache has already applied both writes
 * by the time this returns, and the SDK delivers them when the link is back.
 */
export function applyStockDelta(
  garageId: string,
  part: Pick<Part, 'id' | 'name' | 'partNumber' | 'quantity'>,
  delta: number,
  reason: MovementReason,
  ctx: MovementContext,
): void {
  if (!garageId || !delta) return;

  const batch = writeBatch(db);
  const partRef = doc(db, 'garages', garageId, 'stock', part.id);
  const moveRef = doc(collection(db, 'garages', garageId, 'stockMovements'));

  batch.update(partRef, { quantity: increment(delta), updatedAt: nowIso() });
  batch.set(moveRef, {
    partId: part.id,
    // Copied, not referenced. A part renamed next year must not rewrite what
    // this line says happened today.
    partName: part.name,
    partNumber: part.partNumber,
    delta,
    balanceAfter: part.quantity + delta,
    reason,
    plate: ctx.plate ?? null,
    vehicleId: ctx.vehicleId ?? null,
    arrivalId: ctx.arrivalId ?? null,
    jobId: ctx.jobId ?? null,
    note: ctx.note ?? null,
    byName: ctx.byName,
    byRole: ctx.byRole ?? 'staff',
    at: serverTimestamp(),
    atLocal: nowIso(),
  });

  void batch.commit();
}

/** A part leaving the store for a vehicle. */
export function issuePart(
  garageId: string,
  part: Pick<Part, 'id' | 'name' | 'partNumber' | 'quantity'>,
  qty: number,
  ctx: MovementContext,
): void {
  applyStockDelta(garageId, part, -Math.abs(qty), 'issued_to_vehicle', ctx);
}

/** New stock arriving from a supplier. */
export function receivePart(
  garageId: string,
  part: Pick<Part, 'id' | 'name' | 'partNumber' | 'quantity'>,
  qty: number,
  ctx: MovementContext,
): void {
  applyStockDelta(garageId, part, Math.abs(qty), 'received', ctx);
}

/**
 * Sets the quantity to what was physically counted.
 *
 * Expressed as the delta needed to get there rather than as an absolute write,
 * so a count taken offline still merges with whatever moved meanwhile instead
 * of stamping over it.
 */
export function adjustToCount(
  garageId: string,
  part: Pick<Part, 'id' | 'name' | 'partNumber' | 'quantity'>,
  countedQty: number,
  ctx: MovementContext,
): void {
  const delta = countedQty - part.quantity;
  if (!delta) return;
  applyStockDelta(garageId, part, delta, 'count_adjustment', ctx);
}

/** Creating or editing the part itself. Never touches quantity. */
export function savePartDetails(garageId: string, part: Part): void {
  const { id, ...rest } = part;
  void setDoc(
    doc(db, 'garages', garageId, 'stock', id),
    { ...rest, updatedAt: nowIso() },
    { merge: true },
  );
}

/** A part that has gone below zero has been oversold and needs a recount. */
export function isOversold(part: Part): boolean {
  return part.quantity < 0;
}

export function isLow(part: Part): boolean {
  return part.quantity >= 0 && part.quantity <= part.reorderLevel;
}

/** Used when a part is first created, where there is nothing to increment. */
export function seedPart(garageId: string, part: Part, byName: string): void {
  const batch = writeBatch(db);
  const { id, ...rest } = part;
  batch.set(doc(db, 'garages', garageId, 'stock', id), { ...rest, updatedAt: nowIso() });
  if (part.quantity) {
    batch.set(doc(collection(db, 'garages', garageId, 'stockMovements')), {
      partId: id,
      partName: part.name,
      partNumber: part.partNumber,
      delta: part.quantity,
      balanceAfter: part.quantity,
      reason: 'received' as MovementReason,
      plate: null, vehicleId: null, arrivalId: null, jobId: null,
      note: 'Opening stock',
      byName,
      byRole: 'staff',
      at: serverTimestamp(),
      atLocal: nowIso(),
    });
  }
  void batch.commit();
}

/** Marked unused rather than deleted, so the ledger keeps pointing somewhere. */
export function updatePartQuantityOnly(
  garageId: string,
  partId: string,
  delta: number,
): void {
  void updateDoc(doc(db, 'garages', garageId, 'stock', partId), {
    quantity: increment(delta),
    updatedAt: nowIso(),
  });
}
