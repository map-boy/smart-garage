import { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, Wrench, AlertTriangle, FileText, Clock, ChevronDown, ChevronUp, User, Car, Calendar, Phone, Info, Mail
} from 'lucide-react';
import { Client, Vehicle, JobCard, Part, Invoice, ServiceReminder, GarageSettings } from '../types';
import { invoiceSpend } from '../utils/format';
import { formatCurrency, formatDate } from '../utils/format';

interface DashboardOverviewProps {
  settings: GarageSettings;
  clients: Client[];
  vehicles: Vehicle[];
  jobs: JobCard[];
  stock: Part[];
  invoices: Invoice[];
  reminders: ServiceReminder[];
}

export default function DashboardOverview({
  settings,
  clients,
  vehicles,
  jobs,
  stock,
  invoices,
  reminders
}: DashboardOverviewProps) {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // 1. Report calculations (strictly matching the guidelines)
  const getMonthlyRevenue = () => {
    const paidInvoices = invoices.filter(inv => inv.status === 'Paid');
    const groups: { [key: string]: number } = {};

    paidInvoices.forEach(inv => {
      const d = new Date(inv.issuedAt);
      if (isNaN(d.getTime())) return;
      const month = d.toLocaleString('en-US', { month: 'short' });
      const yearStr = d.getFullYear().toString().slice(-2);
      const key = `${month} '${yearStr}`; // e.g. "Jul '26"

      // calculate cost: (qty * unitCost) + labor
      const invoiceTotal = invoiceSpend(inv);
      groups[key] = (groups[key] || 0) + invoiceTotal;
    });

    const uniqueMonths = Array.from(new Set(paidInvoices.map(inv => {
      const d = new Date(inv.issuedAt);
      if (isNaN(d.getTime())) return null;
      return {
        key: `${d.toLocaleString('en-US', { month: 'short' })} '${d.getFullYear().toString().slice(-2)}`,
        time: new Date(d.getFullYear(), d.getMonth(), 1).getTime()
      };
    }).filter(Boolean) as { key: string; time: number }[]));

    uniqueMonths.sort((a, b) => a.time - b.time);

    return uniqueMonths.map(m => ({
      name: m.key,
      value: groups[m.key] || 0
    }));
  };

  const monthlyRevenue = getMonthlyRevenue();
  const currentMonthRevenue = monthlyRevenue.length > 0 ? monthlyRevenue[monthlyRevenue.length - 1].value : 0;

  // Revenue change label calculations
  let revenueChangeLabel = "â€”";
  if (monthlyRevenue.length >= 2) {
    const prevVal = monthlyRevenue[monthlyRevenue.length - 2].value;
    const currentVal = monthlyRevenue[monthlyRevenue.length - 1].value;
    if (prevVal > 0) {
      const pct = ((currentVal - prevVal) / prevVal) * 100;
      revenueChangeLabel = `${pct >= 0 ? 'â–²' : 'â–¼'} ${Math.abs(pct).toFixed(0)}% vs last month`;
    } else {
      revenueChangeLabel = "â–² 100% vs last month";
    }
  } else if (monthlyRevenue.length === 1) {
    revenueChangeLabel = "Initial baseline month";
  }

  // Dashboard-specific derived values
  const activeJobs = jobs.filter(j => j.status !== 'Completed');
  const activeJobsCount = activeJobs.length;
  
  const activeTechnicians = new Set(
    activeJobs.map(j => j.technicianName).filter(Boolean)
  ).size;

  const unpaidInvoicesCount = invoices.filter(inv => inv.status === 'Unpaid').length;
  const lowStock = stock.filter(item => item.quantity <= item.reorderLevel);
  const lowStockCount = lowStock.length;

  const completedJobs = jobs.filter(j => j.status === 'Completed' && j.completedAt && j.startedAt);
  const completedJobsCount = completedJobs.length;
  
  let avgTurnaroundHours = 0;
  if (completedJobsCount > 0) {
    const totalHours = completedJobs.reduce((sum, j) => {
      const hours = (new Date(j.completedAt!).getTime() - new Date(j.startedAt).getTime()) / (1000 * 60 * 60);
      return sum + (hours > 0 ? hours : 0);
    }, 0);
    avgTurnaroundHours = totalHours / completedJobsCount;
  }

  // Pipeline Data - last 5 active/recently updated jobs
  const pipelineJobs = [...jobs]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 5);

  // Reminders - next 3 undone, sorted by dueDate
  const upcomingReminders = reminders
    .filter(r => !r.isDone)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 3);

  const isOverdue = (dueDateStr: string) => {
    return new Date(dueDateStr).getTime() < new Date().getTime();
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'In Progress': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Waiting Parts': return 'bg-amber-50 text-amber-700 border-amber-100';
      default: return 'bg-gray-50 text-gray-700 border-gray-100';
    }
  };

  return (
    <div id="overview-dashboard-root" className="space-y-8 animate-fade-in">
      {/* Upper Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 font-display">MANAGEMENT PANEL</span>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-1">{settings.garageName || "Garage Control Center"}</h1>
          <p className="text-xs text-gray-500 mt-1 font-mono">{settings.address || "Live Stream Active"} &bull; {settings.phone}</p>
        </div>
        <div className="bg-gray-100/80 rounded-xl px-4 py-2 border border-gray-200/50 flex items-center gap-2 text-xs text-gray-500 font-mono">
          <Clock className="w-4 h-4 text-gray-400" />
          <span>UTC Realtime Synced</span>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Revenue */}
        <div id="stat-card-revenue" className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Revenue (MTD)</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">{formatCurrency(currentMonthRevenue, settings.currency)}</h3>
            <p className="text-xs mt-1 text-emerald-600 font-medium font-mono">{revenueChangeLabel}</p>
          </div>
        </div>

        {/* Card 2: Active Jobs */}
        <div id="stat-card-jobs" className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Active Pipeline</span>
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">{activeJobsCount} Active</h3>
            <p className="text-xs mt-1 text-gray-500 font-mono">{activeTechnicians} Technicians logged</p>
          </div>
        </div>

        {/* Card 3: Stock Alerts */}
        <div id="stat-card-stock" className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Inventory Status</span>
            <div className={`p-2 rounded-xl ${lowStockCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-gray-50 text-gray-400'}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">{lowStockCount} Low Items</h3>
            <p className="text-xs mt-1 text-gray-500 font-mono">
              {lowStockCount > 0 ? `${lowStockCount} items require reordering` : "All levels healthy"}
            </p>
          </div>
        </div>

        {/* Card 4: Pending Invoices */}
        <div id="stat-card-invoices" className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Unpaid Invoices</span>
            <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">{unpaidInvoicesCount} Pending</h3>
            <p className="text-xs mt-1 text-gray-500 font-mono">
              {formatCurrency(
                invoices.filter(inv => inv.status === 'Unpaid').reduce((acc, inv) => {
                  return acc + invoiceSpend(inv);
                }, 0),
                settings.currency
              )} total outstanding
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Revenue Trend & Reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend Chart */}
        <div id="revenue-trend-container" className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">REALTIME GRAPH</span>
              <h2 className="text-base font-bold text-gray-900">Revenue Stream (MTD Trend)</h2>
            </div>
            <div className="px-3 py-1 bg-gray-50 border border-gray-100 rounded-lg text-[10px] font-mono text-gray-500">
              Last {monthlyRevenue.length} Months
            </div>
          </div>
          <div className="h-64">
            {monthlyRevenue.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">No revenue data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRevenue.slice(-6)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${settings.currency || 'RWF'} ${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(value: number) => [formatCurrency(value, settings.currency), 'Revenue']}
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', fontSize: '11px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                  />
                  <Bar dataKey="value" fill="#fbbf24" radius={[6, 6, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Reminders & Operations Insights */}
        <div className="space-y-6">
          {/* Service Reminders Ticker */}
          <div id="service-reminders-ticker" className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">ALERTS</span>
            <h2 className="text-base font-bold text-gray-900 mb-4">Upcoming Reminders</h2>
            <div className="space-y-4">
              {upcomingReminders.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-6">No service reminders pending</div>
              ) : (
                upcomingReminders.map(rem => {
                  const vehicle = vehicles.find(v => v.id === rem.vehicleId);
                  const isOver = isOverdue(rem.dueDate);
                  return (
                    <div key={rem.id} className="p-3 border border-gray-100 rounded-xl hover:bg-gray-50/50 transition-colors duration-150">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-gray-800">{rem.type}</p>
                          <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                            {vehicle ? `${vehicle.plate} (${vehicle.make} ${vehicle.model})` : 'Unknown Vehicle'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`h-2 w-2 rounded-full ${isOver ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'}`}></span>
                          <span className="text-[10px] font-mono text-gray-400">{formatDate(rem.dueDate)}</span>
                        </div>
                      </div>
                      {rem.notes && (
                        <p className="text-[11px] text-gray-400 mt-2 bg-gray-50/80 px-2 py-1 rounded italic">
                          &ldquo;{rem.notes}&rdquo;
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Quick Metrics */}
          <div id="quick-metrics-container" className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">EFFICIENCY</span>
              <h2 className="text-base font-bold text-gray-900 mb-4">Workshop Speed</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Turnaround</span>
                <span className="text-lg font-black text-gray-800 font-mono mt-1 block">
                  {avgTurnaroundHours > 0 ? `${avgTurnaroundHours.toFixed(1)} hrs` : 'â€”'}
                </span>
                <span className="text-[9px] text-gray-400 block mt-0.5">Avg per job</span>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Completed</span>
                <span className="text-lg font-black text-gray-800 font-mono mt-1 block">{completedJobsCount}</span>
                <span className="text-[9px] text-gray-400 block mt-0.5">Jobs archived</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Repair Pipeline */}
      <div id="active-repair-pipeline-container" className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">WORKFLOW MONITOR</span>
            <h2 className="text-base font-bold text-gray-900">Active Repair Pipeline (Last 5)</h2>
            <p className="text-xs text-gray-400 mt-1">Real-time status updates sync directly with the desktop workstation</p>
          </div>
          <div className="flex items-center gap-1 bg-yellow-50 text-yellow-800 text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border border-yellow-100 self-start sm:self-center">
            <span>READ ONLY</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Job ID</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Vehicle & Owner</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Technician</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Estimate</th>
                <th className="px-6 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {pipelineJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-400">No recent pipeline job cards found</td>
                </tr>
              ) : (
                pipelineJobs.map(job => {
                  const vehicle = vehicles.find(v => v.id === job.vehicleId);
                  const client = vehicle ? clients.find(c => c.id === vehicle.clientId) : null;
                  const partsUsedCount = job.partsUsed?.length || 0;
                  const estimateVal = (job.laborCost || 0) + partsUsedCount * 800;
                  const isExpanded = expandedJobId === job.id;

                  return (
                    <tbody key={job.id} className="border-t border-gray-100">
                      <tr 
                        className="hover:bg-gray-50/50 cursor-pointer transition-colors"
                        onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                      >
                        <td className="px-6 py-4 font-mono font-bold text-gray-800">
                          {job.id ? job.id.slice(0, 8).toUpperCase() : 'JOB-CARD'}
                        </td>
                        <td className="px-6 py-4">
                          {vehicle ? (
                            <div>
                              <p className="font-bold text-gray-800">{vehicle.plate} &bull; {vehicle.make} {vehicle.model}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">{client?.name || 'Walk-in Client'}</p>
                            </div>
                          ) : (
                            <span className="text-gray-400">Unknown Vehicle</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-600 font-medium">
                          {job.technicianName || 'Unassigned'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusStyle(job.status)}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-gray-800 font-mono">
                          {formatCurrency(estimateVal, settings.currency)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button className="text-gray-400 hover:text-gray-600">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Repair Detail Panel */}
                      {isExpanded && (
                        <tr className="bg-gray-50/30">
                          <td colSpan={6} className="px-6 py-4 border-t border-gray-100">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-gray-600">
                              {/* Job description & dates */}
                              <div className="space-y-2">
                                <h4 className="font-bold text-gray-700 flex items-center gap-1.5 uppercase tracking-wide text-[10px]">
                                  <Info className="w-3.5 h-3.5 text-gray-400" /> Description & Diagnostic
                                </h4>
                                <p className="bg-white p-3 rounded-lg border border-gray-100 italic text-gray-500 leading-relaxed">
                                  {job.description || "No diagnostic comments recorded."}
                                </p>
                                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-gray-400">
                                  <div>
                                    <span className="block text-[9px] uppercase font-bold text-gray-300">Started At</span>
                                    <span>{formatDate(job.startedAt)}</span>
                                  </div>
                                  <div>
                                    <span className="block text-[9px] uppercase font-bold text-gray-300">Completed At</span>
                                    <span>{formatDate(job.completedAt)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Client & Vehicle Telemetry */}
                              <div className="space-y-2 bg-white p-3 rounded-xl border border-gray-100">
                                <h4 className="font-bold text-gray-700 flex items-center gap-1.5 uppercase tracking-wide text-[10px] border-b border-gray-100 pb-1.5">
                                  <Car className="w-3.5 h-3.5 text-gray-400" /> Client & Vehicle Bio
                                </h4>
                                {vehicle ? (
                                  <div className="space-y-1 text-[11px]">
                                    <div className="flex justify-between"><span className="text-gray-400">Plate:</span> <span className="font-bold font-mono text-gray-800">{vehicle.plate}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">Make/Model:</span> <span className="text-gray-800">{vehicle.make} {vehicle.model} ({vehicle.year})</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">Mileage:</span> <span className="text-gray-800 font-mono">{vehicle.mileage?.toLocaleString()} km</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">Fuel Type:</span> <span className="text-gray-800">{vehicle.fuelType}</span></div>
                                    {client && (
                                      <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                                        <div className="flex items-center gap-1 text-gray-700 font-medium"><User className="w-3 h-3 text-gray-400" /> {client.name}</div>
                                        <div className="flex items-center gap-1 text-gray-400"><Phone className="w-3 h-3" /> {client.phone}</div>
                                        <div className="flex items-center gap-1 text-gray-400 break-all"><Mail className="w-3 h-3" /> {client.email}</div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-gray-400 italic">No telemetry linked.</p>
                                )}
                              </div>

                              {/* Parts Allocation */}
                              <div className="space-y-2">
                                <h4 className="font-bold text-gray-700 flex items-center gap-1.5 uppercase tracking-wide text-[10px]">
                                  <Wrench className="w-3.5 h-3.5 text-gray-400" /> Parts & Consumables
                                </h4>
                                <div className="space-y-1.5">
                                  {partsUsedCount === 0 ? (
                                    <p className="text-gray-400 italic bg-white p-2 rounded-lg border border-gray-100">No parts checked out for this ticket.</p>
                                  ) : (
                                    <div className="bg-white border border-gray-100 rounded-lg max-h-[140px] overflow-y-auto divide-y divide-gray-50">
                                      {job.partsUsed.map((pu, i) => {
                                        const stockItem = stock.find(s => s.id === pu.partId);
                                        return (
                                          <div key={i} className="p-2 flex justify-between items-center text-[11px]">
                                            <div>
                                              <span className="font-bold text-gray-800">{stockItem?.name || 'Unknown Part'}</span>
                                              <span className="block text-[9px] text-gray-400 font-mono">{stockItem?.partNumber || `ID: ${pu.partId}`}</span>
                                            </div>
                                            <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-mono font-bold">qty: {pu.quantity}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <div className="pt-1 flex justify-between items-center text-[11px] font-semibold text-gray-700">
                                    <span>Labor Cost:</span>
                                    <span className="font-mono text-gray-800">{formatCurrency(job.laborCost || 0, settings.currency)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
