import { FormEvent, useMemo, useState } from 'react';
import { collection, doc, increment, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth';
import { useCol, dayStr, STATUS, Row } from '../hooks';

const DEFAULT_REASONS = ['Service', 'Repair', 'Inspection', 'Oil change', 'Tyres', 'Quote', 'Parts', 'Payment'];
const digits = (s: string) => s.replace(/\D/g, '');
const fmt = (t?: number) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function Sugg({ list, onPick }: { list: Row[]; onPick: (v: Row) => void }) {
  if (!list.length) return null;
  return (
    <div className="sugg">
      {list.map((v) => (
        <button type="button" key={v.id} className="sg" onPointerDown={(e) => { e.preventDefault(); onPick(v); }}>
          <b>{v.name}</b>
          <span>{v.phone || 'no phone'}</span>
          <small>{v.visits || 1} visit(s) · last {fmt(v.lastVisit)}{v.lastReason ? ' · ' + v.lastReason : ''}</small>
        </button>
      ))}
    </div>
  );
}

export default function Reception() {
  const { profile } = useAuth();
  const o = profile!.orgId;
  const d = dayStr();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [assign, setAssign] = useState('');
  const [picked, setPicked] = useState<Row | null>(null);
  const [focus, setFocus] = useState<'' | 'name' | 'phone'>('');
  const [toast, setToast] = useState('');

  const visitors = useCol(() => collection(db, `hubOrgs/${o}/visitors`), [o]);
  const workers = useCol(() => query(collection(db, 'hubUsers'), where('orgId', '==', o), where('role', '==', 'worker')), [o]);
  const today = useCol(() => query(collection(db, `hubOrgs/${o}/visits`), where('day', '==', d)), [o, d]);
  const history = useCol(() => (picked ? query(collection(db, `hubOrgs/${o}/visits`), where('visitorId', '==', picked.id)) : null), [o, picked ? picked.id : '']);

  const hist = useMemo(() => [...history].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [history]);
  const todayList = useMemo(() => [...today].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [today]);

  const sugg = useMemo(() => {
    const qn = name.trim().toLowerCase();
    const qp = digits(phone);
    const byRecent = (a: Row, b: Row) => (b.lastVisit || 0) - (a.lastVisit || 0);
    let list: Row[] = [];
    if (focus === 'name') list = qn ? visitors.filter((v) => (v.nameLower || '').includes(qn)) : visitors;
    else if (focus === 'phone') list = qp ? visitors.filter((v) => digits(v.phone || '').includes(qp)) : visitors;
    return [...list].sort(byRecent).slice(0, 6);
  }, [visitors, name, phone, focus]);

  const reasons = useMemo(() => {
    const mine = hist.map((h) => h.reason).filter(Boolean);
    const others = visitors.map((v) => v.lastReason).filter(Boolean);
    return Array.from(new Set([...mine, ...others, ...DEFAULT_REASONS])).slice(0, 8) as string[];
  }, [hist, visitors]);

  const blur = () => { setTimeout(() => setFocus(''), 150); };
  const pick = (v: Row) => { setPicked(v); setName(v.name); setPhone(v.phone || ''); setFocus(''); };
  const onName = (val: string) => { setName(val); if (picked && val !== picked.name) setPicked(null); };
  const onPhone = (val: string) => { setPhone(val); if (picked && val !== (picked.phone || '')) setPicked(null); };

  function save(e: FormEvent) {
    e.preventDefault();
    const nm = name.trim();
    const ph = phone.trim();
    if (!nm) return;
    const id = picked ? picked.id : digits(ph) || doc(collection(db, `hubOrgs/${o}/visitors`)).id;
    const w = workers.find((x) => x.id === assign);
    const now = Date.now();
    const b = writeBatch(db);
    b.set(doc(db, `hubOrgs/${o}/visitors/${id}`), { name: nm, nameLower: nm.toLowerCase(), phone: ph, lastVisit: now, lastReason: reason.trim(), visits: increment(1) }, { merge: true });
    b.set(doc(collection(db, `hubOrgs/${o}/visits`)), {
      visitorId: id, name: nm, phone: ph, reason: reason.trim(), assignedTo: w ? w.id : null, assignedName: w ? w.name : '',
      day: d, status: 'waiting', note: '', createdAt: now, updatedAt: now, createdBy: profile!.uid
    });
    // Not awaited on purpose: offline, the write is queued on the device and uploads when the connection returns.
    b.commit().catch(console.error);
    setName(''); setPhone(''); setReason(''); setAssign(''); setPicked(null);
    setToast(navigator.onLine ? 'Saved ✓' : 'Saved on this device ✓ — it will upload when you are online');
    setTimeout(() => setToast(''), 3500);
  }

  const setStatus = (id: string, status: string) =>
    updateDoc(doc(db, `hubOrgs/${o}/visits/${id}`), { status, updatedAt: Date.now() }).catch(console.error);

  return (
    <div className="page">
      <div>
        <h1>Check-in</h1>
        <p className="sub">Type a name or phone number. Known people appear with their full history.</p>
      </div>
      <div className="two">
        <div className="stack">
          <form className="card" onSubmit={save}>
            <h2>New visit</h2>
            <div className="fld">
              <input placeholder="Name" value={name} autoComplete="off" onFocus={() => setFocus('name')} onBlur={blur} onChange={(e) => onName(e.target.value)} />
              {focus === 'name' && <Sugg list={sugg} onPick={pick} />}
            </div>
            <div className="fld">
              <input placeholder="Phone" type="tel" inputMode="tel" value={phone} autoComplete="off" onFocus={() => setFocus('phone')} onBlur={blur} onChange={(e) => onPhone(e.target.value)} />
              {focus === 'phone' && <Sugg list={sugg} onPick={pick} />}
            </div>
            <div className="fld">
              <input placeholder="Reason for visit" list="reasons" value={reason} onChange={(e) => setReason(e.target.value)} />
              <datalist id="reasons">{reasons.map((r) => <option key={r} value={r} />)}</datalist>
            </div>
            <div className="chips">
              {reasons.slice(0, 6).map((r) => <button type="button" key={r} className="chip" onClick={() => setReason(r)}>{r}</button>)}
            </div>
            <div className="fld">
              <select value={assign} onChange={(e) => setAssign(e.target.value)}>
                <option value="">Assign to… (optional)</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <button className="btn wide" type="submit" disabled={!name.trim()}>Save visit</button>
          </form>

          {picked && (
            <div className="card person">
              <div className="prow">
                <div className="avatar sm">{(picked.name || '?').charAt(0).toUpperCase()}</div>
                <div><h2>{picked.name}</h2><span className="sub">{picked.phone || 'no phone'}</span></div>
              </div>
              <div className="pstats">
                <div className="pstat"><small>Visits</small><b>{picked.visits || hist.length}</b></div>
                <div className="pstat"><small>Last visit</small><b>{fmt(picked.lastVisit)}</b></div>
                <div className="pstat"><small>Last reason</small><b>{picked.lastReason || '—'}</b></div>
              </div>
              <h2>History</h2>
              {hist.length === 0 && <p className="sub">No visits recorded yet.</p>}
              {hist.slice(0, 10).map((h) => (
                <div className="item" key={h.id}>
                  <div className="t">
                    <b>{h.reason || 'Visit'}</b>
                    <span>{fmt(h.createdAt)}{h.assignedName ? ' · ' + h.assignedName : ''}{h.note ? ' · ' + h.note : ''}</span>
                  </div>
                  <span className={'pill ' + h.status}>{STATUS[h.status] || h.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Today · {todayList.length}</h2>
          {todayList.length === 0 && <p className="sub">Nobody yet.</p>}
          {todayList.map((v) => (
            <div className="item" key={v.id}>
              <div className="t">
                <b>{v.name}</b>
                <span>{v.phone || 'no phone'}{v.reason ? ' · ' + v.reason : ''}{v.assignedName ? ' · ' + v.assignedName : ''}</span>
                {v._pending && <span className="pend">⏳ not synced yet</span>}
              </div>
              <span className={'pill ' + v.status}>{STATUS[v.status] || v.status}</span>
              {v.status !== 'done' && <button className="go" title="Mark done" onClick={() => setStatus(v.id, 'done')}>✓</button>}
            </div>
          ))}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}