import { FormEvent, useState } from 'react';
import { collection, doc, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db, createAccount, resetPassword } from '../firebase';
import { useAuth, Profile } from '../auth';
import { useCol } from '../hooks';

const ROLES: Profile['role'][] = ['worker', 'secretary', 'receptionist', 'boss', 'technician'];

export default function Technician() {
  const { profile } = useAuth();
  const o = profile!.orgId;
  const users = useCol(() => query(collection(db, 'hubUsers'), where('orgId', '==', o)), [o]);
  const [role, setRole] = useState<Profile['role']>('worker');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const isBoss = role === 'boss';
  const [reveal, setReveal] = useState<{ username: string; password: string } | null>(null);
  const [resetBusy, setResetBusy] = useState('');
  const [resetTarget, setResetTarget] = useState('');
  const [resetDraft, setResetDraft] = useState('');

  async function resetFor(u: any, draft: string) {
    setMsg('');
    if (draft && draft.length < 6) { setMsg('New password needs at least 6 characters, or leave it blank for a random one.'); return; }
    setResetBusy(u.id);
    try {
      const pw = await resetPassword(u.id, draft || undefined);
      setReveal({ username: u.username, password: pw });
      setResetTarget(''); setResetDraft('');
    } catch (err: any) {
      setMsg((err && err.message) || 'Could not reset the password.');
    } finally {
      setResetBusy('');
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    if (!navigator.onLine) { setMsg('Creating an account needs internet.'); return; }
    const uname = (isBoss ? 'boss' : username).trim().toLowerCase();
    const nm = isBoss ? 'Boss' : name.trim();
    if (!/^[a-z0-9._-]{2,30}$/.test(uname)) { setMsg('Username: letters, numbers . _ - (2 to 30 characters).'); return; }
    if (!nm) { setMsg('Enter a name.'); return; }
    if (password.length < 6) { setMsg('The password needs at least 6 characters.'); return; }
    setBusy(true);
    try {
      const uid = await createAccount(uname, password);
      await setDoc(doc(db, 'hubUsers', uid), { name: nm, username: uname, role, orgId: o, active: true, createdAt: Date.now() });
      setMsg('Account created: ' + uname);
      setName(''); setUsername(''); setPassword('');
    } catch (err: any) {
      setMsg(err && err.code === 'auth/email-already-in-use' ? 'That username already exists.' : (err && err.message) || 'Could not create the account.');
    } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <div>
        <h1>Team</h1>
        <p className="sub">Create accounts. A boss account needs a password only and signs in from the Boss tab.</p>
      </div>
      <div className="two">
        <form className="card" onSubmit={create}>
          <h2>New account</h2>
          <div className="fld">
            <select value={role} onChange={(e) => setRole(e.target.value as Profile['role'])}>
              {ROLES.map((r) => <option key={r} value={r}>{r === 'technician' ? 'admin (technician)' : r}</option>)}
            </select>
          </div>
          {!isBoss && <div className="fld"><input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} /></div>}
          {!isBoss && <div className="fld"><input placeholder="Username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} /></div>}
          <div className="fld"><input type="text" placeholder="Password (min 6)" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {msg && <p className="hint">{msg}</p>}
          <button className="btn wide" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
        <div className="card">
          <h2>Accounts · {users.length}</h2>
          {reveal && (
            <div className="hint" style={{ background: '#eef5fa', padding: '10px 12px', borderRadius: 12 }}>
              New password for <b>{reveal.username}</b>: <code>{reveal.password}</code>{' '}
              <button className="small" onClick={() => navigator.clipboard?.writeText(reveal.password)}>Copy</button>{' '}
              <button className="small" onClick={() => setReveal(null)}>Hide</button>
            </div>
          )}
          {users.map((u) => (
            <div className="item" key={u.id}>
              <div className="t"><b>{u.name}</b><span>{u.username} · {u.role}{u.active === false ? ' · disabled' : ''}</span></div>
              {u.id !== profile!.uid && (
                <span className="rowbtns">
                  <button className="small" onClick={() => updateDoc(doc(db, 'hubUsers', u.id), { active: u.active === false }).catch(console.error)}>
                    {u.active === false ? 'Enable' : 'Disable'}
                  </button>
                  {resetTarget === u.id ? (
                    <>
                      <input className="pwdraft" placeholder="New password (blank = random)" value={resetDraft} onChange={(e) => setResetDraft(e.target.value)} autoFocus />
                      <button className="small" disabled={resetBusy === u.id} onClick={() => resetFor(u, resetDraft)}>{resetBusy === u.id ? '...' : 'Confirm'}</button>
                      <button className="small" onClick={() => { setResetTarget(''); setResetDraft(''); }}>Cancel</button>
                    </>
                  ) : (
                    <button className="small" onClick={() => { setResetTarget(u.id); setResetDraft(''); setReveal(null); }}>Reset password</button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}