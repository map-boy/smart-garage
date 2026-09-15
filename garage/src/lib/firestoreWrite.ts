/**
 * Telling apart the three things a Firestore write can do.
 *
 * With a persistent local cache a write promise resolves only once the server
 * acknowledges it. That gives two traps:
 *
 *   - offline, the promise never settles at all, so `await` hangs forever;
 *   - refused, the promise rejects *and* Firestore rolls the record back out
 *     of the local cache, so it vanishes from the screen with no explanation.
 *
 * The second one is why a saved record can appear for a moment and then
 * silently disappear. Code that swallows the rejection turns a permissions
 * fault into "it just did not save", which is the hardest kind of bug to
 * report and the easiest to blame on the person using it.
 */

export type Settled = 'confirmed' | 'queued' | 'refused';

export interface WriteOutcome {
  state: Settled;
  /** Set when the write was refused; the Firestore error code. */
  code?: string;
  /** Something a person can act on, for the states that need saying. */
  message?: string;
}

const DEFAULT_WAIT_MS = 6_000;

/**
 * Waits a short while for the server, then reports what is known.
 *
 * The underlying promise keeps running after the wait expires - the write is
 * still queued and will still land. Only the waiting stops, so the interface
 * stays responsive on a bad line.
 */
export function settleWrite(
  write: Promise<unknown>,
  ms: number = DEFAULT_WAIT_MS
): Promise<WriteOutcome> {
  // A rejection after the race has already resolved would otherwise surface as
  // an unhandled rejection, so it is caught here as well as raced.
  const watched: Promise<WriteOutcome> = write.then(
    () => ({ state: 'confirmed' as const }),
    (e: unknown) => {
      const code = (e as { code?: string })?.code ?? '';
      return {
        state: 'refused' as const,
        code,
        message:
          code === 'permission-denied'
            ? 'The database refused this change, so it was not saved. This is a ' +
              'permissions problem, not a connection one - waiting will not fix it.'
            : (e as Error)?.message || 'The change could not be saved.',
      };
    }
  );

  return Promise.race([
    watched,
    new Promise<WriteOutcome>((resolve) =>
      setTimeout(
        () =>
          resolve({
            state: 'queued',
            message:
              'Saved on this computer but not confirmed by the server yet. It ' +
              'uploads by itself when the connection is back.',
          }),
        ms
      )
    ),
  ]);
}
