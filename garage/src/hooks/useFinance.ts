import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useInvoices } from './useInvoices';
import { useStock } from './useStock';

/**
 * What the garage took in, what it spent, and what it has left on the shelf.
 *
 * Two honesty rules run through this file, because a money screen that quietly
 * guesses is worse than no money screen at all.
 *
 * A movement records what it was worth at the time it happened. Where that
 * stamp is missing - every line written before it was added, and everything the
 * reception/stock desk writes, which has no price to hand - the part's price
 * today is used instead. That is an estimate, so the count of estimated lines
 * is returned and the screen says so rather than presenting one total as fact.
 *
 * Nothing here invents a number it cannot source. Labour is not subtracted as a
 * cost: the app records what labour was charged to a customer, never what it
 * paid a technician, so a "net profit" figure would be fiction. What is shown
 * is gross: money in, minus the parts that left the shelf to earn it.
 */

export type Period = 'month' | 'quarter' | 'year' | 'all';

export const PERIOD_LABEL: Record<Period, string> = {
  month: 'This month',
  quarter: 'Last 3 months',
  year: 'This year',
  all: 'All time',
};

interface MovementRow {
  id: string;
  partId?: string;
  partName?: string;
  delta?: number;
  reason?: string;
  unitCost?: number;
  lineValue?: number;
  atLocal?: string;
}

/**
 * The ledger is append-only and grows forever, so it is read newest-first and
 * capped. A garage that outruns this window needs aggregation on the server,
 * not a bigger download onto the boss's laptop.
 */
const LEDGER_WINDOW = 1000;

function periodStart(period: Period): number {
  const now = new Date();
  switch (period) {
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case 'quarter':
      return new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime();
    case 'year':
      return new Date(now.getFullYear(), 0, 1).getTime();
    default:
      return 0;
  }
}

function timeOf(iso?: string): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function useFinance(period: Period) {
  const { profile } = useAuth();
  const { invoices } = useInvoices();
  const { stock } = useStock();
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.garageId) return;
    const q = query(
      collection(db, 'garages', profile.garageId, 'stockMovements'),
      orderBy('atLocal', 'desc'),
      limit(LEDGER_WINDOW),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLedgerError(null);
        setMovements(snap.docs.map((d) => ({ id: d.id, ...(d.data() as MovementRow) })));
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'stockMovements');
        } catch {
          /* logged above */
        }
        setLedgerError(
          (err as { code?: string })?.code === 'permission-denied'
            ? 'This account cannot read the stock ledger, so spend and usage are blank.'
            : `Could not load the stock ledger: ${(err as Error).message}`
        );
      },
    );
    return () => unsub();
  }, [profile?.garageId]);

  return useMemo(() => {
    const from = periodStart(period);
    const priceById = new Map(stock.map((p) => [p.id, p.unitCost ?? 0]));

    let estimatedLines = 0;
    const valueOf = (m: MovementRow): number => {
      if (typeof m.lineValue === 'number' && Number.isFinite(m.lineValue)) {
        return m.lineValue;
      }
      const stamped = typeof m.unitCost === 'number' && Number.isFinite(m.unitCost)
        ? m.unitCost
        : null;
      if (stamped === null) estimatedLines += 1;
      const unit = stamped ?? priceById.get(m.partId ?? '') ?? 0;
      return Math.abs(m.delta ?? 0) * unit;
    };

    const inWindow = movements.filter((m) => timeOf(m.atLocal) >= from);

    let investment = 0;
    let partsConsumed = 0;
    let writtenOff = 0;
    const usage = new Map<string, { name: string; qty: number; value: number; times: number }>();

    for (const m of inWindow) {
      const value = valueOf(m);
      switch (m.reason) {
        case 'received':
          investment += value;
          break;
        case 'issued_to_vehicle': {
          partsConsumed += value;
          const key = m.partId || m.partName || m.id;
          const row = usage.get(key) ?? {
            name: m.partName || 'Unnamed part', qty: 0, value: 0, times: 0,
          };
          row.qty += Math.abs(m.delta ?? 0);
          row.value += value;
          row.times += 1;
          usage.set(key, row);
          break;
        }
        case 'written_off':
          writtenOff += value;
          break;
        default:
          // A count adjustment is a correction to the books, not money moving.
          break;
      }
    }

    const invoiceTotal = (inv: (typeof invoices)[number]): number => {
      if (typeof inv.amountCharged === 'number' && Number.isFinite(inv.amountCharged)) {
        return inv.amountCharged;
      }
      const lines = (inv.lineItems ?? []).reduce(
        (acc, item) => acc + (item.qty ?? 0) * (item.unitCost ?? 0), 0,
      );
      return lines + (inv.laborCost ?? 0);
    };

    const billed = invoices.filter((inv) => timeOf(inv.issuedAt) >= from);
    const income = billed
      .filter((inv) => inv.status === 'Paid')
      .reduce((acc, inv) => acc + invoiceTotal(inv), 0);
    const receivable = billed
      .filter((inv) => inv.status !== 'Paid')
      .reduce((acc, inv) => acc + invoiceTotal(inv), 0);

    // Only what is actually on the shelf counts as value held. A negative
    // quantity is an oversold part awaiting a recount, not a debt to the
    // supplier, so it is excluded rather than subtracted.
    const shelfValue = stock.reduce(
      (acc, p) => acc + Math.max(p.quantity ?? 0, 0) * (p.unitCost ?? 0), 0,
    );

    const topUsed = [...usage.values()].sort((a, b) => b.qty - a.qty).slice(0, 12);

    return {
      income,
      receivable,
      investment,
      partsConsumed,
      writtenOff,
      shelfValue,
      /** Money in, less the parts it cost to earn it. Labour is not deducted. */
      grossProfit: income - partsConsumed,
      topUsed,
      movementsCounted: inWindow.length,
      estimatedLines,
      ledgerCapped: movements.length >= LEDGER_WINDOW,
      ledgerError,
    };
  }, [movements, invoices, stock, period, ledgerError]);
}
