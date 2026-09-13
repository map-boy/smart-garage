import { useEffect, useState } from 'react';
import {
  collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { Smartphone, Copy, Check, Trash2, AlertCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

type Role = 'reception' | 'stock';

const ROLE_LABEL: Record<Role, string> = {
  reception: 'Reception',
  stock: 'Stock manager',
};

/** Ten minutes is long enough to walk a phone over, short enough to matter. */
const CODE_TTL_MS = 10 * 60 * 1000;

/**
 * Characters that survive being read out loud across a workshop.
 *
 * No O/0, I/1, S/5 or Z/2: the whole point is that someone reads this to
 * someone else over the noise of a compressor, and a code that has to be
 * spelled twice is a code that gets typed wrong.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY346789';

function newCode(): string {
  const pick = () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
}

interface PairedDevice {
  id: string;
  role: Role;
  staffName: string;
  lastSeenAt?: { toDate?: () => Date };
}

/**
 * How a phone joins this garage.
 *
 * The phone apps have no password by choice, so this is the only gate. The
 * boss mints a short code, reads it out, and the phone spends it once. The
 * code is the secret: it cannot be listed or guessed, and after it is redeemed
 * the device's own account is what the rules check.
 *
 * Codes expire because an unspent one lying in the database is a standing
 * invitation, and the person who generated it has long since forgotten.
 */
export function DevicePairingCard() {
  const { profile } = useAuth();
  const garageId = profile?.garageId ?? '';

  const [role, setRole] = useState<Role>('reception');
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!garageId) return;
    const unsub = onSnapshot(
      collection(db, 'garages', garageId, 'devices'),
      (snap) => setDevices(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PairedDevice, 'id'>) }))),
      (e) => setError(e.message),
    );
    return () => unsub();
  }, [garageId]);

  // Only ticks while a code is live, so the settings page is not repainting
  // once a second for no reason.
  useEffect(() => {
    if (!code) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [code]);

  const generate = async () => {
    if (!garageId) return;
    setError(null);
    const c = newCode();
    const expiry = Date.now() + CODE_TTL_MS;
    try {
      await setDoc(doc(db, 'pairing', c), {
        garageId,
        role,
        expiresAtMs: expiry,
        createdAt: serverTimestamp(),
      });
      setCode(c);
      setExpiresAt(expiry);
      setCopied(false);
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a code.');
    }
  };

  const unpair = async (deviceId: string) => {
    await deleteDoc(doc(db, 'garages', garageId, 'devices', deviceId));
  };

  const secondsLeft = code ? Math.max(0, Math.round((expiresAt - now) / 1000)) : 0;
  const live = secondsLeft > 0;

  return (
    <div className="bg-white rounded-2xl p-6 space-y-4 border border-gray-100">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-black uppercase tracking-widest text-gray-900">Phones</h2>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        The reception and stock apps have no password. To set one up, make a code
        here and read it to whoever is holding the phone. It works once and
        expires in ten minutes.
      </p>

      <div className="flex gap-2">
        {(['reception', 'stock'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={
              'px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition ' +
              (role === r ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')
            }
          >
            {ROLE_LABEL[r]}
          </button>
        ))}
        <button
          onClick={generate}
          disabled={!garageId}
          className="ml-auto bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-xl transition"
        >
          Make a code
        </button>
      </div>

      {error && (
        <div className="flex gap-2 bg-rose-50 text-rose-700 rounded-xl p-3 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {code && (
        <div className={'rounded-xl p-4 ' + (live ? 'bg-gray-900' : 'bg-gray-100')}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {ROLE_LABEL[role]} code
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span
              className={
                'text-3xl font-black tracking-[0.2em] ' +
                (live ? 'text-white' : 'text-gray-400 line-through')
              }
            >
              {code}
            </span>
            {live && (
              <button
                onClick={() => { void navigator.clipboard?.writeText(code); setCopied(true); }}
                className="text-gray-400 hover:text-white transition"
                title="Copy"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
          </div>
          <p className={'text-xs mt-2 ' + (live ? 'text-gray-400' : 'text-gray-500')}>
            {live
              ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
              : 'Expired. Make another one.'}
          </p>
        </div>
      )}

      <div className="border-t border-gray-100 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
          Paired phones
        </p>
        {devices.length === 0 ? (
          <p className="text-xs text-gray-500">No phones paired yet.</p>
        ) : (
          <div className="space-y-2">
            {devices.map((d) => (
              <div key={d.id} className="flex items-center gap-3 text-xs">
                <div className="flex-1">
                  <p className="font-bold text-gray-900">{d.staffName || 'Unnamed'}</p>
                  <p className="text-gray-500">
                    {ROLE_LABEL[d.role] ?? d.role}
                    {d.lastSeenAt?.toDate && ` · last seen ${d.lastSeenAt.toDate().toLocaleString()}`}
                  </p>
                </div>
                {/* Unpairing is how a lost phone stops being trusted. It keeps
                    working locally until it next reaches the server, which is
                    the honest limit of any offline-first design. */}
                <button
                  onClick={() => unpair(d.id)}
                  className="text-rose-400 hover:text-rose-600 transition"
                  title="Unpair this phone"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
