import { useState } from 'react';
import { 
  Search, Eye, ShieldAlert, BadgeInfo, CalendarClock, CreditCard, Sparkles, AlertCircle
} from 'lucide-react';
import { Client, Vehicle, JobCard, Part, Invoice, ServiceReminder, GarageSettings } from '../types';
import { invoiceSpend } from '../utils/format';
import { formatCurrency, formatDate } from '../utils/format';

interface EntitiesViewProps {
  tab: 'vehicles' | 'customers' | 'jobs' | 'inventory' | 'invoices' | 'reminders';
  settings: GarageSettings;
  clients: Client[];
  vehicles: Vehicle[];
  jobs: JobCard[];
  stock: Part[];
  invoices: Invoice[];
  reminders: ServiceReminder[];
}

export default function EntitiesView({
  tab,
  settings,
  clients,
  vehicles,
  jobs,
  stock,
  invoices,
  reminders
}: EntitiesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedItemDetail, setSelectedItemDetail] = useState<any | null>(null);

  // Reset filters on tab change
  const handleTabChangeReset = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setSelectedItemDetail(null);
  };

  // Helper styles for status labels
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
      case 'Paid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'In Progress':
        return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Waiting Parts':
      case 'Unpaid':
        return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Pending':
        return 'bg-rose-50 text-rose-700 border-rose-100';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-100';
    }
  };

  return (
    <div id="entities-view-root" className="space-y-6 animate-fade-in">
      {/* View Header with Search / Filters */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-display">DATABASE REGISTRY</span>
            <h1 className="text-xl font-black text-gray-900 capitalize tracking-tight mt-1">{tab === 'jobs' ? 'Job Cards' : tab}</h1>
            <p className="text-xs text-gray-500 mt-1">Real-time synchronized data from local workshop stations</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 sm:min-w-[240px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${tab}...`}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 focus:bg-white transition-all font-medium"
              />
            </div>

            {/* Status Dropdowns (where applicable) */}
            {tab === 'jobs' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Waiting Parts">Waiting Parts</option>
                <option value="Completed">Completed</option>
              </select>
            )}

            {tab === 'invoices' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <option value="All">All Invoices</option>
                <option value="Paid">Paid</option>
                <option value="Unpaid">Unpaid</option>
              </select>
            )}

            {tab === 'inventory' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <option value="All">All Levels</option>
                <option value="Low Stock">Low Stock Alert</option>
              </select>
            )}

            {tab === 'reminders' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <option value="All">All Reminders</option>
                <option value="Pending">Active Reminders</option>
                <option value="Done">Completed</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area: Data Table */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {/* Vehicles Table */}
        {tab === 'vehicles' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Plate Number</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Make & Model</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Owner name</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Fuel type</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Mileage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {vehicles
                  .filter(v => {
                    const client = clients.find(c => c.id === v.clientId);
                    const matchSearch = v.plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        v.make.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        v.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        (client?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
                    return matchSearch;
                  })
                  .map(veh => {
                    const client = clients.find(c => c.id === veh.clientId);
                    return (
                      <tr key={veh.id} className="hover:bg-gray-50/40">
                        <td className="px-6 py-4 font-mono font-bold text-gray-800">{veh.plate.toUpperCase()}</td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-800">{veh.make} {veh.model}</p>
                          <p className="text-[10px] text-gray-400">{veh.year} &bull; {veh.color}</p>
                        </td>
                        <td className="px-6 py-4 text-gray-600 font-medium">
                          {client ? (
                            <div>
                              <p className="font-bold">{client.name}</p>
                              <p className="text-[10px] text-gray-400">{client.phone}</p>
                            </div>
                          ) : 'Unknown Owner'}
                        </td>
                        <td className="px-6 py-4 text-gray-600">{veh.fuelType}</td>
                        <td className="px-6 py-4 text-right font-mono font-medium text-gray-800">{veh.mileage?.toLocaleString()} km</td>
                      </tr>
                    );
                  })}
                {vehicles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-400">No vehicles registered in the workshop database</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Customers Table */}
        {tab === 'customers' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Name</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Contact Details</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Associated Vehicles</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Joined Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {clients
                  .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             (c.phone || '').includes(searchQuery) ||
                             (c.email || '').toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(client => {
                    // find matching plates
                    const clientPlates = vehicles
                      .filter(v => v.clientId === client.id)
                      .map(v => v.plate.toUpperCase());

                    return (
                      <tr key={client.id} className="hover:bg-gray-50/40">
                        <td className="px-6 py-4 font-bold text-gray-800">{client.name}</td>
                        <td className="px-6 py-4">
                          <p className="text-gray-600 font-mono font-medium">{client.phone}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{client.email || 'â€”'}</p>
                        </td>
                        <td className="px-6 py-4 text-gray-600 max-w-xs truncate">
                          {clientPlates.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {clientPlates.map((plate, idx) => (
                                <span key={idx} className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold border border-gray-200/50">{plate}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">No vehicles listed</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-500 font-mono">{formatDate(client.createdAt)}</td>
                      </tr>
                    );
                  })}
                {clients.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-gray-400">No client registry matches</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Job Cards Table */}
        {tab === 'jobs' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Job ID</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Vehicle Info</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Technician</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Description</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Estimate Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {jobs
                  .filter(j => {
                    const vehicle = vehicles.find(v => v.id === j.vehicleId);
                    const client = vehicle ? clients.find(c => c.id === vehicle.clientId) : null;
                    const matchesSearch = j.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          (j.technicianName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          (j.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          (vehicle?.plate || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          (client?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
                    const matchesStatus = statusFilter === 'All' || j.status === statusFilter;
                    return matchesSearch && matchesStatus;
                  })
                  .map(job => {
                    const vehicle = vehicles.find(v => v.id === job.vehicleId);
                    const client = vehicle ? clients.find(c => c.id === vehicle.clientId) : null;
                    const estimate = (job.laborCost || 0) + (job.partsUsed?.length || 0) * 800;

                    return (
                      <tr key={job.id} className="hover:bg-gray-50/40">
                        <td className="px-6 py-4 font-mono font-bold text-gray-800">#{job.id?.slice(0, 8).toUpperCase() || 'CARD'}</td>
                        <td className="px-6 py-4">
                          {vehicle ? (
                            <div>
                              <p className="font-bold text-gray-800">{vehicle.plate.toUpperCase()}</p>
                              <p className="text-[10px] text-gray-400">{vehicle.make} {vehicle.model} &bull; {client?.name}</p>
                            </div>
                          ) : <span className="text-gray-400">No Vehicle Linked</span>}
                        </td>
                        <td className="px-6 py-4 text-gray-700 font-medium">{job.technicianName || 'Unassigned'}</td>
                        <td className="px-6 py-4 text-gray-500 max-w-xs truncate">{job.description || 'No comment provided'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${getStatusBadge(job.status)}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-gray-800">{formatCurrency(estimate, settings.currency)}</td>
                      </tr>
                    );
                  })}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-400">No workshop job tickets available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Inventory Table */}
        {tab === 'inventory' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Part Number</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Item Name</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Supplier</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Stock Qty</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Unit Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {stock
                  .filter(item => {
                    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          (item.partNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          (item.supplier || '').toLowerCase().includes(searchQuery.toLowerCase());
                    const matchesLow = statusFilter === 'All' || item.quantity <= item.reorderLevel;
                    return matchesSearch && matchesLow;
                  })
                  .map(item => {
                    const isLow = item.quantity <= item.reorderLevel;
                    return (
                      <tr key={item.id} className={`hover:bg-gray-50/40 ${isLow ? 'bg-rose-50/20' : ''}`}>
                        <td className="px-6 py-4 font-mono font-bold text-gray-800">{item.partNumber || 'â€”'}</td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-800">{item.name}</p>
                          <p className="text-[10px] text-gray-400">Reorder Level: {item.reorderLevel}</p>
                        </td>
                        <td className="px-6 py-4 text-gray-500">{item.supplier || 'â€”'}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`font-mono font-black text-sm ${isLow ? 'text-rose-600' : 'text-gray-800'}`}>{item.quantity}</span>
                            {isLow && (
                              <span className="flex items-center gap-0.5 bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded text-[8px] font-bold border border-rose-100">
                                <AlertCircle className="w-2.5 h-2.5" /> REORDER
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-gray-800">{formatCurrency(item.unitCost, settings.currency)}</td>
                      </tr>
                    );
                  })}
                {stock.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-400">No components tracked in spare warehouse</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Invoices Table */}
        {tab === 'invoices' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Invoice ID</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Client Info</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Issued Date</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {invoices
                  .filter(inv => {
                    const client = clients.find(c => c.id === inv.clientId);
                    const matchesSearch = inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          (client?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
                    const matchesStatus = statusFilter === 'All' || inv.status === statusFilter;
                    return matchesSearch && matchesStatus;
                  })
                  .map(inv => {
                    const client = clients.find(c => c.id === inv.clientId);
                    const totalCost = invoiceSpend(inv);

                    return (
                      <tr key={inv.id} className="hover:bg-gray-50/40">
                        <td className="px-6 py-4 font-mono font-bold text-gray-800">#{inv.id?.slice(0, 8).toUpperCase() || 'BILL'}</td>
                        <td className="px-6 py-4">
                          {client ? (
                            <div>
                              <p className="font-bold text-gray-800">{client.name}</p>
                              <p className="text-[10px] text-gray-400">{client.phone}</p>
                            </div>
                          ) : 'Walk-in Client'}
                        </td>
                        <td className="px-6 py-4 text-gray-500 font-mono">{formatDate(inv.issuedAt)}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${getStatusBadge(inv.status)}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-gray-800">{formatCurrency(totalCost, settings.currency)}</td>
                      </tr>
                    );
                  })}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-400">No bills generated</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Reminders Table */}
        {tab === 'reminders' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Reminder Type</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Vehicle</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Alert Notes</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">State</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {reminders
                  .filter(rem => {
                    const vehicle = vehicles.find(v => v.id === rem.vehicleId);
                    const matchesSearch = rem.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          (rem.notes || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          (vehicle?.plate || '').toLowerCase().includes(searchQuery.toLowerCase());
                    const matchesStatus = statusFilter === 'All' || 
                                         (statusFilter === 'Done' && rem.isDone) || 
                                         (statusFilter === 'Pending' && !rem.isDone);
                    return matchesSearch && matchesStatus;
                  })
                  .map(rem => {
                    const vehicle = vehicles.find(v => v.id === rem.vehicleId);
                    const isOver = !rem.isDone && (new Date(rem.dueDate).getTime() < new Date().getTime());

                    return (
                      <tr key={rem.id} className="hover:bg-gray-50/40">
                        <td className="px-6 py-4 font-bold text-gray-800">{rem.type}</td>
                        <td className="px-6 py-4 font-mono">
                          {vehicle ? (
                            <div>
                              <p className="font-bold text-gray-800">{vehicle.plate.toUpperCase()}</p>
                              <p className="text-[10px] text-gray-400">{vehicle.make} {vehicle.model}</p>
                            </div>
                          ) : 'â€”'}
                        </td>
                        <td className="px-6 py-4 text-gray-500 max-w-xs truncate italic">
                          {rem.notes ? `â€œ${rem.notes}â€` : 'No instruction'}
                        </td>
                        <td className="px-6 py-4">
                          {rem.isDone ? (
                            <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border border-emerald-100">ARCHIVED</span>
                          ) : (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${isOver ? 'bg-rose-50 text-rose-700 border-rose-100 animate-pulse' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                              {isOver ? 'OVERDUE' : 'ACTIVE'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-500 font-mono">{formatDate(rem.dueDate)}</td>
                      </tr>
                    );
                  })}
                {reminders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-400">No scheduled service events registered</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
