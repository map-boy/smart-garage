import { useState } from 'react';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, CalendarRange,
  Download, FileSpreadsheet, Package, PiggyBank, TrendingUp, Wrench,
} from 'lucide-react';
import { useReports } from '../hooks/useReports';
import { useFinance, PERIOD_LABEL, type Period } from '../hooks/useFinance';
import { buildStockCsv, buildMovementsCsv, downloadCsv } from '../lib/stockExport';
import { LEDGER_WINDOW } from '../hooks/useStockLedger';
import { RevenueBarChart } from '../components/charts/RevenueBarChart';
import { TechnicianChart } from '../components/charts/TechnicianChart';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/Button';

const PERIODS: Period[] = ['month', 'quarter', 'year', 'all'];

export function ReportsPage() {
  const [period, setPeriod] = useState<Period>('month');
  const { getMonthlyRevenue, getTechnicianWorkload, getJobStats } = useReports();
  const money = useFinance(period);
  // Exporting the period on screen, not the whole ledger: a spreadsheet that
  // disagrees with the figures above it is worse than no spreadsheet.
  const rows = money.movementsInPeriod;
  const today = new Date().toISOString().slice(0, 10);
  const exportStock = (grain: 'daily' | 'monthly') =>
    downloadCsv(`stock-${grain}-${period}-${today}.csv`, buildStockCsv(rows, grain));

  const jobStats = getJobStats();
  const revenueData = getMonthlyRevenue();
  const totalJobs = Object.values(jobStats).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Money and usage
          </h1>
          <p className="text-sm text-gray-500 font-medium">
            What came in, what it cost, and what the workshop actually gets through
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ' +
                  (period === p
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800')
                }
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          <Button onClick={() => window.print()} variant="outline">
            <Download className="w-4 h-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      {money.ledgerError && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-700">
          {money.ledgerError}
        </div>
      )}

      {/* Exports live next to the figures they come from, so the number on
          screen and the number in the spreadsheet are the same read of the
          same ledger rather than two trips to the database. */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px]">
            <h3 className="text-sm font-bold text-gray-900">Export the stock book</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Opens in Excel. One row per part per day, or per part per month.
              {rows.length > 0 && ` Covering ${rows.length} movements in ${PERIOD_LABEL[period].toLowerCase()}.`}
            </p>
          </div>
          <Button variant="outline" disabled={rows.length === 0}
            onClick={() => exportStock('daily')}>
            <CalendarDays className="w-4 h-4 mr-2" /> Daily CSV
          </Button>
          <Button variant="outline" disabled={rows.length === 0}
            onClick={() => exportStock('monthly')}>
            <CalendarRange className="w-4 h-4 mr-2" /> Monthly CSV
          </Button>
          <Button variant="ghost" disabled={rows.length === 0}
            onClick={() => downloadCsv(`stock-movements-${period}-${today}.csv`, buildMovementsCsv(rows))}>
            <FileSpreadsheet className="w-4 h-4 mr-2" /> Every movement
          </Button>
        </div>
        {rows.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">
            Nothing moved in or out of the store in this period, so there is nothing
            to export. Pick a longer period above.
          </p>
        )}
      </div>

      {/* ---- the four numbers the boss actually asks for ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Stat
          icon={<ArrowUpRight className="w-7 h-7 text-emerald-600" />}
          label="Income received"
          value={formatCurrency(money.income)}
          note={money.receivable > 0
            ? `${formatCurrency(money.receivable)} still unpaid`
            : 'All invoices in this period are paid'}
        />
        <Stat
          icon={<PiggyBank className="w-7 h-7 text-blue-600" />}
          label="Invested in stock"
          value={formatCurrency(money.investment)}
          note="Parts bought into the store in this period"
        />
        <Stat
          icon={<ArrowDownRight className="w-7 h-7 text-amber-600" />}
          label="Parts used on jobs"
          value={formatCurrency(money.partsConsumed)}
          note="What left the shelf for customers' vehicles"
        />
        <Stat
          icon={<TrendingUp className="w-7 h-7 text-slate-900" />}
          label="Gross profit"
          value={formatCurrency(money.grossProfit)}
          note="Income less the parts it took. Labour is not deducted."
          tone={money.grossProfit < 0 ? 'bad' : 'good'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Stat
          icon={<Package className="w-7 h-7 text-indigo-600" />}
          label="Value on the shelf"
          value={formatCurrency(money.shelfValue)}
          note="What the current stock is worth at cost"
        />
        <Stat
          icon={<AlertTriangle className="w-7 h-7 text-rose-600" />}
          label="Written off"
          value={formatCurrency(money.writtenOff)}
          note="Stock lost, damaged or removed from the catalogue"
          tone={money.writtenOff > 0 ? 'bad' : undefined}
        />
        <Stat
          icon={<Wrench className="w-7 h-7 text-slate-600" />}
          label="Jobs completed"
          value={`${((jobStats.Completed / totalJobs) * 100).toFixed(0)}%`}
          note={`${jobStats.Completed} of ${totalJobs} job cards`}
        />
      </div>

      {/* Saying where a number is soft matters more than the number looking
          precise. Anything the desk wrote, and every line from before costs
          were stamped, is priced at what the part costs today. */}
      {(money.estimatedLines > 0 || money.ledgerCapped) && (
        <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-amber-300 pl-3">
          {money.estimatedLines > 0 && (
            <>
              {money.estimatedLines} of {money.movementsCounted} stock movements in this
              period were recorded without a price, so they are valued at what the part
              costs today rather than what it cost then. Figures above are close, not exact.
            </>
          )}
          {money.ledgerCapped && (
            <> Only the most recent {LEDGER_WINDOW.toLocaleString()} movements are read,
            so a longer period may be missing older lines.</>
          )}
        </p>
      )}

      {/* ---- what actually gets used ---- */}
      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-black text-gray-900 mb-1">Most used parts</h3>
        <p className="text-sm text-gray-500 mb-6">
          Ranked by how many left the shelf for vehicles in {PERIOD_LABEL[period].toLowerCase()}.
        </p>
        {money.topUsed.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            Nothing has been issued to a vehicle in this period.
          </p>
        ) : (
          <div className="space-y-2">
            {money.topUsed.map((row) => {
              const widest = money.topUsed[0].qty || 1;
              return (
                <div key={row.name} className="flex items-center gap-4">
                  <div className="w-48 shrink-0 text-sm font-semibold text-gray-900 truncate">
                    {row.name}
                  </div>
                  <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
                    <div
                      className="h-full bg-blue-500/80 rounded-md"
                      style={{ width: `${Math.max((row.qty / widest) * 100, 3)}%` }}
                    />
                  </div>
                  <div className="w-16 shrink-0 text-right text-sm font-black text-gray-900">
                    {row.qty}
                  </div>
                  <div className="w-28 shrink-0 text-right text-xs font-mono text-gray-500">
                    {formatCurrency(row.value)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-black text-gray-900 mb-8 border-b border-gray-50 pb-4">
            Revenue by month
          </h3>
          <RevenueBarChart data={revenueData} />
        </div>
        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-black text-gray-900 mb-8 border-b border-gray-50 pb-4">
            Work per technician
          </h3>
          <TechnicianChart data={getTechnicianWorkload()} />
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-black text-gray-900 mb-6">Job cards right now</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <JobStat label="Pending" value={jobStats.Pending} tone="rose" />
          <JobStat label="In Progress" value={jobStats['In Progress']} tone="amber" />
          <JobStat label="Waiting Parts" value={jobStats['Waiting Parts']} tone="blue" />
          <JobStat label="Completed" value={jobStats.Completed} tone="emerald" />
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, note, tone }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
      <div className="mb-4">{icon}</div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</p>
      <h3
        className={
          'text-2xl font-black ' +
          (tone === 'bad' ? 'text-rose-600' : tone === 'good' ? 'text-emerald-700' : 'text-gray-900')
        }
      >
        {value}
      </h3>
      {note && <p className="text-[11px] text-gray-500 mt-1 leading-snug">{note}</p>}
    </div>
  );
}

const JOB_TONES = {
  rose: 'bg-rose-50 border-rose-100 text-rose-600 text-rose-900',
  amber: 'bg-amber-50 border-amber-100 text-amber-600 text-amber-900',
  blue: 'bg-blue-50 border-blue-100 text-blue-600 text-blue-900',
  emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600 text-emerald-900',
} as const;

function JobStat({ label, value, tone }: {
  label: string; value: number; tone: keyof typeof JOB_TONES;
}) {
  const [bg, border, labelColor, valueColor] = JOB_TONES[tone].split(' ');
  return (
    <div className={`${bg} ${border} p-6 rounded-2xl border`}>
      <p className={`text-xs font-black uppercase tracking-widest ${labelColor}`}>{label}</p>
      <p className={`text-4xl font-black leading-none mt-2 ${valueColor}`}>{value}</p>
    </div>
  );
}
