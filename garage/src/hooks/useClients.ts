import { Client } from '../types';
import { useGarageCollection } from './useGarageCollection';

export function useClients() {
  const { items, save, remove, error } = useGarageCollection<Client>('clients');

  return {
    clients: items,
    /** Set when a save or delete was refused, so the screen can say so. */
    error,
    addClient: (c: Client) => save(c),
    updateClient: (c: Client) => save(c),
    deleteClient: (id: string) => remove(id),
    refresh: () => {}, // no-op: onSnapshot keeps data live automatically
  };
}
