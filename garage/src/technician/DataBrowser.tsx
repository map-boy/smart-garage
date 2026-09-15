import React from 'react';
import { Plus, RefreshCw, Save, Trash2, CloudOff, Search } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { DangerConfirm } from '../components/ui/DangerConfirm';
import type { CollectionSpec } from './registry';
import { COLLECTIONS } from './registry';
import type { DocRow } from './dataAccess';
import { isReadOnly, listDocs, removeMany, saveDoc } from './dataAccess';

interface Props {
  garageId: string;
}

/**
 * A document browser over every collection in the registry.
 *
 * The editor is raw JSON on purpose. A technician console that only exposes
 * the fields someone thought to build a form for is useless exactly when it is
 * needed - a record with an unexpected shape, a field the app writes but never
 * shows. JSON edits anything, and the parse has to succeed before Save will
 * even light up, so a malformed document cannot be written.
 */
export function DataBrowser({ garageId }: Props) {
  const [specId, setSpecId] = React.useState(COLLECTIONS[0].id);
  const [rows, setRows] = React.useState<DocRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState('');

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const [draftId, setDraftId] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const spec = COLLECTIONS.find((c) => c.id === specId) as CollectionSpec;
  const readOnly = isReadOnly(spec);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setChecked(new Set());
    setSelectedId(null);
    setCreating(false);
    try {
      setRows(await listDocs(spec, garageId));
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(
        code === 'permission-denied'
          ? `Rules rejected reading ${spec.label.toLowerCase()}. This is a permissions ` +
            'problem, not a connection one - the list will stay empty until the rules ' +
            'or this account change.'
          : `Could not load ${spec.label.toLowerCase()}: ${(e as Error).message}`
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [spec, garageId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = rows.filter((r) => {
    if (!filter.trim()) return true;
    const needle = filter.toLowerCase();
    return (
      r.id.toLowerCase().includes(needle) ||
      r.title.toLowerCase().includes(needle) ||
      JSON.stringify(r.data).toLowerCase().includes(needle)
    );
  });

  function openRow(row: DocRow) {
    setCreating(false);
    setSelectedId(row.id);
    setDraftId(row.id);
    setDraft(JSON.stringify(row.data, null, 2));
    setNotice(null);
  }

  function startCreate() {
    setCreating(true);
    setSelectedId(null);
    setDraftId('');
    setDraft('{\n  \n}');
    setNotice(null);
  }

  let parsed: Record<string, unknown> | null = null;
  let parseError: string | null = null;
  if (draft.trim()) {
    try {
      const value = JSON.parse(draft);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
      } else {
        parseError = 'A document must be a JSON object.';
      }
    } catch (e) {
      parseError = (e as Error).message;
    }
  }

  async function save() {
    if (!parsed) return;
    const id = (creating ? draftId : selectedId)?.trim();
    if (!id) {
      setNotice('Give the document an id first.');
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await saveDoc(spec, garageId, id, parsed, creating ? 'created from console' : 'edited from console');
      setNotice(`Saved ${spec.label} / ${id}.`);
      await load();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setNotice(
        code === 'permission-denied'
          ? 'Rules rejected this write. Nothing was changed.'
          : `Save failed: ${(e as Error).message}`
      );
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    try {
      const { deleted, failed } = await removeMany(
        spec,
        garageId,
        [...checked],
        'deleted from console'
      );
      setNotice(
        failed.length === 0
          ? `Deleted ${deleted.length} document(s).`
          : `Deleted ${deleted.length}, refused ${failed.length}: ` +
            failed.map((f) => `${f.id} (${f.reason})`).join(', ')
      );
      setConfirmOpen(false);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={specId}
          onChange={(e) => setSpecId(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold bg-white"
        >
          <optgroup label="Project-wide">
            {COLLECTIONS.filter((c) => c.scope === 'root').map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </optgroup>
          <optgroup label="This garage">
            {COLLECTIONS.filter((c) => c.scope === 'garage').map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </optgroup>
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by id, title or any field value"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
        </div>

        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="w-3.5 h-3.5" /> Reload
        </Button>
        {!readOnly && (
          <Button size="sm" onClick={startCreate}>
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
        )}
        {!readOnly && checked.size > 0 && (
          <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Delete {checked.size}
          </Button>
        )}
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        <span className="font-mono text-gray-700">
          {spec.path.replace('{garageId}', garageId)}
        </span>
        {' - '}
        {spec.blurb}
        {readOnly && (
          <span className="text-amber-600 font-semibold"> Read-only.</span>
        )}
      </p>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-bold uppercase tracking-widest text-gray-500 flex justify-between">
            <span>{loading ? 'Loading...' : `${visible.length} document(s)`}</span>
            {rows.length >= (spec.pageSize ?? 100) && (
              <span className="text-amber-600">capped at {spec.pageSize ?? 100}</span>
            )}
          </div>
          <div className="max-h-[28rem] overflow-y-auto divide-y divide-gray-50">
            {visible.map((row) => (
              <div
                key={row.id}
                className={
                  'flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer ' +
                  (selectedId === row.id ? 'bg-blue-50/60' : '')
                }
                onClick={() => openRow(row)}
              >
                {!readOnly && (
                  <input
                    type="checkbox"
                    checked={checked.has(row.id)}
                    onChange={() => toggle(row.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{row.title}</p>
                  <p className="text-[11px] font-mono text-gray-400 truncate">{row.id}</p>
                </div>
                {row.pending && (
                  <span
                    title="Not yet confirmed by the server"
                    className="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-600"
                  >
                    <CloudOff className="w-3 h-3" /> pending
                  </span>
                )}
              </div>
            ))}
            {!loading && visible.length === 0 && !error && (
              <p className="px-4 py-8 text-center text-sm text-gray-400">
                Nothing here.
              </p>
            )}
          </div>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-bold uppercase tracking-widest text-gray-500">
            {creating ? 'New document' : selectedId ? `Editing ${selectedId}` : 'Select a document'}
          </div>
          <div className="p-4 space-y-3 flex-1">
            {creating && (
              <input
                value={draftId}
                onChange={(e) => setDraftId(e.target.value)}
                placeholder="Document id (leave meaningful - it is the key)"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono"
              />
            )}
            {(creating || selectedId) && (
              <>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  readOnly={readOnly}
                  className="w-full h-72 px-3 py-2 rounded-lg border border-gray-200 font-mono text-xs leading-relaxed focus:outline-none focus:border-blue-400"
                />
                {parseError && (
                  <p className="text-xs text-red-600">Not valid JSON: {parseError}</p>
                )}
                {!readOnly && (
                  <Button onClick={() => void save()} disabled={!parsed || saving}>
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving...' : 'Save document'}
                  </Button>
                )}
              </>
            )}
            {notice && <p className="text-xs text-gray-600">{notice}</p>}
          </div>
        </div>
      </div>

      <DangerConfirm
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void doDelete()}
        title={`Delete from ${spec.label}`}
        summary={
          `This permanently deletes ${checked.size} document(s) from ` +
          `${spec.path.replace('{garageId}', garageId)}. There is no undo, but the ` +
          'audit log keeps a copy of each one so it can be recreated by hand.'
        }
        items={[...checked].map((id) => {
          const row = rows.find((r) => r.id === id);
          return row ? `${row.title}  (${id})` : id;
        })}
        requirePhrase={checked.size > 5 ? 'DELETE' : undefined}
        confirmLabel={`Delete ${checked.size}`}
        busy={deleting}
      />
    </div>
  );
}
