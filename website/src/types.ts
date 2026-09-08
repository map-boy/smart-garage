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

/** Website content the admin edits from a panel, never from code. */
export interface SiteContent {
  brand: { name: string; tagline: string; logoUrl?: string };
  topBar: { address: string; emergencyPhone: string; hours: string; promo?: string };
  hero: { eyebrow: string; titleLead: string; titleAccent: string; titleTail: string; titleAccent2: string; body: string; ctaLabel: string; backgroundUrl: string; backgroundUrls?: string[] };
  highlights: { title: string; body: string }[];
  about: { eyebrow: string; title: string; body: string; satisfactionPct: number; badges: string[]; phone: string; imageUrl: string };
  services: { eyebrow: string; titleLead: string; titleAccent: string; intro: string; items: { title: string; body: string; imageUrl: string; icon: string }[] };
  contact: { headline: string; phone: string; email: string; address: string };
  updatedAt?: string;
}

