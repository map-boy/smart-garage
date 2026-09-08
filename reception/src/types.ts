export type ArrivalStatus = "waiting" | "acknowledged" | "in_service" | "closed";

export interface Arrival {
  id: string;
  plate: string;
  make?: string;
  model?: string;
  colour?: string;
  driverName?: string;
  driverPhone?: string;
  reason: string;
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