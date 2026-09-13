/**
 * Types every surface agrees on.
 *
 * The desktop app, the admin dashboard, the website and both phone apps all
 * read and write the same Firestore documents. Keeping the shapes here means a
 * field renamed in one place is a compile error in the others rather than a
 * silently empty column on the boss's screen.
 */

// ---------------------------------------------------------------- stock ----

export interface Part {
  id: string;
  name: string;
  partNumber: string;
  /**
   * Never written by reading this value and adding to it. Every change goes
   * through an atomic increment, so two people drawing the same part at the
   * same time - or while offline - both land instead of one overwriting the
   * other. It may go negative: that means more was taken than the books knew
   * about, which is a recount, not an error to hide.
   */
  quantity: number;
  reorderLevel: number;
  unitCost: number;
  supplier: string;
  updatedAt?: string;
}

export type MovementReason =
  | 'issued_to_vehicle'
  | 'received'
  | 'count_adjustment'
  | 'returned'
  | 'written_off';

export const MOVEMENT_REASON_LABEL: Record<MovementReason, string> = {
  issued_to_vehicle: 'Issued to vehicle',
  received: 'Received into store',
  count_adjustment: 'Stock count adjustment',
  returned: 'Returned to store',
  written_off: 'Written off',
};

/**
 * One line in the stock ledger. Append-only: a movement is what happened, and
 * what happened does not change. Correcting a mistake means another movement,
 * so the trail stays honest.
 */
export interface StockMovement {
  id: string;
  partId: string;
  /** Copied, not looked up. A part renamed later must not rewrite history. */
  partName: string;
  partNumber: string;
  /** Negative leaves the store, positive comes in. */
  delta: number;
  /** Stock after this movement, as the writing device understood it. */
  balanceAfter: number;
  reason: MovementReason;
  plate?: string;
  vehicleId?: string;
  arrivalId?: string;
  jobId?: string;
  note?: string;
  byName: string;
  byRole: DeviceRole;
  at?: unknown;
  atLocal: string;
}

// ------------------------------------------------------------- arrivals ----

export type ArrivalStatus = 'waiting' | 'acknowledged' | 'in_service' | 'closed';

export const ARRIVAL_STATUS_LABEL: Record<ArrivalStatus, string> = {
  waiting: 'Waiting',
  acknowledged: 'Seen by admin',
  in_service: 'In service',
  closed: 'Closed',
};

/** A part the receptionist already took out of the store for this vehicle. */
export interface ArrivalPart {
  partId: string;
  partName: string;
  qty: number;
  unitCost: number;
}

export interface Arrival {
  id: string;
  plate: string;
  plateKey?: string;
  make?: string;
  colour?: string;
  driverName?: string;
  driverPhone?: string;
  /** What the client came in asking for, in their words. */
  requestedWork: string;
  notes?: string;
  partsUsed?: ArrivalPart[];
  vehicleId?: string;
  clientId?: string;
  isNewClient?: boolean;
  status: ArrivalStatus;
  arrivedAt?: unknown;
  loggedByName?: string;
}

// -------------------------------------------------------------- devices ----

export type DeviceRole = 'reception' | 'stock';

export const DEVICE_ROLE_LABEL: Record<DeviceRole, string> = {
  reception: 'Reception',
  stock: 'Stock manager',
};

/**
 * A phone paired to a garage.
 *
 * There is no password on the phone apps by choice. Identity is the pairing:
 * the boss generates a short code, the phone redeems it once, and from then on
 * the device's own anonymous account is what the rules check. The staff name is
 * a label for the audit trail, not a credential.
 */
export interface Device {
  id: string;
  role: DeviceRole;
  staffName: string;
  garageId: string;
  pairedAt?: unknown;
  lastSeenAt?: unknown;
  appVersion?: string;
}

/** A one-shot pairing code. Unguessable, short-lived, deleted once redeemed. */
export interface PairingCode {
  code: string;
  garageId: string;
  role: DeviceRole;
  createdAt?: unknown;
  expiresAtMs: number;
}

// ------------------------------------------------------------ enquiries ----

export type EnquiryStatus = 'new' | 'answered' | 'closed';

export const ENQUIRY_STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: 'New',
  answered: 'Answered',
  closed: 'Closed',
};

/** A question or booking request sent from the public website. */
export interface Enquiry {
  id: string;
  name: string;
  phone: string;
  email?: string;
  vehicle?: string;
  service?: string;
  message: string;
  status: EnquiryStatus;
  source: 'website';
  createdAt?: unknown;
  createdAtLocal: string;
  answeredNote?: string;
}
