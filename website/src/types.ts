/**
 * Types shared by every app in this workspace.
 *
 * The reception phone app writes arrivals, the admin desktop reads and acts on
 * them, and the website only reads published content. Keeping the shapes in
 * one place is what stops the three from drifting apart - a field renamed in
 * one app and not the others is the classic way a check-in silently stops
 * showing up on the admin screen.
 */

/** Where a vehicle is in its visit. Set by reception, advanced by admin. */
export type ArrivalStatus =
  | 'waiting'      // logged at the gate, nobody has looked at it yet
  | 'acknowledged' // admin has seen the notification
  | 'in_service'   // a job card exists for it
  | 'closed';      // left the premises

export interface Arrival {
  id: string;
  garageId: string;

  /** What reception can see from the gate, without a system lookup. */
  plate: string;
  make?: string;
  model?: string;
  colour?: string;

  driverName?: string;
  driverPhone?: string;
  reason: string;

  /** Set when the plate matches a vehicle already on file. */
  vehicleId?: string;
  clientId?: string;

  status: ArrivalStatus;
  /** Server timestamp. Never trust a phone's clock for ordering. */
  arrivedAt: unknown;
  acknowledgedAt?: unknown;
  acknowledgedBy?: string;

  /** Who logged it, for accountability at the gate. */
  loggedBy: string;
  loggedByName?: string;

  /** Set once a job card is opened from this arrival. */
  jobId?: string;
  notes?: string;
}

export const ARRIVAL_STATUS_LABEL: Record<ArrivalStatus, string> = {
  waiting: 'Waiting',
  acknowledged: 'Seen',
  in_service: 'In service',
  closed: 'Closed',
};

// The site-content shapes moved to shared/, where the website that renders
// them and the admin app that edits them can both see one definition.
// Re-exported here so every existing import in this app keeps working.
export type {
  ServiceItem,
  SiteContent,
  SiteSectionKind,
  SiteSection,
  EnquiryInput,
} from "../../shared/src/site";
