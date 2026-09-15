import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
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
      (error) => {
        // Reporting must not throw here. This callback runs inside Firestore's
        // listener, where an exception becomes an unhandled rejection and takes
        // the window down because one collection was unreadable.
        try {
          handleFirestoreError(error, OperationType.LIST, collectionName);
        } catch {
          /* already logged by handleFirestoreError */
        }
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [profile?.garageId, collectionName]);

  const save = async (item: T) => {
    if (!profile?.garageId) return;
    try {
      await setDoc(doc(db, 'garages', profile.garageId, collectionName, item.id), item);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, collectionName);
    }
  };

  const remove = async (id: string) => {
    if (!profile?.garageId) return;
    try {
      await deleteDoc(doc(db, 'garages', profile.garageId, collectionName, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, collectionName);
    }
  };

  return { items, loading, save, remove };
}
