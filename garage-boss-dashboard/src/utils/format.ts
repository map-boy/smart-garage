/**
 * Format currency using en-RW locale and the garage's configured currency.
 */
export function formatCurrency(amount: number, currencyCode: string = 'RWF'): string {
  try {
    const cleanAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    return new Intl.NumberFormat('en-RW', {
      style: 'currency',
      currency: currencyCode || 'RWF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(cleanAmount);
  } catch (error) {
    return `${currencyCode || 'RWF'} ${amount}`;
  }
}

/**
 * Format timestamp or ISO string using en-GB locale. Returns '—' if missing or invalid.
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
  } catch (error) {
    return '—';
  }
}


/**
 * Money on an invoice, kept in one place because the two numbers mean
 * opposite things and were being confused.
 *
 * The workshop app records what a vehicle COST: parts, materials, paid
 * labour, and free services the garage absorbed. The client's real bill is
 * issued through EBM and typed back in as `amountCharged` - that, and only
 * that, is revenue. Adding up line items gives you spend, never income.
 */
export function invoiceSpend(inv: { lineItems?: { qty: number; unitCost: number }[]; laborCost?: number }): number {
  const items = (inv.lineItems || []).reduce((sum, i) => sum + (i.qty * i.unitCost), 0);
  return items + (inv.laborCost || 0);
}

/**`n * VAT rate on the EBM invoice. The billed amount is VAT-INCLUSIVE, so net`n * revenue is total / (1 + VAT_RATE) - never total x (1 - VAT_RATE).`n */
export const VAT_RATE = 0.18;

/** What the client was actually billed. Zero until the owner enters it. */
export function invoiceRevenue(inv: { amountCharged?: number }): number {
  return inv.amountCharged || 0;
}

/** Revenue minus spend. Negative means the job lost money. */
export function invoiceProfit(inv: { amountCharged?: number; lineItems?: { qty: number; unitCost: number }[]; laborCost?: number }): number {
  return invoiceRevenue(inv) / (1 + VAT_RATE) - invoiceSpend(inv);
}
