import { useMemo } from 'react';
import { collection, doc, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth';
import { useCol, dayStr, STATUS } from '../hooks';

export default function Worker() {
  const { profile } = useAuth();
  const o = profile!.orgId;
  const uid = profile!.uid;
  const d = dayStr();
  const jobs = useCol(() => query(collection(db, `hubOrgs/${o}/visits`), where('assignedTo', '==', uid), where('day', '==', d)), [o, d, uid]);
  const list = useMemo(() => [...jobs].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)), [jobs]);
  const set = (id: string, patch: Record<string, any>) =>
    updateDoc(doc(db, `hubOrgs/${o}/visits/${id}`), { ...patch, updatedAt: Date.now() }).catch(console.error);

  return (
    <div className="page">
      <div>
        <h1>My jobs</h1>
        <p className="sub">{list.length} job(s) today. Changes save on this device and upload when you are online.</p>
      </div>
      {list.length === 0 && <div className="card"><p className="sub">Nothing assigned to you today.</p></div>}
      {list.map((v) => (
        <div className="card" key={v.id}>
          <div className="item">
            <div className="t">
              <b>{v.name}</b>
              <span>{v.phone ? <a href={'tel:' + v.phone}>{v.phone}</a> : 'no phone'}{v.reason ? ' · ' + v.reason : ''}</span>
              {v._pending && <span className="pend">⏳ not synced yet</span>}
            </div>
            <span className={'pill ' + v.status}>{STATUS[v.status] || v.status}</span>
          </div>
          <textarea rows={2} placeholder="Note" defaultValue={v.note || ''} onBlur={(e) => { if (e.target.value !== (v.note || '')) set(v.id, { note: e.target.value }); }} />
          <div className="actions">
            {v.status === 'waiting' && <button className="btn" onClick={() => set(v.id, { status: 'in_progress' })}>Start</button>}
            {v.status !== 'done' && <button className="btn" onClick={() => set(v.id, { status: 'done' })}>Done ✓</button>}
          </div>
        </div>
      ))}
    </div>
  );
}