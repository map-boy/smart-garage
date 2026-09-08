export interface GarageSettings {
  id: string;
  garageName: string;
  address: string;
  phone: string;
  currency: string;       // e.g. "RWF"
  taxRate: number;
  cameraStreamUrl: string;
  cameraLabel: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehicleIds: string[];
  createdAt: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  color: string;
  clientId: string;
  mileage: number;
  fuelType: 'Petrol' | 'Diesel' | 'Electric' | 'Hybrid';
}

export type JobStatus = 'Pending' | 'In Progress' | 'Waiting Parts' | 'Completed';

export interface JobCard {
  id: string;
  vehicleId: string;
  technicianName: string;
  description: string;
  status: JobStatus;
  partsUsed: { partId: string; quantity: number }[];
  laborCost: number;
  technicianPaidMonthly?: boolean;
  freeServices?: { description: string; cost: number }[];
  startedAt: string;
  completedAt?: string;
}

export interface Part {
  id: string;
  name: string;
  partNumber: string;
  quantity: number;
  reorderLevel: number;
  unitCost: number;
  supplier: string;
}

export type PaymentStatus = 'Paid' | 'Unpaid';

export interface Invoice {
  id: string;
  jobId: string;
  clientId: string;
  lineItems: { description: string; qty: number; unitCost: number; isFree?: boolean }[];
  laborCost: number;
  taxRate?: number;
  /** What the client was billed on the EBM invoice. This is the revenue. */
  amountCharged?: number;
  status: PaymentStatus;
  issuedAt: string;
}

export type ReminderType = 'Oil Change' | 'Full Service' | 'Tyre Rotation' | 'Custom';

export interface ServiceReminder {
  id: string;
  vehicleId: string;
  type: ReminderType;
  dueDate: string;
  notes: string;
  isDone: boolean;
}

export interface UserProfile {
  role: string;
  garageId: string;
  displayName: string;
}

/**
 * A month-close snapshot.
 *
 * The manifest carries only counts. The archived jobs and invoices live in
 * `archives/{id}/records/*` chunks and are fetched on demand â€” an archive
 * used to embed every record inline, which both hit Firestore's 1 MiB
 * document cap and forced the dashboard to download years of history just to
 * render the list of month names.
 */
export interface ArchiveRecord {
  id: string;
  archivedAt: string;
  monthLabel: string;
  jobCount: number;
  invoiceCount: number;
  chunkCount?: number;
  complete?: boolean;
  /** Present only on archives written before records were chunked out. */
  jobs?: JobCard[];
  invoices?: Invoice[];
}

/** One chunk of archived records. */
export interface ArchiveChunk {
  kind: 'jobs' | 'invoices';
  index: number;
  rows: JobCard[] | Invoice[];
}