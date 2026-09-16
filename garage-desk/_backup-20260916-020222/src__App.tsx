import { useEffect, useState } from "react";
import {
  verifyLogin,
  addClient,
  listClients,
  deleteClient,
  addStockItem,
  updateStockQty,
  deleteStockItem,
  listStock,
  checkInternet,
  logCrash,
  type Client,
  type StockItem,
} from "./db";
import { flushSyncQueue } from "./sync";

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

function ReceptionScreen() {
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [location, setLocation] = useState("");
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
      await addClient(name, phone, plate, model, location, issue);
      setName(""); setPhone(""); setPlate(""); setModel(""); setLocation(""); setIssue("");
      await refresh();
      flushSyncQueue();
    } catch (err) {
      logCrash("reception", err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async (id: string, clientName: string) => {
    if (!window.confirm(`Delete "${clientName}"? This cannot be undone.`)) return;
    try {
      await deleteClient(id);
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
        <input className="input-field" placeholder="Vehicle model" value={model} onChange={(e) => setModel(e.target.value)} />
        <input className="input-field" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
        <input className="input-field" placeholder="Issue" value={issue} onChange={(e) => setIssue(e.target.value)} />
        <button className="btn" onClick={submit}>Add Client</button>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Phone</th><th>Plate</th><th>Model</th><th>Location</th><th>Issue</th><th>Synced</th><th></th></tr></thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td><td>{c.phone}</td><td>{c.vehicle_plate}</td>
              <td>{c.vehicle_model}</td><td>{c.location}</td><td>{c.issue}</td>
              <td className={c.synced ? "pill-yes" : "pill-pending"}>{c.synced ? "Yes" : "Pending"}</td>
              <td>
                <button className="qty-btn" onClick={() => remove(c.id, c.name)} style={{ color: "#c00" }}>Delete</button>
              </td>
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
  const [category, setCategory] = useState("General");
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
      await addStockItem(name, parseInt(qty, 10), parseFloat(price || "0"), category || "General");
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

  const remove = async (id: string, itemName: string) => {
    if (!window.confirm(`Delete "${itemName}"? This cannot be undone.`)) return;
    try {
      await deleteStockItem(id);
      await refresh();
      flushSyncQueue();
    } catch (err) {
      logCrash("stock", err instanceof Error ? err.message : String(err));
    }
  };

  const groups = items.reduce<Record<string, StockItem[]>>((acc, it) => {
    const key = it.category || "General";
    (acc[key] ||= []).push(it);
    return acc;
  }, {});

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
        <input className="input-field" placeholder="Category (e.g. Cleaning tools)" value={category} onChange={(e) => setCategory(e.target.value)} />
        <button className="btn" onClick={submit}>Add Item</button>
      </div>
      {Object.entries(groups).map(([groupName, groupItems]) => (
        <div key={groupName} style={{ marginTop: 16 }}>
          <h4 style={{ margin: "8px 0" }}>{groupName}</h4>
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Synced</th><th>Adjust</th><th></th></tr></thead>
            <tbody>
              {groupItems.map((it) => (
                <tr key={it.id}>
                  <td>{it.name}</td><td>{it.qty}</td><td>{it.unit_price}</td>
                  <td className={it.synced ? "pill-yes" : "pill-pending"}>{it.synced ? "Yes" : "Pending"}</td>
                  <td>
                    <button className="qty-btn" onClick={() => adjust(it.id, -1, it.qty)}>-1</button>
                    <button className="qty-btn" onClick={() => adjust(it.id, 1, it.qty)}>+1</button>
                  </td>
                  <td>
                    <button className="qty-btn" onClick={() => remove(it.id, it.name)} style={{ color: "#c00" }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<"reception" | "stock">("reception");

  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;

  return (
    <div>
      <div className="page-header" style={{ padding: "8px 16px", borderBottom: "1px solid #eee", display: "flex", gap: 8 }}>
        <button className="btn" onClick={() => setTab("reception")} style={{ opacity: tab === "reception" ? 1 : 0.5 }}>
          Reception
        </button>
        <button className="btn" onClick={() => setTab("stock")} style={{ opacity: tab === "stock" ? 1 : 0.5 }}>
          Stock
        </button>
      </div>
      {tab === "reception" ? <ReceptionScreen /> : <StockScreen />}
    </div>
  );
}
