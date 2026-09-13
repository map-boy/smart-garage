import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Archive, ChevronDown, FileText, Wrench, Bell, AlertCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { listPeriods } from '../services/periodService';
import { formatCurrency } from '../lib/utils';

interface Row { id: string; [k: string]: unknown }

interface OpenedPeriod {
  invoices: Row[];
  jobs: Row[];
  reminders: Row[];
}

/**
 * A closed month, reopened.
 *
 * Month close was already writing archives, but nothing could read one back -
 * the boss could archive August and then had no way to answer "what did we
 * actually do in August". This is that answer.
 *
 * It reads both layouts on purpose. The desktop app writes one subcollection
 * per record type; an older chunked `records` layout also exists, written by
 * the dashboard. Rather than migrate live data, both are read and merged, so
 * an archive opens whichever wrote it.
 */
export function ArchivePage() {
  const { profile } = useAuth();
  const garageId = profile?.garageId ?? '';

  const [periods, setPeriods] = useState<{ id: string; total: number }[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, OpenedPeriod>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!garageId) return;
    listPeriods(garageId).then(setPeriods).catch(() => setPeriods([]));
  }, [garageId]);

  const open = async (periodId: string) => {
    if (openId === periodId) { setOpenId(null); return; }
    setOpenId(periodId);
    if (data[periodId]) return;

    setLoadingId(periodId);
    setError(null);
    try {
      const base = ['garages', garageId, 'archives', periodId] as const;

      const [invoices, jobs, reminders, chunks] = await Promise.all([
        getDocs(collection(db, ...base, 'invoices')),
        getDocs(collection(db, ...base, 'jobs')),
        getDocs(collection(db, ...base, 'reminders')),
        // The older chunked layout, if this archive was written that way.
        getDocs(collection(db, ...base, 'records')).catch(() => null),
      ]);

      const result: OpenedPeriod = {
        invoices: invoices.docs.map((d) => ({ id: d.id, ...d.data() })),
        jobs: jobs.docs.map((d) => ({ id: d.id, ...d.data() })),
        reminders: reminders.docs.map((d) => ({ id: d.id, ...d.data() })),
      };

      chunks?.docs
        .map((d) => d.data() as { index?: number; kind?: string; rows?: Row[] })
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .forEach((chunk) => {
          if (!chunk.rows?.length) return;
          if (chunk.kind === 'jobs') result.jobs.push(...chunk.rows);
          else if (chunk.kind === 'reminders') result.reminders.push(...chunk.rows);
          else result.invoices.push(...chunk.rows);
        });

      setData((prev) => ({ ...prev, [periodId]: result }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that archive.');
    } finally {
      setLoadingId(null);
    }
  };

  const opened = openId ? data[openId] : undefined;
  const revenue = useMemo(
    () => (opened?.invoices ?? []).reduce((sum, inv) => {
      const items = (inv.lineItems as { qty?: number; unitCost?: number }[] | undefined) ?? [];
      const parts = items.reduce((a, i) => a + (i.qty ?? 0) * (i.unitCost ?? 0), 0);
      return sum + parts + Number(inv.laborCost ?? 0);
    }, 0),
    [opened],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Archive className="w-5 h-5 text-gray-500" />
        <h1 className="text-sm font-black uppercase tracking-widest text-gray-900">Archive</h1>
      </div>

      <p className="text-xs text-gray-500 max-w-xl leading-relaxed">
        Every month closed from Settings is kept here in full. Opening one shows
        the invoices, job cards and reminders exactly as they stood the day the
        month was closed.
      </p>

      {error && (
        <div className="flex gap-2 bg-rose-50 text-rose-700 rounded-xl p-3 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {periods.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Archive className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-xs font-semibold text-gray-500">
            No months closed yet. Settings &rarr; Month close creates the first one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {periods.map((p) => {
            const isOpen = openId === p.id;
            const rows = data[p.id];
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => open(p.id)}
                  className="w-full flex items-center gap-3 p-5 hover:bg-gray-50 transition text-left"
                >
                  <div className="flex-1">
                    <p className="font-black text-gray-900">{p.id}</p>
                    <p className="text-xs text-gray-500">{p.total} records archived</p>
                  </div>
                  {loadingId === p.id && <span className="text-xs text-gray-400">Opening…</span>}
                  <ChevronDown
                    className={'w-4 h-4 text-gray-400 transition ' + (isOpen ? 'rotate-180' : '')}
                  />
                </button>

                {isOpen && rows && (
                  <div className="border-t border-gray-50 p-5 space-y-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Stat icon={FileText} label="Invoices" value={rows.invoices.length} />
                      <Stat icon={Wrench} label="Job cards" value={rows.jobs.length} />
                      <Stat icon={Bell} label="Reminders" value={rows.reminders.length} />
                      <Stat label="Invoiced" value={formatCurrency(revenue)} />
                    </div>

                    {rows.invoices.length > 0 && (
                      <Listing title="Invoices" rows={rows.invoices.slice(0, 50)} render={(r) => (
                        <>
                          <span className="font-mono text-xs">{String(r.id)}</span>
                          <span className="text-gray-500">{String(r.status ?? '')}</span>
                        </>
                      )} />
                    )}
                    {rows.jobs.length > 0 && (
                      <Listing title="Job cards" rows={rows.jobs.slice(0, 50)} render={(r) => (
                        <>
                          <span className="font-mono text-xs">{String(r.id)}</span>
                          <span className="text-gray-500">{String(r.status ?? '')}</span>
                        </>
                      )} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat(
  { icon: Icon, label, value }:
  { icon?: typeof FileText; label: string; value: number | string },
) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-gray-400">
        {Icon && <Icon className="w-3 h-3" />}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-black text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function Listing(
  { title, rows, render }:
  { title: string; rows: Row[]; render: (r: Row) => React.ReactNode },
) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{title}</p>
      <div className="divide-y divide-gray-50">
        {rows.map((r) => (
          <div key={String(r.id)} className="flex justify-between py-2 text-sm">{render(r)}</div>
        ))}
      </div>
    </div>
  );
}
