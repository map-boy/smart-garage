import { useGarageCollection } from './useGarageCollection';

export interface Visit {
  id: string;
  name?: string;
  phone?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  location?: string;
  issue?: string;
  visitDate?: string;
  createdAt?: string;
  source?: string;
}

/** Live feed of what the reception desk / phone records at the gate. */
export function useVisits() {
  const { items, error } = useGarageCollection<Visit>('visits');
  return { visits: items, error };
}
