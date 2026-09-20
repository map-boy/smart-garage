import React, { useState } from 'react';
import { useVehicles } from '../hooks/useVehicles';
import { useClients } from '../hooks/useClients';
import { Table, TableRow, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Plus, Search, Car, Trash2, Edit, User } from 'lucide-react';
import { generateId } from '../lib/utils';
import { FUEL_TYPES } from '../lib/constants';
import { Vehicle } from '../types';
import { SyncBadge } from '../components/ui/SyncBadge';
import { VisitsByDate } from '../components/VisitsByDate';

export function VehiclesPage() {
  const { vehicles, addVehicle, updateVehicle, deleteVehicle } = useVehicles();
  const { clients } = useClients();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState<Partial<Vehicle>>({
    plate: '', make: '', model: '', year: 2024, color: '', clientId: '', mileage: 0, fuelType: 'Petrol'
  });

  // Vehicles are created by the reception phone as well as here, and the gate
  // form does not require every descriptive field.
  const needle = searchTerm.toLowerCase();
  const filtered = vehicles.filter(v =>
    (v.plate ?? '').toLowerCase().includes(needle) ||
    (v.make ?? '').toLowerCase().includes(needle) ||
    (v.model ?? '').toLowerCase().includes(needle)
  );

  const handleOpenAdd = () => {
    setSelectedVehicle(null);
    setFormData({ plate: '', make: '', model: '', year: 2024, color: '', clientId: '', mileage: 0, fuelType: 'Petrol' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (v: Vehicle) => {
    setSelectedVehicle(v);
    setFormData(v);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      id: selectedVehicle?.id || generateId(),
      plate: formData.plate || '',
      make: formData.make || '',
      model: formData.model || '',
      year: Number(formData.year) || 0,
      color: formData.color || '',
      clientId: formData.clientId || '',
      mileage: Number(formData.mileage) || 0,
      fuelType: formData.fuelType as any
    };
    
    if (selectedVehicle) {
      updateVehicle(data as Vehicle);
    } else {
      addVehicle(data as Vehicle);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Vehicle Registry</h1>
          <p className="text-sm text-gray-500 font-medium font-mono">Managed Assets: {vehicles.length}</p>
        </div>
        <Button onClick={handleOpenAdd} className="bg-blue-600">
          <Plus className="w-4 h-4 mr-2" /> New Vehicle
        </Button>
      </div>

      <VisitsByDate />


      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Vehicle Information">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Plate Number</label>
              <input 
                type="text" required
                className="w-full p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-hidden"
                value={formData.plate}
                onChange={(e) => setFormData({...formData, plate: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Owner/Client</label>
              <select 
                required
                className="w-full p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-hidden bg-white"
                value={formData.clientId}
                onChange={(e) => setFormData({...formData, clientId: e.target.value})}
              >
                <option value="">Select a client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Make</label>
              <input 
                type="text" required
                className="w-full p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-hidden"
                value={formData.make}
                onChange={(e) => setFormData({...formData, make: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Model</label>
              <input 
                type="text" required
                className="w-full p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-hidden"
                value={formData.model}
                onChange={(e) => setFormData({...formData, model: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Year</label>
              <input 
                type="number" required
                className="w-full p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-hidden"
                value={formData.year}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setFormData({...formData, year: e.target.value === '' ? '' : parseInt(e.target.value)})}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Mileage (km)</label>
              <input 
                type="number" required
                className="w-full p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-hidden"
                value={formData.mileage}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setFormData({...formData, mileage: e.target.value === '' ? '' : parseInt(e.target.value)})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Fuel Type</label>
              <select 
                required
                className="w-full p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-hidden bg-white"
                value={formData.fuelType}
                onChange={(e) => setFormData({...formData, fuelType: e.target.value as any})}
              >
                {FUEL_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Vehicle</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog 
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => selectedVehicle && deleteVehicle(selectedVehicle.id)}
        title="Remove Vehicle"
        message={`Are you sure you want to remove ${selectedVehicle?.plate}? All associated data remains in historical jobs but the link will be lost.`}
      />
    </div>
  );
}

