/**
 * Every collection the technician console can reach, in one list.
 *
 * The console is the one screen with no per-garage scoping, so the garage id
 * is a parameter here rather than something read from the signed-in profile.
 * Anything not in this list is not reachable from the console - which is the
 * point: a typo in a path should fail to resolve, not silently create a new
 * top-level collection nobody knows about.
 */

export type Scope = 'root' | 'garage';

export interface CollectionSpec {
  id: string;
  label: string;
  scope: Scope;
  /** Path template. `{garageId}` is filled in for garage-scoped entries. */
  path: string;
  /** What this holds, shown above the list so a stranger can orient. */
  blurb: string;
  /** Field to show as the row title when present, in order of preference. */
  titleFields: string[];
  /** Newest-first ordering where the collection has an obvious clock. */
  orderBy?: string;
  /** Collections that grow without bound get a smaller default page. */
  pageSize?: number;
}

export const COLLECTIONS: CollectionSpec[] = [
  {
    id: 'garages',
    label: 'Garages',
    scope: 'root',
    path: 'garages',
    blurb: 'One document per garage. Settings, branding and quota live here.',
    titleFields: ['garageName', 'name', 'id'],
  },
  {
    id: 'users',
    label: 'Users',
    scope: 'root',
    path: 'users',
    blurb:
      'The profile firestore.rules reads to answer who you are. A signed-in ' +
      'account without a document here is refused by every privileged rule.',
    titleFields: ['email', 'displayName', 'role'],
  },
  {
    id: 'pairing',
    label: 'Pairing codes',
    scope: 'root',
    path: 'pairing',
    blurb:
      'Unredeemed phone pairing codes. A code disappears the moment a phone ' +
      'redeems it, so anything sitting here is still live until it expires.',
    titleFields: ['role', 'garageId'],
  },
  {
    id: 'site',
    label: 'Website content',
    scope: 'root',
    path: 'site',
    blurb:
      'What the public website renders. The document named "content" is the ' +
      'live one; editing it changes the site with no deploy.',
    titleFields: ['id'],
  },
  {
    id: 'diagnostics',
    label: 'Crash reports',
    scope: 'root',
    path: 'diagnostics',
    blurb:
      'Uncaught errors from every install - desktop and both phone apps. ' +
      'This is the self-hosted replacement for a crash-reporting service.',
    titleFields: ['app', 'message'],
    orderBy: 'atLocal',
    pageSize: 50,
  },
  {
    id: 'technicianActions',
    label: 'Technician audit log',
    scope: 'root',
    path: 'technicianActions',
    blurb: 'Every change made from this console, with the value it replaced.',
    titleFields: ['op', 'path'],
    orderBy: 'atLocal',
    pageSize: 50,
  },

  {
    id: 'devices',
    label: 'Paired phones',
    scope: 'garage',
    path: 'garages/{garageId}/devices',
    blurb:
      'One document per paired phone. This document is the phone credential - ' +
      'deleting it unpairs that phone at the next write it attempts.',
    titleFields: ['staffName', 'role'],
  },
  {
    id: 'stock',
    label: 'Stock',
    scope: 'garage',
    path: 'garages/{garageId}/stock',
    blurb:
      'The shelf. Quantity is maintained by atomic increments everywhere ' +
      'else; setting it here overwrites whatever the shop floor last counted.',
    titleFields: ['name', 'partNumber'],
  },
  {
    id: 'stockMovements',
    label: 'Stock ledger',
    scope: 'garage',
    path: 'garages/{garageId}/stockMovements',
    blurb:
      'Append-only record of every stock change. Rules forbid edits and ' +
      'deletes here for everyone, so entries are read-only even in here.',
    titleFields: ['partName', 'reason'],
    orderBy: 'atLocal',
    pageSize: 50,
  },
  {
    id: 'arrivals',
    label: 'Arrivals',
    scope: 'garage',
    path: 'garages/{garageId}/arrivals',
    blurb: 'Vehicles logged at the gate by the reception phone.',
    titleFields: ['plate', 'driverName'],
    orderBy: 'arrivedAtLocal',
  },
  {
    id: 'clients',
    label: 'Clients',
    scope: 'garage',
    path: 'garages/{garageId}/clients',
    blurb: 'Customer records.',
    titleFields: ['name', 'phone'],
  },
  {
    id: 'vehicles',
    label: 'Vehicles',
    scope: 'garage',
    path: 'garages/{garageId}/vehicles',
    blurb: 'Vehicles on file, keyed to a client.',
    titleFields: ['plate', 'makeModel'],
  },
  {
    id: 'jobs',
    label: 'Job cards',
    scope: 'garage',
    path: 'garages/{garageId}/jobs',
    blurb: 'Work opened against a vehicle.',
    titleFields: ['description', 'status'],
  },
  {
    id: 'invoices',
    label: 'Invoices',
    scope: 'garage',
    path: 'garages/{garageId}/invoices',
    blurb: 'Billing documents.',
    titleFields: ['invoiceNumber', 'clientName'],
  },
  {
    id: 'reminders',
    label: 'Reminders',
    scope: 'garage',
    path: 'garages/{garageId}/reminders',
    blurb: 'Scheduled follow-ups.',
    titleFields: ['title', 'notes'],
  },
  {
    id: 'enquiries',
    label: 'Website enquiries',
    scope: 'garage',
    path: 'garages/{garageId}/enquiries',
    blurb: 'Questions submitted through the public website request panel.',
    titleFields: ['name', 'service'],
    orderBy: 'createdAtLocal',
  },
  {
    id: 'archives',
    label: 'Month archives',
    scope: 'garage',
    path: 'garages/{garageId}/archives',
    blurb:
      'Closed months. Each document has its own subcollections holding that ' +
      "month's records; older archives keep them in chunked `records`.",
    titleFields: ['month', 'closedAtLocal'],
  },
];

/** Collections whose rules forbid writes, so the console offers read only. */
export const READ_ONLY_COLLECTIONS = new Set(['stockMovements']);

export function resolvePath(spec: CollectionSpec, garageId: string): string {
  return spec.path.replace('{garageId}', garageId);
}

export function findSpec(id: string): CollectionSpec | undefined {
  return COLLECTIONS.find((c) => c.id === id);
}

/** Best-effort human label for a row, falling back to the document id. */
export function rowTitle(
  spec: CollectionSpec,
  id: string,
  data: Record<string, unknown>
): string {
  for (const field of spec.titleFields) {
    const value = data[field];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return id;
}
