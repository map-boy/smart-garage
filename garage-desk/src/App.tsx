import { useEffect, useState } from "react";
import {
  verifyLogin,
  addClient,
  listClients,
  addStockItem,
  updateStockQty,
  listStock,
  checkInternet,
  logCrash,
  type Client,
  type StockItem,
} from "./db";
import { flushSyncQueue } from "./sync";
import { redeemPairingCode, listDeviceSessions, type DeviceSession } from "./pairing";

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    try {
      const ok = await verifyLogin(password);
      if (ok) onSuccess();
      else setError("Wrong password");
    } catch (err) {
      setError("Login failed");
      logCrash("login", err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="screen-center">
      <div className="card">
        <h2>C &amp; V Smart Garage</h2>
        <input
          className="input-field"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus
        />
        <button className="btn" onClick={submit}>Login</button>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}

function PairingScreen({ role, onPaired }: { role: "reception" | "stock"; onPaired: (session: DeviceSession) => void }) {
  const [code, setCode] = useState("");
  const [staffName, setStaffName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code || !staffName) return;
    setBusy(true);
    setError("");
    try {
      const session = await redeemPairingCode(code, staffName, role);
      onPaired(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed");
      logCrash("pairing", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen-center">
      <div className="card">
        <h2>C &amp; V Smart Garage</h2>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          Pair this device as {role === "reception" ? "Receptionist" : "Stock Manager"}
        </p>
        <input
          className="input-field"
          placeholder="Pairing code from boss"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          className="input-field"
          placeholder="Your name"
          value={staffName}
          onChange={(e) => setStaffName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn" onClick={submit} disabled={busy}>
          {busy ? "Pairing..." : "Pair Device"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}

function RoleSelectScreen({
  sessions,
  onSelect,
}: {
  sessions: DeviceSession[];
  onSelect: (role: "reception" | "stock") => void;
}) {
  const reception = sessions.find((s) => s.role === "reception");
  const stock = sessions.find((s) => s.role === "stock");
  return (
    <div className="screen-center">
      <div className="card">
        <h2>C &amp; V Smart Garage</h2>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>Choose a role</p>
        <button className="btn" onClick={() => onSelect("reception")}>
          Receptionist{reception ? ` - ${reception.staff_name}` : " (pair)"}
        </button>
        <button className="btn" onClick={() => onSelect("stock")} style={{ marginTop: 8 }}>
          Stock Manager{stock ? ` - ${stock.staff_name}` : " (pair)"}
        </button>
      </div>
    </div>
  );
}

function ReceptionScreen() {
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [issue, setIssue] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);

  const refresh = async () => setClients(await listClients());

  useEffect(() => {
    refresh();
    checkInternet().then(setOnline);
    const id = setInterval(() => checkInternet().then(setOnline), 10000);
    return () => clearInterval(id);
  }, []);

  const submit = async () => {
    if (!name || !plate) return;
    try {
      await addClient(name, phone, plate, issue);
      setName(""); setPhone(""); setPlate(""); setIssue("");
      await refresh();
      flushSyncQueue();
    } catch (err) {
      logCrash("reception", err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h3>Reception</h3>
        {online !== null && (
          <span className={`status-badge ${online ? "status-online" : "status-offline"}`}>
            {online ? "Online" : "Offline - saved locally"}
          </span>
        )}
      </div>
      <div className="form-row">
        <input className="input-field" placeholder="Client name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input-field" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="input-field" placeholder="Vehicle plate" value={plate} onChange={(e) => setPlate(e.target.value)} />
        <input className="input-field" placeholder="Issue" value={issue} onChange={(e) => setIssue(e.target.value)} />
        <button className="btn" onClick={submit}>Add Client</button>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Phone</th><th>Plate</th><th>Issue</th><th>Synced</th></tr></thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td><td>{c.phone}</td><td>{c.vehicle_plate}</td><td>{c.issue}</td>
              <td className={c.synced ? "pill-yes" : "pill-pending"}>{c.synced ? "Yes" : "Pending"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StockScreen() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);

  const refresh = async () => setItems(await listStock());

  useEffect(() => {
    refresh();
    checkInternet().then(setOnline);
    const id = setInterval(() => checkInternet().then(setOnline), 10000);
    return () => clearInterval(id);
  }, []);

  const submit = async () => {
    if (!name || !qty) return;
    try {
      await addStockItem(name, parseInt(qty, 10), parseFloat(price || "0"));
      setName(""); setQty(""); setPrice("");
      await refresh();
      flushSyncQueue();
    } catch (err) {
      logCrash("stock", err instanceof Error ? err.message : String(err));
    }
  };

  const adjust = async (id: string, delta: number, currentQty: number) => {
    if (!online) {
      alert("No internet connection - cannot confirm this stock change is safe. Change saved locally and will sync when online.");
    }
    if (currentQty + delta < 0) {
      await logCrash("stock", `Attempted negative stock on item ${id}`);
      alert("This would take stock below zero. Recorded as an issue for the admin.");
      return;
    }
    try {
      await updateStockQty(id, delta);
      await refresh();
      flushSyncQueue();
    } catch (err) {
      logCrash("stock", err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h3>Stock</h3>
        {online !== null && (
          <span className={`status-badge ${online ? "status-online" : "status-offline"}`}>
            {online ? "Online" : "Offline - saved locally"}
          </span>
        )}
      </div>
      <div className="form-row">
        <input className="input-field" placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input-field" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input className="input-field" placeholder="Unit price" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button className="btn" onClick={submit}>Add Item</button>
      </div>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Synced</th><th>Adjust</th></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.name}</td><td>{it.qty}</td><td>{it.unit_price}</td>
              <td className={it.synced ? "pill-yes" : "pill-pending"}>{it.synced ? "Yes" : "Pending"}</td>
              <td>
                <button className="qty-btn" onClick={() => adjust(it.id, -1, it.qty)}>-1</button>
                <button className="qty-btn" onClick={() => adjust(it.id, 1, it.qty)}>+1</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [checkedSessions, setCheckedSessions] = useState(false);
  const [activeRole, setActiveRole] = useState<"reception" | "stock" | null>(null);

  useEffect(() => {
    if (!authed) return;
    listDeviceSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setCheckedSessions(true));
  }, [authed]);

  const handlePaired = (session: DeviceSession) => {
    setSessions((prev) => [...prev.filter((s) => s.role !== session.role), session]);
  };

  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;
  if (!checkedSessions) return <div className="screen-center">Loading...</div>;
  if (!activeRole) return <RoleSelectScreen sessions={sessions} onSelect={setActiveRole} />;

  const session = sessions.find((s) => s.role === activeRole);
  if (!session) {
    return <PairingScreen role={activeRole} onPaired={handlePaired} />;
  }

  return (
    <div>
      <div className="page-header" style={{ padding: "8px 16px", borderBottom: "1px solid #eee" }}>
        <span>{session.staff_name} &middot; {session.role === "reception" ? "Reception" : "Stock"}</span>
        <button className="btn" onClick={() => setActiveRole(null)}>Switch role</button>
      </div>
      {session.role === "reception" ? <ReceptionScreen /> : <StockScreen />}
    </div>
  );
}