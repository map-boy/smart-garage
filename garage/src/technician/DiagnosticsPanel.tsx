import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  PlayCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { settle } from './audit';
import { Button } from '../components/ui/Button';
import type { CheckResult, StuckWrite } from './diagnostics';
import { findStuckWrites, runAllChecks, STUCK_AFTER_MINUTES } from './diagnostics';

interface Props {
  garageId: string;
}

const ICONS = {
  ok: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  fail: <XCircle className="w-4 h-4 text-red-500" />,
  skip: <AlertTriangle className="w-4 h-4 text-gray-300" />,
};

const ROW_TONE = {
  ok: 'border-emerald-100 bg-emerald-50/40',
  warn: 'border-amber-100 bg-amber-50/40',
  fail: 'border-red-100 bg-red-50/40',
  skip: 'border-gray-100 bg-gray-50',
};

export function DiagnosticsPanel({ garageId }: Props) {
  const [results, setResults] = React.useState<CheckResult[]>([]);
  const [running, setRunning] = React.useState(false);
  const [stuck, setStuck] = React.useState<StuckWrite[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function run() {
    setRunning(true);
    setResults([]);
    setNotice(null);
    try {
      await runAllChecks(garageId, (r) => setResults((prev) => [...prev, r]));
      setStuck(await findStuckWrites(garageId));
    } catch (e) {
      setNotice(`The check run itself failed: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  /**
   * Nudges a stuck document so Firestore attempts it again.
   *
   * A write sitting in the queue is retried by the SDK on its own, so this is
   * only useful when the queue is drained but the document was refused - the
   * touch produces a fresh error the checks above can name.
   */
  async function retry(item: StuckWrite) {
    setNotice(null);
    try {
      const outcome = await settle(
        setDoc(
          doc(db, item.path, item.id),
          { retriedAt: new Date().toISOString() },
          { merge: true }
        )
      );
      setNotice(
        outcome === 'queued'
          ? `${item.title} is still not reaching the server. Nothing is lost - it ` +
            'stays queued - but the connection is the thing to look at, not the record.'
          : outcome === 'refused'
            ? `${item.title} is refused by the rules, not delayed. It will never sync ` +
              'as it stands - fix the rule or the record, or delete it from the Data tab.'
            : `Retried ${item.title}. It cleared, so the original write went through.`
      );
      setStuck(await findStuckWrites(garageId));
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setNotice(
        code === 'permission-denied'
          ? `${item.title} is refused by the rules, not delayed. It will never sync as ` +
            'it stands - fix the rule or the record, or delete it from the browser tab.'
          : `Retry failed: ${code || (e as Error).message}`
      );
    }
  }

  const failures = results.filter((r) => r.status === 'fail').length;
  const warnings = results.filter((r) => r.status === 'warn').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => void run()} disabled={running}>
          {running ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <PlayCircle className="w-3.5 h-3.5" />
          )}
          {running ? 'Checking...' : 'Check everything'}
        </Button>
        <p className="text-xs text-gray-500">
          Runs against <span className="font-mono text-gray-700">{garageId}</span>. Each
          check forces a real server round trip, so a warm cache cannot make a broken
          system look healthy.
        </p>
      </div>

      {results.length > 0 && (
        <div
          className={
            'px-4 py-3 rounded-xl border text-sm font-semibold ' +
            (failures > 0
              ? 'bg-red-50 border-red-100 text-red-800'
              : warnings > 0
                ? 'bg-amber-50 border-amber-100 text-amber-800'
                : 'bg-emerald-50 border-emerald-100 text-emerald-800')
          }
        >
          {failures > 0
            ? `${failures} thing(s) are broken and will not fix themselves.`
            : warnings > 0
              ? `Nothing is broken, but ${warnings} thing(s) need an eye kept on them.`
              : 'Everything checked is working.'}
        </div>
      )}

      <div className="space-y-2">
        {results.map((r) => (
          <div key={r.id} className={'flex gap-3 px-4 py-3 rounded-xl border ' + ROW_TONE[r.status]}>
            <div className="flex-shrink-0 mt-0.5">{ICONS[r.status]}</div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{r.label}</p>
              <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{r.detail}</p>
              {r.hint && (
                <p className="text-xs text-gray-500 mt-1 leading-relaxed italic">{r.hint}</p>
              )}
            </div>
          </div>
        ))}
        {running && (
          <p className="text-xs text-gray-400 px-4">Running the next check...</p>
        )}
      </div>

      {notice && (
        <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-800">
          {notice}
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">Stuck writes</h3>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Records this machine wrote that the server has still not confirmed after{' '}
          {STUCK_AFTER_MINUTES} minutes. While the checks above show the connection is
          down this is normal and nothing is lost. If they show the connection is fine,
          these were refused rather than delayed.
        </p>
        {stuck.length === 0 ? (
          <p className="text-xs text-gray-400 px-4 py-6 text-center border border-gray-200 rounded-xl">
            {results.length === 0 ? 'Run the checks to look.' : 'Nothing is stuck.'}
          </p>
        ) : (
          <div className="border border-amber-200 rounded-xl overflow-hidden divide-y divide-amber-50">
            {stuck.map((item) => (
              <div key={item.path + item.id} className="flex items-center gap-3 px-4 py-3 bg-amber-50/40">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
                  <p className="text-[11px] font-mono text-gray-500 truncate">
                    {item.path}/{item.id}
                  </p>
                  <p className="text-[11px] text-amber-700">
                    waiting {item.ageMinutes ?? '?'} minutes
                    {item.since ? ` (since ${new Date(item.since).toLocaleString()})` : ''}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void retry(item)}>
                  Retry
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
