import { useState } from 'react';
import { doc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import {
  Archive, ChevronDown, ChevronUp, Trash2, AlertTriangle, ShieldAlert, Wrench, CreditCard, X
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ArchiveRecord, ArchiveChunk, GarageSettings, JobCard, Invoice } from '../types';
import { invoiceSpend } from '../utils/format';
import { formatCurrency, formatDate } from '../utils/format';

interface ArchivesViewProps {
  garageId: string;
  archives: ArchiveRecord[];
  settings: GarageSettings;
}

interface LoadedRecords {
  jobs: JobCard[];
  invoices: Invoice[];
}

export default function ArchivesView({ garageId, archives, settings }: ArchivesViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, LoadedRecords>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const pendingDeleteArchive = archives.find(a => a.id === pendingDeleteId) || null;

  /**
   * Loads an archive's records the first time it is expanded, and caches them
   * for the session. Archives are immutable once written, so a cached copy
   * can never go stale.
   */
  const loadRecords = async (archive: ArchiveRecord) => {
    if (records[archive.id]) return;

    // Archives written before records were chunked out still carry their
    // rows inline; use them directly rather than querying an empty
    // subcollection.
    if (archive.jobs || archive.invoices) {
      setRecords(prev => ({
        ...prev,
        [archive.id]: {
          jobs: archive.jobs ?? [],
          invoices: archive.invoices ?? [],
        },
      }));
      return;
    }

    setLoadingId(archive.id);
    setLoadError(null);
    try {
      const snap = await getDocs(
        collection(db, 'garages', garageId, 'archives', archive.id, 'records')
      );
      const jobs: JobCard[] = [];
      const invoices: Invoice[] = [];
      snap.docs
        .map(d => d.data() as ArchiveChunk)
        .sort((a, b) => a.index - b.index)
        .forEach(chunk => {
          if (chunk.kind === 'jobs') jobs.push(...(chunk.rows as JobCard[]));
          else invoices.push(...(chunk.rows as Invoice[]));
        });
      setRecords(prev => ({ ...prev, [archive.id]: { jobs, invoices } }));
    } catch (error) {
      setLoadError(handleFirestoreError(
        error, OperationType.LIST,
        `garages/${garageId}/archives/${archive.id}/records`
      ));
    } finally {
      setLoadingId(null);
    }
  };

  const handleToggleExpand = (archive: ArchiveRecord) => {
    if (expandedId === archive.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(archive.id);
    void loadRecords(archive);
  };

  const handleDeleteArchive = async () => {
    if (!pendingDeleteId || !garageId) return;
    setIsDeleting(true);
    setDeleteError(null);
    const archivePath = `garages/${garageId}/archives/${pendingDeleteId}`;
    try {
      // Deleting a document does NOT delete its subcollections in Firestore.
      // Without this the record chunks would linger forever, invisible and
      // still billed for storage.
      const recordsSnap = await getDocs(
        collection(db, 'garages', garageId, 'archives', pendingDeleteId, 'records')
      );
      for (let i = 0; i < recordsSnap.docs.length; i += 450) {
        const batch = writeBatch(db);
        recordsSnap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, 'garages', garageId, 'archives', pendingDeleteId));
      setRecords(prev => {
        const next = { ...prev };
        delete next[pendingDeleteId];
        return next;
      });
      setPendingDeleteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, archivePath);
      setDeleteError("Could not delete this archive. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div id="archives-view-root" className="space-y-6 animate-fade-in">
      {/* View Header */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-display">MONTHLY SNAPSHOTS</span>
        <h1 className="text-xl font-black text-gray-900 tracking-tight mt-1">Archives</h1>
        <p className="text-xs text-gray-500 mt-1">Data saved each time "Start New Month" is run. Deleting an archive here is permanent.</p>
      </div>

      {/* Archive Cards */}
      {archives.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <Archive className="w-8 h-8 text-gray-300 mb-3" />
          <p className="text-xs font-semibold text-gray-500">No archives yet</p>
          <p className="text-[11px] text-gray-400 mt-1">Run "Start New Month" from the Admin Zone to create the first one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {archives.map(archive => {
            const isExpanded = expandedId === archive.id;
            const loaded = records[archive.id];
            const isLoading = loadingId === archive.id;
            return (
              <div key={archive.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                      <Archive className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{archive.monthLabel}</h3>
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">Archived {formatDate(archive.archivedAt)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-600">
                      <Wrench className="w-3 h-3" /> {archive.jobCount} jobs
                    </span>
                    <span className="flex items-center gap-1 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-600">
                      <CreditCard className="w-3 h-3" /> {archive.invoiceCount} invoices
                    </span>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={() => handleToggleExpand(archive)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-gray-600 border border-gray-100 hover:bg-gray-50 transition cursor-pointer"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span>{isExpanded ? 'Hide' : 'View'}</span>
                    </button>
                    <button
                      onClick={() => { setPendingDeleteId(archive.id); setDeleteError(null); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 border border-rose-100 bg-rose-50/60 hover:bg-rose-50 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Expanded detail: jobs + invoices captured in this snapshot,
                    fetched on demand rather than carried in the list. */}
                {isExpanded && isLoading && (
                  <div className="border-t border-gray-100 px-6 py-8 flex items-center justify-center gap-3 text-xs text-gray-400">
                    <span className="h-4 w-4 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
                    Loading archived recordsâ€¦
                  </div>
                )}

                {isExpanded && !isLoading && loadError && (
                  <div className="border-t border-gray-100 px-6 py-6 flex items-center gap-2 text-xs font-medium text-rose-600">
                    <ShieldAlert className="w-4 h-4 shrink-0" /> {loadError}
                  </div>
                )}

                {isExpanded && !isLoading && loaded && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Job Card</th>
                            <th className="px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Technician</th>
                            <th className="px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
                            <th className="px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Labor Cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs">
                          {loaded.jobs.map(job => (
                            <tr key={job.id} className="hover:bg-gray-50/40">
                              <td className="px-6 py-3 text-gray-600 max-w-xs truncate">{job.description || 'â€”'}</td>
                              <td className="px-6 py-3 text-gray-500">{job.technicianName || 'Unassigned'}</td>
                              <td className="px-6 py-3 text-gray-500">{job.status}</td>
                              <td className="px-6 py-3 text-right font-mono font-bold text-gray-800">{formatCurrency(job.laborCost, settings.currency)}</td>
                            </tr>
                          ))}
                          {loaded.jobs.length === 0 && (
                            <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-400">No job cards in this snapshot</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Invoice</th>
                            <th className="px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Issued</th>
                            <th className="px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
                            <th className="px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs">
                          {loaded.invoices.map(inv => {
                            const total = invoiceSpend(inv);
                            return (
                              <tr key={inv.id} className="hover:bg-gray-50/40">
                                <td className="px-6 py-3 font-mono font-bold text-gray-800">#{inv.id?.slice(0, 8).toUpperCase() || 'BILL'}</td>
                                <td className="px-6 py-3 text-gray-500 font-mono">{formatDate(inv.issuedAt)}</td>
                                <td className="px-6 py-3 text-gray-500">{inv.status}</td>
                                <td className="px-6 py-3 text-right font-mono font-bold text-gray-800">{formatCurrency(total, settings.currency)}</td>
                              </tr>
                            );
                          })}
                          {loaded.invoices.length === 0 && (
                            <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-400">No invoices in this snapshot</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDeleteArchive && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isDeleting && setPendingDeleteId(null)} />
          <div className="relative w-full max-w-md bg-white border border-gray-100 rounded-3xl p-7 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-11 w-11 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-rose-500 font-mono">PERMANENT DELETE</span>
                <h2 className="text-base font-black text-gray-900 tracking-tight">Delete This Archive?</h2>
              </div>
              <button onClick={() => !isDeleting && setPendingDeleteId(null)} className="ml-auto p-1.5 rounded-lg text-gray-300 hover:bg-gray-50 hover:text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed mb-4">
              This permanently deletes the <strong>{pendingDeleteArchive.monthLabel}</strong> snapshot ({pendingDeleteArchive.jobCount} job{pendingDeleteArchive.jobCount === 1 ? '' : 's'}, {pendingDeleteArchive.invoiceCount} invoice{pendingDeleteArchive.invoiceCount === 1 ? '' : 's'}). This cannot be undone.
            </p>

            {deleteError && (
              <div className="flex items-center gap-2 bg-rose-50 text-rose-700 p-3 rounded-xl border border-rose-100 text-xs font-medium mb-4">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setPendingDeleteId(null)}
                disabled={isDeleting}
                className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 py-3 rounded-2xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteArchive}
                disabled={isDeleting}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-2xl text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete Permanently</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}