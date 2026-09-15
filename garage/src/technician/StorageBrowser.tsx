import React from 'react';
import {
  deleteObject,
  getDownloadURL,
  getMetadata,
  listAll,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { ArrowUp, Download, Folder, RefreshCw, Trash2, Upload, File as FileIcon } from 'lucide-react';
import { storage } from '../lib/storage';
import { Button } from '../components/ui/Button';
import { DangerConfirm } from '../components/ui/DangerConfirm';
import { recordAction } from './audit';

interface Entry {
  name: string;
  fullPath: string;
  kind: 'folder' | 'file';
  size?: number;
  updated?: string;
}

/** Where a technician usually needs to start, rather than an empty box. */
const SUGGESTED = ['invoices', 'site', 'garages'];

function humanSize(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Browse, upload, download and delete anything in the project's file storage.
 *
 * Storage is where the website's pictures and the invoice PDFs live, so
 * replacing an image the site renders has to be possible without a deploy.
 */
export function StorageBrowser() {
  const [path, setPath] = React.useState('');
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [target, setTarget] = React.useState<Entry | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async (next: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAll(ref(storage, next));
      const folders: Entry[] = result.prefixes.map((p) => ({
        name: p.name,
        fullPath: p.fullPath,
        kind: 'folder',
      }));
      const files: Entry[] = await Promise.all(
        result.items.map(async (item) => {
          try {
            const meta = await getMetadata(item);
            return {
              name: item.name,
              fullPath: item.fullPath,
              kind: 'file' as const,
              size: meta.size,
              updated: meta.updated,
            };
          } catch {
            return { name: item.name, fullPath: item.fullPath, kind: 'file' as const };
          }
        })
      );
      setEntries([...folders, ...files]);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(
        code === 'storage/unauthorized'
          ? `Storage rules rejected listing "${next || '/'}". This account cannot browse here.`
          : `Could not list "${next || '/'}": ${code || (e as Error).message}`
      );
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(path);
  }, [path, load]);

  async function open(entry: Entry) {
    if (entry.kind === 'folder') {
      setPath(entry.fullPath);
      return;
    }
    try {
      const url = await getDownloadURL(ref(storage, entry.fullPath));
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setNotice(`Could not open ${entry.name}: ${(e as Error).message}`);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setNotice(null);
    const fullPath = path ? `${path}/${file.name}` : file.name;
    try {
      // Say what is being replaced before replacing it - an upload over an
      // existing name is a delete with extra steps.
      const existing = entries.find((e) => e.fullPath === fullPath);
      await recordAction({
        op: 'storage-upload',
        path: fullPath,
        before: existing ? { size: existing.size, updated: existing.updated } : null,
        after: { size: file.size, type: file.type },
        note: existing ? 'replaced an existing file' : 'new file',
      });
      await uploadBytes(ref(storage, fullPath), file);
      setNotice(`Uploaded ${file.name}.`);
      await load(path);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setNotice(
        code === 'storage/unauthorized'
          ? 'Storage rules rejected the upload. Nothing was changed.'
          : `Upload failed: ${(e as Error).message}`
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: Entry) {
    setBusy(true);
    try {
      await recordAction({
        op: 'storage-delete',
        path: entry.fullPath,
        before: { size: entry.size, updated: entry.updated },
        after: null,
      });
      await deleteObject(ref(storage, entry.fullPath));
      setNotice(`Deleted ${entry.name}.`);
      setTarget(null);
      await load(path);
    } catch (e) {
      setNotice(`Delete failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="Path, e.g. invoices/garage-id"
          className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono"
        />
        <Button variant="outline" size="sm" onClick={() => void load(path)}>
          <RefreshCw className="w-3.5 h-3.5" /> Reload
        </Button>
        {path && (
          <Button variant="outline" size="sm" onClick={() => setPath(parent)}>
            <ArrowUp className="w-3.5 h-3.5" /> Up
          </Button>
        )}
        <Button size="sm" onClick={() => fileInput.current?.click()} disabled={busy}>
          <Upload className="w-3.5 h-3.5" /> Upload here
        </Button>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex gap-2 text-xs text-gray-500 items-center">
        <span>Jump to:</span>
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => setPath(s)}
            className="px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 font-mono"
          >
            {s}
          </button>
        ))}
        <button
          onClick={() => setPath('')}
          className="px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 font-mono"
        >
          / (root)
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && <p className="text-xs text-gray-600">{notice}</p>}

      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-bold uppercase tracking-widest text-gray-500">
          {loading ? 'Loading...' : `${entries.length} item(s) in /${path}`}
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
          {entries.map((entry) => (
            <div key={entry.fullPath} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
              {entry.kind === 'folder' ? (
                <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
              ) : (
                <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
              <button
                onClick={() => void open(entry)}
                className="flex-1 text-left min-w-0"
              >
                <p className="text-sm text-gray-900 truncate">{entry.name}</p>
                {entry.kind === 'file' && (
                  <p className="text-[11px] text-gray-400">
                    {humanSize(entry.size)}
                    {entry.updated ? ` - ${new Date(entry.updated).toLocaleString()}` : ''}
                  </p>
                )}
              </button>
              {entry.kind === 'file' && (
                <>
                  <button
                    onClick={() => void open(entry)}
                    title="Open in a new window"
                    className="text-gray-400 hover:text-blue-600"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setTarget(entry)}
                    title="Delete"
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}
          {!loading && entries.length === 0 && !error && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              Nothing stored at this path.
            </p>
          )}
        </div>
      </div>

      <DangerConfirm
        isOpen={!!target}
        onClose={() => setTarget(null)}
        onConfirm={() => target && void remove(target)}
        title="Delete file"
        summary={
          `This permanently removes the file from storage. Anything linking to it - ` +
          'a picture on the website, an invoice PDF - will break immediately.'
        }
        items={target ? [target.fullPath] : []}
        confirmLabel="Delete file"
        busy={busy}
      />
    </div>
  );
}
