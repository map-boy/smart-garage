export type ArrivalStatus = "waiting" | "acknowledged" | "in_service" | "closed";

export interface Arrival {
  id: string;
  plate: string;
  make?: string;
  model?: string;
  colour?: string;
  driverName?: string;
  driverPhone?: string;
  /**
   * What the client asked for. The Android app writes requestedWork; older
   * rows written by this PWA used `reason`. Both are read so a day's history
   * does not go blank the moment the phones take over.
   */
  requestedWork?: string;
  reason?: string;
  vehicleId?: string;
  clientId?: string;
  status: ArrivalStatus;
  arrivedAt?: { toDate?: () => Date } | null;
  loggedBy: string;
  loggedByName?: string;
  notes?: string;
}

export const STATUS_LABEL: Record<ArrivalStatus, string> = {
  waiting: "Waiting",
  acknowledged: "Seen by admin",
  in_service: "In service",
  closed: "Closed",
};