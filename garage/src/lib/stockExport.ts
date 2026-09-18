import type { Movement } from '../hooks/useStockLedger';

/**
 * Turning the stock ledger into something that opens in Excel.
 *
 * Two shapes, because two questions get asked. A day report answers "what
 * moved yesterday" and is read line by line. A month report answers "what did
 * we get through in August" and is read as totals. Producing one from the
 * other in a spreadsheet is exactly the manual step this is meant to remove.
 */

export type Grain = 'daily' | 'monthly';

/**
 * Excel decides a field is a formula if it opens with =, +, - or @, so a part
 * named "-30% offer" becomes a broken cell or worse. Prefixing with a quote is
 * the standard defusing; quotes inside are doubled per RFC 4180.
 *
 * A plain negative number is exempt, and that exemption matters: every issue
 * from the store is a negative delta, and quoting those turns the whole column
 * into text, so the boss's SUM at the bottom of the sheet silently returns
 * zero. `-1` cannot be a formula, only a number, so it is left alone.
 */
function cell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const isNumber = /^-?\d+(\.\d+)?$/.test(raw);
  const safe = !isNumber && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * `2026-08-02 08:00` in the reader's own timezone.
 *
 * Excel will not parse an ISO string with a `T` and a `Z` as a date - it lands
 * as text, so sorting a day's movements puts them in alphabetical order. This
 * is also the local clock rather than UTC, because "when did that oil go out"
 * means the time on the workshop wall, not the time in Greenwich.
 */
function stamp(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** `2026-09-17` for a day, `2026-09` for a month. */
export function bucketOf(iso: string | undefined, grain: Grain): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'unknown';
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return grain === 'monthly' ? month : `${month}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Bucketed {
  bucket: string;
  partId: string;
  partName: string;
  partNumber: string;
  inQty: number;
  outQty: number;
  writtenOff: number;
  adjusted: number;
  inValue: number;
  outValue: number;
  /** The balance after the last movement in this bucket, so it reads as a close. */
  closingBalance: number | null;
  lastAt: string;
}

function valueOf(m: Movement): number {
  if (typeof m.lineValue === 'number' && Number.isFinite(m.lineValue)) return m.lineValue;
  const unit = typeof m.unitCost === 'number' && Number.isFinite(m.unitCost) ? m.unitCost : 0;
  return Math.abs(m.delta ?? 0) * unit;
}

/** One row per part per day (or month), oldest first - how a ledger reads. */
export function summarise(movements: Movement[], grain: Grain): Bucketed[] {
  const rows = new Map<string, Bucketed>();

  // Oldest first so the last movement seen in a bucket really is the latest,
  // and its balanceAfter is the closing figure rather than the opening one.
  const ordered = [...movements].sort(
    (a, b) => new Date(a.atLocal ?? 0).getTime() - new Date(b.atLocal ?? 0).getTime()
  );

  for (const m of ordered) {
    const bucket = bucketOf(m.atLocal, grain);
    const key = `${bucket}::${m.partId}`;
    const row = rows.get(key) ?? {
      bucket,
      partId: m.partId,
      partName: m.partName || 'Unnamed part',
      partNumber: m.partNumber || '',
      inQty: 0, outQty: 0, writtenOff: 0, adjusted: 0,
      inValue: 0, outValue: 0,
      closingBalance: null,
      lastAt: '',
    };

    const qty = Math.abs(m.delta ?? 0);
    const value = valueOf(m);

    if (m.reason === 'written_off') {
      row.writtenOff += qty;
      row.outValue += value;
    } else if (m.reason === 'count_adjustment') {
      // A recount is a correction to the books, not stock moving in or out.
      row.adjusted += m.delta ?? 0;
    } else if ((m.delta ?? 0) > 0) {
      row.inQty += qty;
      row.inValue += value;
    } else {
      row.outQty += qty;
      row.outValue += value;
    }

    if (typeof m.balanceAfter === 'number') row.closingBalance = m.balanceAfter;
    row.lastAt = m.atLocal ?? row.lastAt;
    rows.set(key, row);
  }

  return [...rows.values()].sort(
    (a, b) => a.bucket.localeCompare(b.bucket) || a.partName.localeCompare(b.partName)
  );
}

export function buildStockCsv(movements: Movement[], grain: Grain): string {
  const rows = summarise(movements, grain);
  return toCsv(
    [
      grain === 'monthly' ? 'Month' : 'Date',
      'Part', 'Part number',
      'Came in', 'Went out', 'Written off', 'Recount adjustment',
      'Value in', 'Value out', 'Balance after last movement', 'Last movement',
    ],
    rows.map((r) => [
      r.bucket, r.partName, r.partNumber,
      r.inQty, r.outQty, r.writtenOff, r.adjusted,
      r.inValue.toFixed(2), r.outValue.toFixed(2),
      r.closingBalance ?? '', stamp(r.lastAt),
    ]),
  );
}

/**
 * The reason codes are written for the database; the sheet is read by someone
 * who never sees the database. An unrecognised code falls through as itself
 * rather than becoming blank, so a reason added later is still legible here.
 */
const REASON_LABEL: Record<string, string> = {
  issued_to_vehicle: 'Used on a vehicle',
  received: 'Received into store',
  count_adjustment: 'Recount correction',
  returned: 'Returned to store',
  written_off: 'Written off',
};

/** Every individual line, for when a summary raises a question. */
export function buildMovementsCsv(movements: Movement[]): string {
  const ordered = [...movements].sort(
    (a, b) => new Date(a.atLocal ?? 0).getTime() - new Date(b.atLocal ?? 0).getTime()
  );
  return toCsv(
    ['When', 'Part', 'Part number', 'Change', 'Balance after', 'Reason',
      'Unit cost', 'Line value', 'Vehicle', 'Note', 'By', 'Recorded on'],
    ordered.map((m) => [
      stamp(m.atLocal), m.partName ?? '', m.partNumber ?? '',
      m.delta ?? 0, m.balanceAfter ?? '', REASON_LABEL[m.reason] ?? m.reason ?? '',
      m.unitCost ?? '', typeof m.lineValue === 'number' ? m.lineValue.toFixed(2) : '',
      m.plate ?? '', m.note ?? '', m.byName ?? '', m.source ?? 'admin',
    ]),
  );
}

/**
 * Hands the file to the user.
 *
 * A BOM is prepended because Excel on Windows reads a UTF-8 CSV as the system
 * codepage without one, which turns every accented supplier name into mojibake
 * on the machine this app actually runs on.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
