import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth';
import { useCol, dayStr, greet, STATUS } from '../hooks';

const DAY = 86400000;

export default function Boss() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const o = profile!.orgId;
  const [d, setD] = useState(dayStr());
  const start = useMemo(() => dayStr(new Date(new Date(d + 'T00:00:00').getTime() - 6 * DAY)), [d]);

  const visits = useCol(() => query(collection(db, `hubOrgs/${o}/visits`), where('day', '==', d)), [o, d]);
  const week = useCol(() => query(collection(db, `hubOrgs/${o}/visits`), where('day', '>=', start), where('day', '<=', d)), [o, start, d]);
  const visitors = useCol(() => collection(db, `hubOrgs/${o}/visitors`), [o]);
  const workers = useCol(() => query(collection(db, 'hubUsers'), where('orgId', '==', o), where('role', '==', 'worker')), [o]);

  const waiting = visits.filter((v) => v.status === 'waiting').length;
  const working = visits.filter((v) => v.status === 'in_progress').length;
  const done = visits.filter((v) => v.status === 'done').length;

  const days = Array.from({ length: 7 }, (_, i) => dayStr(new Date(new Date(start + 'T00:00:00').getTime() + i * DAY)));
  const perDay = days.map((x) => week.filter((v) => v.day === x).length);
  const max = Math.max(1, ...perDay);

  const t = Math.max(1, visits.length);
  const a = (done / t) * 100;
  const b = a + (working / t) * 100;
  const donut = visits.length
    ? `conic-gradient(#58b0b5 0 ${a}%, #7b78c4 ${a}% ${b}%, #b8c9d8 ${b}% 100%)`
    : 'conic-gradient(#d5e0ea 0 100%)';

  const recent = useMemo(() => [...visits].sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0)).slice(0, 8), [visits]);
  const finish = (id: string) => updateDoc(doc(db, `hubOrgs/${o}/visits/${id}`), { status: 'done', updatedAt: Date.now() }).catch(console.error);

  return (
    <div className="page">
      <div className="banner">
        <div>
          <h1>{greet()}, {profile!.name}!</h1>
          <p>{visits.length} visit(s) on {d} · {waiting} waiting · {done} done</p>
          <input className="dateinp" type="date" value={d} onChange={(e) => e.target.value && setD(e.target.value)} />
        </div>
        {profile!.role === 'technician' && <button className="btn" onClick={() => nav('/reception')}>＋ New check-in</button>}
      </div>

      <div className="stats">
        <div className="stat s1"><small>Visits</small><strong>{visits.length}</strong><small>on this day</small></div>
        <div className="stat s2"><small>Done</small><strong>{done}</strong><small>finished</small></div>
        <div className="stat s3"><small>Open</small><strong>{waiting + working}</strong><small>{waiting} waiting · {working} in progress</small></div>
        <div className="stat s4"><small>Customers</small><strong>{visitors.length}</strong><small>all time</small></div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Visits · last 7 days</h2>
          <div className="bars">
            {days.map((x, i) => (
              <div className="bc" key={x}>
                <em>{perDay[i]}</em>
                <i style={{ height: Math.max(4, (perDay[i] / max) * 130) + 'px' }} />
                <span>{new Date(x + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Status</h2>
          <div className="donutrow">
            <div className="donut" style={{ background: donut }} />
            <div className="legend">
              <div><i style={{ background: '#58b0b5' }} />Done <b>{done}</b></div>
              <div><i style={{ background: '#7b78c4' }} />In progress <b>{working}</b></div>
              <div><i style={{ background: '#b8c9d8' }} />Waiting <b>{waiting}</b></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Visits on {d}</h2>
          {recent.length === 0 && <p className="sub">No visits on this day.</p>}
          {recent.map((v) => (
            <div className="item" key={v.id}>
              <div className="t">
                <b>{v.name}</b>
                <span>{v.reason || 'Visit'}{v.assignedName ? ' · ' + v.assignedName : ''}</span>
              </div>
              <span className={'pill ' + v.status}>{STATUS[v.status] || v.status}</span>
              {v.status !== 'done' && <button className="go" title="Mark done" onClick={() => finish(v.id)}>✓</button>}
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Workers</h2>
          {workers.length === 0 && <p className="sub">No workers yet. Add them in Team.</p>}
          {workers.map((w) => {
            const mine = visits.filter((v) => v.assignedTo === w.id);
            return (
              <div className="item" key={w.id}>
                <div className="t"><b>{w.name}</b><span>{mine.filter((v) => v.status === 'done').length} of {mine.length} done</span></div>
                {w.active === false && <span className="pill waiting">disabled</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}