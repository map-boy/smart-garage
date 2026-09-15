import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { settleWrite } from '../lib/firestoreWrite';
import { useAuth } from '../context/AuthContext';

/**
 * Real-time, offline-first CRUD for a garage-scoped Firestore subcollection
 * at /garages/{garageId}/{collectionName}. Firestore's local cache means
 * this works fully offline; writes sync automatically once back online.
 *
 * Every item carries `_pending`, true while the record exists only in this
 * machine's cache. Screens render it as a "syncing" mark: offline-first is
 * only honest if the person looking at a record can tell whether the rest of
 * the business can see it yet.
 */
export type WithSyncState<T> = T & { _pending: boolean };

export function useGarageCollection<T extends { id: string }>(collectionName: string) {
  const { profile } = useAuth();
  const [items, setItems] = useState<WithSyncState<T>[]>([]);
  const [loading, setLoading] = useState(true);
  // A write that fails has to say so. Firestore removes a refused record from
  // the local cache again, so without this the row appears for an instant and
  // then vanishes with nothing on screen to explain why.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.garageId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const colRef = collection(db, 'garages', profile.garageId, collectionName);
    const unsubscribe = onSnapshot(
      colRef,
      // Without this the listener only fires when the data changes, so a
      // record would keep its "syncing" mark until something else edited it.
      { includeMetadataChanges: true },
      (snapshot) => {
        setItems(snapshot.docs.map(d => ({
          ...(d.data() as T),
          id: d.id,
          _pending: d.metadata.hasPendingWrites,
        })));
        setLoading(false);
      },
      (err) => {
        // Reporting must not throw here. This callback runs inside Firestore's
        // listener, where an exception becomes an unhandled rejection and takes
        // the window down because one collection was unreadable.
        try {
          handleFirestoreError(err, OperationType.LIST, collectionName);
        } catch {
          /* already logged by handleFirestoreError */
        }
        // An unreadable collection renders as an empty list, which looks
        // exactly like a garage with no records in it. Say which one it is.
        const code = (err as { code?: string })?.code;
        setError(
          code === 'permission-denied'
            ? `The database refused to let this account read ${collectionName}. ` +
              'The list below is empty because of that, not because there is nothing in it.'
            : `Could not load ${collectionName}: ${(err as Error)?.message ?? 'unknown error'}.`
        );
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [profile?.garageId, collectionName]);

  const save = async (item: T) => {
    if (!profile?.garageId) {
      setError('No garage is selected on this computer, so nothing could be saved.');
      return;
    }
    setError(null);
    // `_pending` is this app's own view of sync state, not part of the record.
    // Items handed back by this hook carry it, and editing screens spread an
    // existing item into the value they save, so without stripping it the flag
    // gets written into the document.
    const { _pending: _ignored, ...clean } = item as WithSyncState<T>;
    const outcome = await settleWrite(
      setDoc(doc(db, 'garages', profile.garageId, collectionName, item.id), clean)
    );
    if (outcome.state === 'refused') {
      // Logged for the crash reporter, but never rethrown: this runs detached
      // from any click handler, so throwing would only produce an unhandled
      // rejection and the person would still see nothing.
      try {
        handleFirestoreError(outcome.code, OperationType.WRITE, collectionName);
      } catch {
        /* handleFirestoreError logs, then throws by design */
      }
    }
    if (outcome.message) setError(outcome.message);
    return outcome;
  };

  const remove = async (id: string) => {
    if (!profile?.garageId) return;
    setError(null);
    const outcome = await settleWrite(
      deleteDoc(doc(db, 'garages', profile.garageId, collectionName, id))
    );
    if (outcome.state === 'refused') {
      try {
        handleFirestoreError(outcome.code, OperationType.DELETE, collectionName);
      } catch {
        /* as above */
      }
    }
    if (outcome.message) setError(outcome.message);
    return outcome;
  };

  return { items, loading, error, clearError: () => setError(null), save, remove };
}
