import { useMemo, useState } from 'react';
import { Car } from 'lucide-react';
import { useVisits } from '../hooks/useVisits';

export function VisitsByDate() {
  const { visits, error } = useVisits();
  const [date, setDate] = useState('all');

  const dates = useMemo(
    () => Array.from(new Set(visits.map(v => v.visitDate || '').filter(Boolean))).sort().reverse(),
    [visits]
  );

  const rows = useMemo(
    () => visits
      .filter(v => date === 'all' || v.visitDate === date)
      .sort((a, b) =>
        (b.visitDate || '').localeCompare(a.visitDate || '') ||
        (b.createdAt || '').localeCompare(a.createdAt || '')),
    [visits, date]
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="p-4 border-b border-gray-50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Car className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-800">
            Reception Visits <span className="font-mono text-gray-400">({rows.length})</span>
          </h2>
        </div>
        <select
          className="p-2 rounded-lg border border-gray-200 bg-white text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        >
          <option value="all">All dates</option>
          {dates.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      {error && <p className="p-4 text-sm text-rose-600">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
              {['Date', 'Plate', 'Model', 'Client', 'Phone', 'Location', 'Issue'].map(h => (
                <th key={h} className="px-4 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(v => (
              <tr key={v.id} className="border-t border-gray-50">
                <td className="px-4 py-2 font-mono text-xs">{v.visitDate}</td>
                <td className="px-4 py-2 font-black text-blue-600">{v.vehiclePlate}</td>
                <td className="px-4 py-2">{v.vehicleModel}</td>
                <td className="px-4 py-2">{v.name}</td>
                <td className="px-4 py-2">{v.phone}</td>
                <td className="px-4 py-2">{v.location}</td>
                <td className="px-4 py-2 text-gray-600">{v.issue}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No visits for this date.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
