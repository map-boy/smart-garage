import { Part } from '../types';
import { useAuth } from '../context/AuthContext';
import { useGarageCollection } from './useGarageCollection';
import {
  adjustToCount, issuePart, receivePart, savePartDetails, seedPart,
  isLow, isOversold, type MovementContext,
} from '../services/stockService';

/**
 * Stock, with every quantity change going through the ledger.
 *
 * The old updateQuantity read the current value and wrote back value + delta.
 * That loses one of two concurrent removals, and offline it writes a number
 * that was already stale when the phone went dark. Quantities now move only by
 * atomic increment, and only alongside a movement line saying who took what.
 */
export function useStock() {
  const { profile } = useAuth();
  const { items, loading, remove } = useGarageCollection<Part>('stock');
  const garageId = profile?.garageId ?? '';
  const who = (): MovementContext => ({
    byName: profile?.displayName || profile?.email || 'Desktop',
    byRole: profile?.role || 'staff',
  });

  return {
    stock: items,
    loading,

    addPart: (p: Part) => garageId && seedPart(garageId, p, who().byName),
    /** Details only - quantity is never set from a form. */
    updatePart: (p: Part) => garageId && savePartDetails(garageId, p),
    deletePart: (id: string) => remove(id),

    issue: (part: Part, qty: number, ctx?: Partial<MovementContext>) =>
      garageId && issuePart(garageId, part, qty, { ...who(), ...ctx }),
    receive: (part: Part, qty: number, ctx?: Partial<MovementContext>) =>
      garageId && receivePart(garageId, part, qty, { ...who(), ...ctx }),
    setCount: (part: Part, counted: number, ctx?: Partial<MovementContext>) =>
      garageId && adjustToCount(garageId, part, counted, { ...who(), ...ctx }),

    lowParts: items.filter(isLow),
    oversoldParts: items.filter(isOversold),

    refresh: () => {},
  };
}
