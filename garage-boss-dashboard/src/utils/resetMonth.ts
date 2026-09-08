import { writeBatch, doc, collection } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { JobCard, Invoice } from '../types';

// Firestore hard-caps a batch at 500 writes. Stay comfortably under it.
const BATCH_LIMIT = 450;

/**
 * Firestore hard-caps a single document at 1 MiB.
 *
 * The previous implementation wrote every job and invoice for the month into
 * one archive document. A busy garage crosses that ceiling in a few hundred
 * records, and the failure is the worst possible shape: the archive write
 * throws, so the month cannot be closed at all — and had the delete run
 * first, the records would have been destroyed with no archive to show for
 * it. Records are now written in bounded chunks, each its own document.
 */
const RECORDS_PER_CHUNK = 100;

export interface ResetMonthResult {
  archiveId: string;
  monthLabel: string;
  jobCount: number;
  invoiceCount: number;
  chunkCount: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Archives the current jobs + invoices, then deletes the originals from the
 * live `jobs` and `invoices` subcollections.
 *
 * Ordering is deliberate and load-bearing: every chunk is written and
 * verified before a single original is deleted. If anything fails partway,
 * the live data is still intact and the operation can simply be retried.
 */
export async function resetMonth(
  garageId: string,
  jobs: JobCard[],
  invoices: Invoice[]
): Promise<ResetMonthResult> {
  const now = new Date();
  const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const archiveId = `archive_${now.getTime()}`;
  const archivePath = `garages/${garageId}/archives/${archiveId}`;

  try {
    const archiveRef = doc(db, 'garages', garageId, 'archives', archiveId);
    const jobChunks = chunk(jobs, RECORDS_PER_CHUNK);
    const invoiceChunks = chunk(invoices, RECORDS_PER_CHUNK);
    const chunkCount = jobChunks.length + invoiceChunks.length;

    // 1. Write the record chunks first, under the archive document.
    const chunkBatch = () => writeBatch(db);
    let batch = chunkBatch();
    let opsInBatch = 0;

    const queueChunk = async (kind: 'jobs' | 'invoices', index: number, rows: unknown[]) => {
      const ref = doc(
        collection(db, 'garages', garageId, 'archives', archiveId, 'records'),
        `${kind}_${String(index).padStart(4, '0')}`
      );
      batch.set(ref, { kind, index, rows });
      opsInBatch++;
      if (opsInBatch >= BATCH_LIMIT) {
        await batch.commit();
        batch = chunkBatch();
        opsInBatch = 0;
      }
    };

    for (const [i, rows] of jobChunks.entries()) await queueChunk('jobs', i, rows);
    for (const [i, rows] of invoiceChunks.entries()) await queueChunk('invoices', i, rows);
    if (opsInBatch > 0) await batch.commit();

    // 2. Write the manifest last. Its presence is what marks the archive
    //    complete, so a run that dies midway leaves no half-archive that
    //    looks finished.
    const manifestBatch = writeBatch(db);
    manifestBatch.set(archiveRef, {
      archivedAt: now.toISOString(),
      monthLabel,
      jobCount: jobs.length,
      invoiceCount: invoices.length,
      chunkCount,
      recordsPerChunk: RECORDS_PER_CHUNK,
      complete: true,
    });
    await manifestBatch.commit();

    // 3. Only now delete the originals.
    const refsToDelete = [
      ...jobs.map((j) => doc(db, 'garages', garageId, 'jobs', j.id)),
      ...invoices.map((i) => doc(db, 'garages', garageId, 'invoices', i.id)),
    ];

    for (let i = 0; i < refsToDelete.length; i += BATCH_LIMIT) {
      const deleteBatch = writeBatch(db);
      refsToDelete.slice(i, i + BATCH_LIMIT).forEach((ref) => deleteBatch.delete(ref));
      await deleteBatch.commit();
    }

    return {
      archiveId,
      monthLabel,
      jobCount: jobs.length,
      invoiceCount: invoices.length,
      chunkCount,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, archivePath);
    throw error;
  }
}
