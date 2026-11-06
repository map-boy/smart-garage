import type { ComponentType } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import { useAuth, Profile } from './auth';
import { useOnline, usePending } from './hooks';
import Login from './pages/Login';
import Reception from './pages/Reception';
import Boss from './pages/Boss';
import Worker from './pages/Worker';
import Technician from './pages/Technician';

type Role = Profile['role'];
const NAV: { to: string; label: string; icon: string; roles: Role[]; page: ComponentType }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['technician', 'boss'], page: Boss },
  { to: '/reception', label: 'Reception', icon: '📋', roles: ['technician', 'secretary'], page: Reception },
  { to: '/jobs', label: 'My jobs', icon: '🔧', roles: ['technician', 'worker'], page: Worker },
  { to: '/team', label: 'Team', icon: '👥', roles: ['technician'], page: Technician }
];

function Blocked({ text }: { text: string }) {
  return (
    <div className="login">
      <div className="card lcard">
        <h1>C &amp; V Smart Garage</h1>
        <p className="sub">{text}</p>
        <button className="btn wide" onClick={() => signOut(auth)}>Sign out</button>
      </div>
    </div>
  );
}

function Shell({ profile }: { profile: Profile }) {
  const online = useOnline();
  const pending = usePending(profile.orgId);
  const items = NAV.filter((n) => n.roles.includes(profile.role));
  const home = items.length ? items[0].to : '/';
  const status = online ? 'Online' : 'Offline · saving on this device';
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">C &amp; V SMART GARAGE</div>
        <div className="me">
          <div className="avatar">{(profile.name || '?').charAt(0).toUpperCase()}</div>
          <div className="hi">Hi, {profile.name}!</div>
          <div className="role">{profile.role}</div>
        </div>
        <nav className="navs">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => 'nav' + (isActive ? ' on' : '')}>
              <span>{n.icon}</span><b>{n.label}</b>
            </NavLink>
          ))}
        </nav>
        <div className="grow" />
        <div className="sync">
          <span className={'dot ' + (online ? 'ok' : 'off')} /> {status}
          {pending > 0 && <em>⏳ {pending} waiting to sync</em>}
        </div>
        <button className="signout" onClick={() => signOut(auth)}>Sign out</button>
      </aside>
      <main className="main">
        <header className="top">
          <b>C &amp; V Smart Garage</b>
          <span><span className={'dot ' + (online ? 'ok' : 'off')} /> {online ? 'Online' : 'Offline'}{pending > 0 ? ` · ⏳ ${pending}` : ''}</span>
          <button onClick={() => signOut(auth)}>Sign out</button>
        </header>
        <Routes>
          {items.map((n) => <Route key={n.to} path={n.to} element={<n.page />} />)}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="splash">Loading…</div>;
  if (!user) return <Login />;
  if (!profile) return <Blocked text="This account has no profile in the app yet. Ask the admin." />;
  if (profile.active === false) return <Blocked text="This account is disabled. Ask the admin." />;
  return <Shell profile={profile} />;
}