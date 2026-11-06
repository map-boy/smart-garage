import { FormEvent, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, toEmail } from '../firebase';

type Mode = 'boss' | 'admin' | 'staff';
const LABEL: Record<Mode, string> = { boss: 'Boss', admin: 'Admin', staff: 'Staff' };

export default function Login() {
  const [mode, setMode] = useState<Mode>('boss');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function go(e: FormEvent) {
    e.preventDefault();
    setErr('');
    const username = mode === 'staff' ? u : mode;
    if (!username.trim() || !p) { setErr(mode === 'staff' ? 'Enter your username and password.' : 'Enter the password.'); return; }
    setBusy(true);
    try { await signInWithEmailAndPassword(auth, toEmail(username), p); }
    catch { setErr('Wrong ' + (mode === 'staff' ? 'username or password' : 'password') + ' (the first login needs internet).'); }
    finally { setBusy(false); }
  }

  return (
    <div className="login">
      <form className="card lcard" onSubmit={go}>
        <h1>C &amp; V Smart Garage</h1>
        <p className="sub">Sign in as</p>
        <div className="seg">
          {(['boss', 'admin', 'staff'] as Mode[]).map((m) => (
            <button type="button" key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setErr(''); }}>{LABEL[m]}</button>
          ))}
        </div>
        {mode === 'staff' && (
          <div className="fld"><input placeholder="Username" autoComplete="username" autoCapitalize="none" value={u} onChange={(e) => setU(e.target.value)} /></div>
        )}
        <div className="fld"><input type="password" placeholder="Password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} autoFocus /></div>
        {err && <p className="err">{err}</p>}
        <button className="btn wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="hint">{mode === 'staff' ? 'Reception and workers use their username and password.' : 'Boss and Admin sign in with the password only.'}</p>
      </form>
    </div>
  );
}