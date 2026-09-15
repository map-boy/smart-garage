import React from 'react';
import { Database, HardDrive, Lock, LogOut, Stethoscope, Wrench } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { DataBrowser } from '../technician/DataBrowser';
import { StorageBrowser } from '../technician/StorageBrowser';
import { DiagnosticsPanel } from '../technician/DiagnosticsPanel';
import { listGarageIds } from '../technician/dataAccess';
import { isUnlocked, lock, unlock, unlockedUntil } from '../technician/session';

type Tab = 'diagnostics' | 'data' | 'storage';

const TABS: { id: Tab; label: string; icon: typeof Database }[] = [
  { id: 'diagnostics', label: 'Diagnostics', icon: Stethoscope },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'storage', label: 'Files', icon: HardDrive },
];

/**
 * The technician console.
 *
 * Unlike every other screen, this one is not scoped to the garage this machine
 * belongs to - the garage is a dropdown, because the person opening this is
 * fixing someone else's install. That is also why it is behind a password and
 * not on the main menu.
 */
export function TechnicianPage() {
  const { profile } = useAuth();
  const [unlocked, setUnlocked] = React.useState(isUnlocked());
  const [attempt, setAttempt] = React.useState('');
  const [denied, setDenied] = React.useState(false);

  const [tab, setTab] = React.useState<Tab>('diagnostics');
  const [garageIds, setGarageIds] = React.useState<string[]>([]);
  const [garageId, setGarageId] = React.useState(profile?.garageId || '');

  React.useEffect(() => {
    if (!unlocked) return;
    const fallback = profile?.garageId || '';
    void listGarageIds(fallback).then((ids) => {
      setGarageIds(ids);
      setGarageId((current) => current || ids[0] || fallback);
    });
  }, [unlocked, profile?.garageId]);

  function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (unlock(attempt)) {
      setUnlocked(true);
      setDenied(false);
      setAttempt('');
    } else {
      setDenied(true);
    }
  }

  if (!unlocked) {
    return (
      <div className="max-w-sm mx-auto mt-24">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center mb-5">
            <Wrench className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Technician console</h1>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Full read and write access to every garage in this project. Everything done
            in here is recorded against this session.
          </p>
          <form onSubmit={tryUnlock} className="mt-6 space-y-3">
            <input
              type="password"
              value={attempt}
              onChange={(e) => {
                setAttempt(e.target.value);
                setDenied(false);
              }}
              placeholder="Technician password"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-900"
            />
            {denied && (
              <p className="text-xs text-red-600">That password is not right.</p>
            )}
            <Button type="submit" className="w-full" disabled={!attempt}>
              <Lock className="w-3.5 h-3.5" /> Unlock
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const until = unlockedUntil();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-slate-400" /> Technician console
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            No garage scoping here. Every change is written to the audit log.
            {until && ` Locks itself at ${until.toLocaleTimeString()}.`}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            lock();
            setUnlocked(false);
          }}
        >
          <LogOut className="w-3.5 h-3.5" /> Exit technician mode
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ' +
                (tab === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800')
              }
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {tab !== 'storage' && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Garage
            {garageIds.length > 1 ? (
              <select
                value={garageId}
                onChange={(e) => setGarageId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono bg-white"
              >
                {garageIds.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            ) : (
              <input
                value={garageId}
                onChange={(e) => setGarageId(e.target.value)}
                placeholder="garage id"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
              />
            )}
          </label>
        )}
      </div>

      {!garageId && tab !== 'storage' ? (
        <p className="text-sm text-slate-500">
          Enter the garage id to work on. It is the document id under{' '}
          <span className="font-mono">garages/</span>.
        </p>
      ) : (
        <>
          {tab === 'diagnostics' && <DiagnosticsPanel garageId={garageId} />}
          {tab === 'data' && <DataBrowser garageId={garageId} />}
          {tab === 'storage' && <StorageBrowser />}
        </>
      )}
    </div>
  );
}
