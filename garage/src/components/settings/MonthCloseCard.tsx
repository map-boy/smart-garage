import { useEffect, useState } from 'react';
import { Archive, AlertTriangle, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { closePeriod, currentPeriodId, listPeriods, PeriodResult } from '../../services/periodService';

export function MonthCloseCard() {
  const { profile, online } = useAuth();
  const [period, setPeriod] = useState(currentPeriodId());
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PeriodResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [past, setPast] = useState<{ id: string; total: number }[]>([]);

  const garageId = profile?.garageId ?? '';

  useEffect(() => {
    if (!garageId) return;
    listPeriods(garageId).then(setPast).catch(() => setPast([]));
  }, [garageId, result]);

  async function run(clear: boolean) {
    if (!garageId) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await closePeriod(garageId, period, clear);
      setResult(r);
      setConfirm('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not close the period.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 space-y-4 border border-gray-100">
      <div className="flex items-center gap-2">
        <Archive className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-black uppercase tracking-widest text-gray-900">Month close</h2>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        Copies this period&apos;s invoices, jobs and reminders into a dated archive.
        Clients, vehicles and stock are never touched. The archive is read back and
        checked before anything is cleared. Works offline &mdash; it uploads when
        internet returns.
      </p>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
            Period
          </label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={() => run(false)}
          disabled={busy || !garageId}
          className="bg-gray-900 hover:bg-black disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest px-4 py-2.5 rounded-xl transition"
        >
          {busy ? 'Working' : 'Archive only'}
        </button>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Start a new month &mdash; type CLOSE to confirm
        </label>
        <div className="flex gap-2">
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.toUpperCase())}
            placeholder="CLOSE"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm"
          />
          <button
            onClick={() => run(true)}
            disabled={busy || confirm !== 'CLOSE' || !garageId}
            className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest px-4 py-2.5 rounded-xl transition"
          >
            Archive &amp; clear
          </button>
        </div>
        {!online && (
          <p className="text-[11px] text-amber-600 font-medium">
            Offline &mdash; the archive is written on this computer and uploads later.
          </p>
        )}
      </div>

      {error && (
        <div className="flex gap-2 bg-red-50 text-red-700 rounded-xl p-3 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="flex gap-2 bg-emerald-50 text-emerald-800 rounded-xl p-3 text-xs">
          <Check className="w-4 h-4 shrink-0" />
          <span>
            {result.periodId}: archived {result.total} records
            {Object.keys(result.cleared).length > 0 &&
              ', cleared ' + Object.values(result.cleared).reduce((a, b) => a + b, 0)}
            .
          </span>
        </div>
      )}

      {past.length > 0 && (
        <div className="pt-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Archived periods</p>
          <div className="space-y-1">
            {past.map((p) => (
              <div key={p.id} className="flex justify-between text-xs text-gray-600">
                <span className="font-medium">{p.id}</span>
                <span>{p.total} records</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
