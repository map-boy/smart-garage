import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { 
  TrendingUp, Activity, ShieldCheck, Printer, Users, CheckCircle2, RefreshCw 
} from 'lucide-react';
import { Client, Vehicle, JobCard, Part, Invoice, GarageSettings } from '../types';
import { invoiceSpend } from '../utils/format';
import { formatCurrency } from '../utils/format';

interface ReportsPageProps {
  settings: GarageSettings;
  clients: Client[];
  vehicles: Vehicle[];
  jobs: JobCard[];
  stock: Part[];
  invoices: Invoice[];
}

export default function ReportsPage({
  settings,
  clients,
  vehicles,
  jobs,
  stock,
  invoices
}: ReportsPageProps) {
  
  // get monthly revenue groupings
  const getMonthlyRevenue = () => {
    const paidInvoices = invoices.filter(inv => inv.status === 'Paid');
    const groups: { [key: string]: number } = {};

    paidInvoices.forEach(inv => {
      const d = new Date(inv.issuedAt);
      if (isNaN(d.getTime())) return;
      const month = d.toLocaleString('en-US', { month: 'short' });
      const yearStr = d.getFullYear().toString().slice(-2);
      const key = `${month} '${yearStr}`;

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
  
  // Total Paid Revenue
  const totalPaidSpend = invoices
    .filter(inv => inv.status === 'Paid')
    .reduce((sum, inv) => {
      return sum + invoiceSpend(inv);
    }, 0);

  // Avg Monthly Revenue
  const avgMonthlyRevenue = monthlyRevenue.length > 0 
    ? totalPaidSpend / monthlyRevenue.length 
    : 0;

  // Inventory Health %
  const lowStockCount = stock.filter(item => item.quantity <= item.reorderLevel).length;
  const totalStockItems = stock.length;
  const inventoryHealthPct = totalStockItems > 0 
    ? ((totalStockItems - lowStockCount) / totalStockItems) * 100 
    : 100;

  // Job Success Rate %
  const completedJobsCount = jobs.filter(j => j.status === 'Completed').length;
  const totalJobsCount = jobs.length;
  const jobSuccessRatePct = totalJobsCount > 0 
    ? (completedJobsCount / totalJobsCount) * 100 
    : 100;

  // getTechnicianWorkload
  const getTechnicianWorkload = () => {
    const counts: { [key: string]: number } = {};
    jobs.forEach(j => {
      const tech = j.technicianName || 'Unassigned';
      counts[tech] = (counts[tech] || 0) + 1;
    });
    return Object.keys(counts).map(name => ({
      name,
      value: counts[name]
    }));
  };

  const technicianWorkload = getTechnicianWorkload();

  // Operations Summary counts
  const pendingJobsCount = jobs.filter(j => j.status === 'Pending').length;
  const inProgressJobsCount = jobs.filter(j => j.status === 'In Progress').length;
  const waitingPartsJobsCount = jobs.filter(j => j.status === 'Waiting Parts').length;

  return (
    <div id="reports-view-root" className="space-y-8 animate-fade-in print:space-y-4 print:p-0">
      {/* Report Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-5 print:border-b-2 print:border-gray-800">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 print:hidden">ANALYTICS GENERATOR</span>
          <h1 className="text-xl font-black text-gray-900 tracking-tight mt-1 print:text-2xl print:text-black">Performance Audit Report</h1>
          <p className="text-xs text-gray-500 mt-1 font-mono">{settings.garageName || "Workshop"} &bull; Generated real-time</p>
        </div>
        <button 
          id="print-report-btn"
          onClick={() => window.print()}
          className="print:hidden flex items-center gap-2 bg-gray-900 hover:bg-black text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-sm cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Export / Print Report</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 print:grid-cols-4 print:gap-4">
        {/* Total revenue */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm print:shadow-none print:border-gray-300">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">Total Revenue</span>
          <h3 className="text-2xl font-black text-gray-900 tracking-tight mt-2 print:text-xl font-mono">{formatCurrency(totalPaidSpend, settings.currency)}</h3>
          <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">Total spent on paid jobs (not income)</p>
        </div>

        {/* Avg Monthly Revenue */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm print:shadow-none print:border-gray-300">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">Avg Monthly</span>
          <h3 className="text-2xl font-black text-gray-900 tracking-tight mt-2 print:text-xl font-mono">{formatCurrency(avgMonthlyRevenue, settings.currency)}</h3>
          <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">Across active months</p>
        </div>

        {/* Inventory Health */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm print:shadow-none print:border-gray-300">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">Inventory Health</span>
          <h3 className="text-2xl font-black text-gray-900 tracking-tight mt-2 print:text-xl font-mono">{inventoryHealthPct.toFixed(0)}%</h3>
          <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">{totalStockItems - lowStockCount} of {totalStockItems} parts healthy</p>
        </div>

        {/* Job Success Rate */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm print:shadow-none print:border-gray-300">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">Job Success Rate</span>
          <h3 className="text-2xl font-black text-gray-900 tracking-tight mt-2 print:text-xl font-mono">{jobSuccessRatePct.toFixed(0)}%</h3>
          <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">{completedJobsCount} of {totalJobsCount} jobs done</p>
        </div>
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-1 print:gap-4">
        {/* Revenue Growth Bar Chart */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm print:shadow-none print:border-gray-300">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">HISTORICAL VIEW</span>
              <h2 className="text-sm font-bold text-gray-900">Revenue Growth Matrix</h2>
            </div>
          </div>
          <div className="h-64 print:h-48">
            {monthlyRevenue.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">No monthly revenue trends</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${settings.currency || 'RWF'} ${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value, settings.currency), 'Revenue']}
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', fontSize: '11px' }}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Technician Workload */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm print:shadow-none print:border-gray-300">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">LABOR ANALYSIS</span>
              <h2 className="text-sm font-bold text-gray-900">Technician Allocation & Performance</h2>
            </div>
          </div>
          <div className="h-64 print:h-48">
            {technicianWorkload.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">No job assignments tracked</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={technicianWorkload} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} width={80} />
                  <Tooltip 
                    formatter={(value: number) => [value, 'Total Jobs']}
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', fontSize: '11px' }}
                  />
                  <Bar dataKey="value" fill="#fbbf24" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Operations Summary */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm print:shadow-none print:border-gray-300">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">OPERATIONAL QUOTIENTS</span>
        <h2 className="text-sm font-bold text-gray-900 mb-6">Pipeline Summary Grid</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-4">
          <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-100 flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 block">Pending</span>
            <span className="text-2xl font-black text-rose-700 mt-2 font-mono">{pendingJobsCount}</span>
            <span className="text-[9px] text-rose-500 mt-1 uppercase font-semibold">Awaiting intake</span>
          </div>

          <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-100 flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">Waiting Parts</span>
            <span className="text-2xl font-black text-amber-700 mt-2 font-mono">{waitingPartsJobsCount}</span>
            <span className="text-[9px] text-amber-500 mt-1 uppercase font-semibold">Hold on inventory</span>
          </div>

          <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">In Progress</span>
            <span className="text-2xl font-black text-blue-700 mt-2 font-mono">{inProgressJobsCount}</span>
            <span className="text-[9px] text-blue-500 mt-1 uppercase font-semibold">On the lifts</span>
          </div>

          <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Completed</span>
            <span className="text-2xl font-black text-emerald-700 mt-2 font-mono">{completedJobsCount}</span>
            <span className="text-[9px] text-emerald-500 mt-1 uppercase font-semibold">Ready for pickup</span>
          </div>
        </div>
      </div>
    </div>
  );
}
