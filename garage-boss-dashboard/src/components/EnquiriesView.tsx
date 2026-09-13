import { useState } from 'react';
import {
  collection, doc, getFirestore, onSnapshot, orderBy, query, limit, updateDoc,
} from 'firebase/firestore';
import { useEffect } from 'react';
import { Inbox, Phone, Mail, Car, Check, Clock, MessageSquare } from 'lucide-react';
import { db } from '../firebase';

type EnquiryStatus = 'new' | 'answered' | 'closed';

interface Enquiry {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  vehicle?: string | null;
  service?: string | null;
  message: string;
  status: EnquiryStatus;
  createdAtLocal?: string;
}

const STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: 'New',
  answered: 'Answered',
  closed: 'Closed',
};

/**
 * Questions sent from the public website.
 *
 * The point of this screen is that an enquiry cannot quietly rot. Anything
 * still marked new is money waiting to be collected, so new sits at the top
 * and stays visually loud until somebody deals with it.
 */
export default function EnquiriesView({ garageId }: { garageId: string }) {
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [filter, setFilter] = useState<EnquiryStatus | 'all'>('new');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!garageId) return;
    // Capped, and ordered by the visitor's own clock: the server stamp is
    // null for a moment after the write, which would otherwise drop the
    // newest message to the bottom exactly when it matters most.
    const q = query(
      collection(db, 'garages', garageId, 'enquiries'),
      orderBy('createdAtLocal', 'desc'),
      limit(200),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Enquiry, 'id'>) })));
        setError(null);
      },
      (e) => setError(e.message),
    );
    return () => unsub();
  }, [garageId]);

  const setStatus = async (id: string, status: EnquiryStatus) => {
    await updateDoc(doc(getFirestore(), 'garages', garageId, 'enquiries', id), { status });
  };

  const newCount = rows.filter((r) => r.status === 'new').length;
  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Inbox className="w-5 h-5 text-gray-500" />
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-900">
            Website enquiries
          </h2>
        </div>
        {newCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-black">
            {newCount} waiting
          </span>
        )}
        <div className="ml-auto flex gap-1">
          {(['new', 'answered', 'closed', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                'px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ' +
                (filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')
              }
            >
              {f === 'all' ? 'All' : STATUS_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-xs">
          {error}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-xs font-semibold text-gray-500">
            {filter === 'new' ? 'Nothing waiting. Every enquiry has been dealt with.' : 'Nothing here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((e) => (
            <div
              key={e.id}
              className={
                'bg-white rounded-2xl border p-5 ' +
                (e.status === 'new' ? 'border-amber-300 shadow-sm' : 'border-gray-100')
              }
            >
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <p className="font-black text-gray-900">{e.name}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                    {/* Every contact detail is a link. The boss reading this
                        on a phone should be one tap from replying. */}
                    <a className="flex items-center gap-1 hover:text-gray-900" href={`tel:${e.phone.replace(/[^\d+]/g, '')}`}>
                      <Phone className="w-3 h-3" /> {e.phone}
                    </a>
                    {e.email && (
                      <a className="flex items-center gap-1 hover:text-gray-900" href={`mailto:${e.email}`}>
                        <Mail className="w-3 h-3" /> {e.email}
                      </a>
                    )}
                    {e.vehicle && (
                      <span className="flex items-center gap-1"><Car className="w-3 h-3" /> {e.vehicle}</span>
                    )}
                    {e.createdAtLocal && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(e.createdAtLocal).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={
                    'px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ' +
                    (e.status === 'new'
                      ? 'bg-amber-100 text-amber-700'
                      : e.status === 'answered'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-500')
                  }
                >
                  {STATUS_LABEL[e.status]}
                </span>
              </div>

              {e.service && (
                <p className="mt-3 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  About: {e.service}
                </p>
              )}
              <p className="mt-2 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {e.message}
              </p>

              <div className="mt-4 flex gap-2">
                {e.status !== 'answered' && (
                  <button
                    onClick={() => setStatus(e.id, 'answered')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition"
                  >
                    <Check className="w-3 h-3" /> Mark answered
                  </button>
                )}
                {e.status !== 'closed' && (
                  <button
                    onClick={() => setStatus(e.id, 'closed')}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold transition"
                  >
                    Close
                  </button>
                )}
                {e.status !== 'new' && (
                  <button
                    onClick={() => setStatus(e.id, 'new')}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold transition"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
