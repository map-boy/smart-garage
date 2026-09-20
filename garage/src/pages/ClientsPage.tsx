import React, { useMemo, useState } from 'react';
import { useClients } from '../hooks/useClients';
import { Table, TableRow, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Plus, Search, Mail, Phone, Trash2, Edit } from 'lucide-react';
import { generateId } from '../lib/utils';
import { Client } from '../types';
import { SyncBadge } from '../components/ui/SyncBadge';
import { useVisits, type Visit } from '../hooks/useVisits';
import { useGarageCollection } from '../hooks/useGarageCollection';
import type { Vehicle } from '../types/vehicle.types';

export function ClientsPage() {
  const { clients, addClient, updateClient, deleteClient, error } = useClients();
  const { visits } = useVisits();
  const { items: vehicles } = useGarageCollection<Vehicle>('vehicles');
  const [newestFirst, setNewestFirst] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<Partial<Client>>({ name: '', email: '', phone: '' });

  // Defensive on every field: these records are also written by the phone
  // apps and by older builds, and one client with no email used to throw
  // inside this filter and blank the entire page rather than hide a row.
  // One row per client, joined with what the reception desk recorded.
  // Visits live in their own collection, so the vehicle and the last visit
  // date are worked out here, at read time. Nothing is written back.
  const rows = useMemo(() => {
    type VisitRow = Visit & { clientId?: string | null };
    const key = (s?: string) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const allVisits = visits as VisitRow[];
    const list = clients.map((client) => {
      const own = client as Client & { vehiclePlate?: string; vehicleModel?: string };
      const ownKey = key(own.vehiclePlate);
      const mine = allVisits
        .filter((v) => v.clientId === client.id || (ownKey !== '' && key(v.vehiclePlate) === ownKey))
        .sort((a, b) => (b.visitDate ?? '').localeCompare(a.visitDate ?? ''));
      const cars = new Map<string, { plate: string; model: string }>();
      const addCar = (plate?: string, model?: string) => {
        const k = key(plate);
        if (!k) return;
        const clean = (model ?? '').trim();
        const seen = cars.get(k);
        if (!seen) cars.set(k, { plate: (plate ?? '').trim(), model: clean });
        else if (!seen.model && clean) seen.model = clean;
      };
      mine.forEach((v) => addCar(v.vehiclePlate, v.vehicleModel));
      vehicles.filter((v) => v.clientId === client.id).forEach((v) => addCar(v.plate, `${v.make ?? ''} ${v.model ?? ''}`));
      addCar(own.vehiclePlate, own.vehicleModel);
      const first = Array.from(cars.values())[0];
      return {
        client,
        plate: first?.plate ?? '',
        model: first?.model ?? '',
        extra: Math.max(cars.size - 1, 0),
        lastVisit: mine[0]?.visitDate || (client.createdAt ?? '').slice(0, 10),
      };
    });
    const byName = (a: { client: Client }, b: { client: Client }) => (a.client.name ?? '').localeCompare(b.client.name ?? '');
    list.sort((a, b) => {
      if (!a.lastVisit && !b.lastVisit) return byName(a, b);
      if (!a.lastVisit) return 1;
      if (!b.lastVisit) return -1;
      const diff = a.lastVisit.localeCompare(b.lastVisit);
      return (newestFirst ? -diff : diff) || byName(a, b);
    });
    return list;
  }, [clients, visits, vehicles, newestFirst]);

  const needle = searchTerm.toLowerCase();
  const filtered = rows.filter(({ client: c, plate, model }) =>
    (c.name ?? '').toLowerCase().includes(needle) ||
    (c.email ?? '').toLowerCase().includes(needle) ||
    (c.phone ?? '').includes(searchTerm) ||
    plate.toLowerCase().includes(needle) ||
    model.toLowerCase().includes(needle)
  );

  const handleOpenAdd = () => {
    setSelectedClient(null);
    setFormData({ name: '', email: '', phone: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (client: Client) => {
    setSelectedClient(client);
    setFormData(client);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClient) {
      updateClient({ ...selectedClient, ...formData } as Client);
    } else {
      addClient({
        id: generateId(),
        name: formData.name || '',
        email: formData.email || '',
        phone: formData.phone || '',
        vehicleIds: [],
        createdAt: new Date().toISOString()
      });
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Client Management</h1>
          <p className="text-sm text-gray-500 font-medium font-mono">Total Databases: {clients.length}</p>
        </div>
        <Button onClick={handleOpenAdd} className="bg-blue-600 hover:bg-blue-700 shadow-blue-500/20">
          <Plus className="w-4 h-4 mr-2" /> New Client
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50">
          <div className="flex items-center bg-gray-50 rounded-xl px-4 py-2 max-w-sm">
            <Search className="w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Filter by name, email or phone..." 
              className="bg-transparent border-none focus:ring-0 text-sm w-full ml-3 outline-hidden"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="px-4 py-2 border-b border-gray-50 flex items-center justify-between text-xs text-gray-500">
          <span>Sorted by last visit, {newestFirst ? 'newest first' : 'oldest first'}</span>
          <button type="button" onClick={() => setNewestFirst(v => !v)} className="font-bold text-blue-600 hover:underline">
            {newestFirst ? 'Show oldest first' : 'Show newest first'}
          </button>
        </div>
        <Table headers={['Client / Vehicle', 'Email', 'Phone', 'Last visit', 'Actions']}>
          {filtered.map(({ client, plate, model, lastVisit, extra }) => (
            <TableRow key={client.id}>
              <TableCell className="font-bold text-gray-900">
                {client.name} <SyncBadge pending={client._pending} />
                <div className="text-[11px] font-medium text-gray-500 mt-0.5">
                  {plate
                    ? `${plate}${model ? ' - ' + model : ''}${extra > 0 ? ' (+' + extra + ' more)' : ''}`
                    : <span className="font-bold text-amber-600">No vehicle recorded</span>}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  {client.email}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  {client.phone}
                </div>
              </TableCell>
              <TableCell className="text-xs font-mono text-gray-500">
                {lastVisit ? lastVisit.slice(0, 10) : '-'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(client)}>
                    <Edit className="w-4 h-4 text-gray-400" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setSelectedClient(client); setIsDeleteOpen(true); }}>
                    <Trash2 className="w-4 h-4 text-rose-400" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-gray-400 italic">No clients found matching your search.</td>
            </tr>
          )}
        </Table>
      </div>

      {/* Add/Edit Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={selectedClient ? 'Edit Client' : 'Add New Client'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Full Name</label>
            <input 
              type="text" required
              className="w-full p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-hidden"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Email Address</label>
              <input 
                type="email" required
                className="w-full p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-hidden"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Phone Number</label>
              <input 
                type="tel" required
                className="w-full p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-hidden"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Save Changes</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog 
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => selectedClient && deleteClient(selectedClient.id)}
        title="Delete Client"
        message={`Are you sure you want to delete ${selectedClient?.name}? This action cannot be undone.`}
      />
    </div>
  );
}
