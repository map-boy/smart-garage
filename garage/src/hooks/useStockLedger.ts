import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

/**
 * The stock ledger, read once for everyone who needs it.
 *
 * Deliberately a single hook rather than a listener per screen. Both the money
 * report and the inventory list want this collection, and two listeners on the
 * same documents is two sets of Firestore reads for one set of answers - which
 * shows up on a bill rather than in anything the boss can see.
 */

export interface Movement {
  id: string;
  partId: string;
  partName: string;
  partNumber?: string;
  delta: number;
  balanceAfter?: number;
  reason: string;
  unitCost?: number;
  lineValue?: number;
  plate?: string | null;
  note?: string | null;
  byName?: string;
  atLocal?: string;
  source?: string;
}

/** When a part arrived and when it last left, as far as the ledger can see. */
export interface PartHistory {
  firstInSeen?: string;
  lastInSeen?: string;
  lastOutSeen?: string;
  totalIn: number;
  totalOut: number;
}

/**
 * The ledger is append-only and grows forever, so it is read newest-first and
 * capped. Past this a garage needs server-side aggregation, not a longer
 * download onto the boss's laptop.
 */
export const LEDGER_WINDOW = 1000;

function timeOf(iso?: string): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function useStockLedger() {
  const { profile } = useAuth();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.garageId) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'garages', profile.garageId, 'stockMovements'),
      orderBy('atLocal', 'desc'),
      limit(LEDGER_WINDOW),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setError(null);
        setMovements(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Movement) })));
        setLoading(false);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'stockMovements');
        } catch {
          /* logged above */
        }
        setError(
          (err as { code?: string })?.code === 'permission-denied'
            ? 'This account cannot read the stock ledger.'
            : `Could not load the stock ledger: ${(err as Error).message}`
        );
        setLoading(false);
      },
    );
    return () => unsub();
  }, [profile?.garageId]);

  /**
   * Per-part arrival and departure dates, as far back as the window reaches.
   *
   * Named "seen" throughout because that is what they are: the oldest arrival
   * inside the last {@link LEDGER_WINDOW} movements, which for a long-running
   * garage is not the same as the first arrival ever. The part document now
   * carries the real dates; this covers parts that predate that.
   */
  const history = useMemo(() => {
    const byPart = new Map<string, PartHistory>();
    for (const m of movements) {
      if (!m.partId) continue;
      const row = byPart.get(m.partId) ?? { totalIn: 0, totalOut: 0 };
      const qty = Math.abs(m.delta ?? 0);
      if ((m.delta ?? 0) > 0) {
        row.totalIn += qty;
        if (!row.lastInSeen || timeOf(m.atLocal) > timeOf(row.lastInSeen)) {
          row.lastInSeen = m.atLocal;
        }
        if (!row.firstInSeen || timeOf(m.atLocal) < timeOf(row.firstInSeen)) {
          row.firstInSeen = m.atLocal;
        }
      } else if ((m.delta ?? 0) < 0) {
        row.totalOut += qty;
        if (!row.lastOutSeen || timeOf(m.atLocal) > timeOf(row.lastOutSeen)) {
          row.lastOutSeen = m.atLocal;
        }
      }
      byPart.set(m.partId, row);
    }
    return byPart;
  }, [movements]);

  return {
    movements,
    history,
    loading,
    error,
    /** True when the window is full, so anything older is not being seen. */
    capped: movements.length >= LEDGER_WINDOW,
  };
}
