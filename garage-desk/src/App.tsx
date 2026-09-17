import { useEffect, useState } from "react";
import {
  verifyLogin,
  listClients,
  addVisit,
  listVisits,
  deleteVisit,
  updateVisit,
  addStockItem,
  updateStockQty,
  deleteStockItem,
  setStockItemGroup,
  listStock,
  listStockGroups,
  addStockGroup,
  renameStockGroup,
  deleteStockGroup,
  checkInternet,
  logCrash,
  type Client,
  type Visit,
  type StockItem,
  type StockGroup,
} from "./db";
import { flushSyncQueue } from "./sync";
import { exportReport } from "./db";

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
  const [visits, setVisits] = useState<Visit[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [location, setLocation] = useState("");
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Visit | null>(null);

  const refresh = async () => {
    const [v, c] = await Promise.all([listVisits(), listClients()]);
    setVisits(v);
    setClients(c);
  };

  useEffect(() => {
    refresh();
    checkInternet().then(setOnline);
    const id = setInterval(() => checkInternet().then(setOnline), 10000);
    return () => clearInterval(id);
  }, []);

  const suggestions = name.trim().length
    ? clients.filter((c) => c.name.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 6)
    : [];

  const pickClient = (c: Client) => {
    setSelectedClientId(c.id);
    setName(c.name);
    setPhone(c.phone);
    setPlate(c.vehicle_plate);
    setModel(c.vehicle_model);
    setLocation(c.location);
    setShowSuggestions(false);
  };

  const submit = async () => {
    if (!name || !plate) return;
    try {
      await addVisit(selectedClientId, name, phone, plate, model, location, "", visitDate);
      setName(""); setPhone(""); setPlate(""); setModel(""); setLocation("");
      setVisitDate(new Date().toISOString().slice(0, 10));
      setSelectedClientId(null);
      await refresh();
      flushSyncQueue();
    } catch (err) {
      logCrash("reception", err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async (id: string, clientName: string) => {
    if (!window.confirm(`Delete ${clientName}'s visit? This cannot be undone.`)) return;
    try {
      await deleteVisit(id);
      await refresh();
      flushSyncQueue();
    } catch (err) {
      logCrash("reception", err instanceof Error ? err.message : String(err));
    }
  };

  const startEdit = (v: Visit) => {
    setEditingId(v.id);
    setEditDraft({ ...v });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    try {
      await updateVisit(
        editDraft.id,
        editDraft.name,
        editDraft.phone,
        editDraft.vehicle_plate,
        editDraft.vehicle_model,
        editDraft.location,
        editDraft.visit_date
      );
      setEditingId(null);
      setEditDraft(null);
      await refresh();
      flushSyncQueue();
    } catch (err) {
      logCrash("reception", err instanceof Error ? err.message : String(err));
    }
  };

  const toggleDate = (date: string) =>
    setCollapsedDates((c) => ({ ...c, [date]: !c[date] }));

  const grouped: Record<string, Visit[]> = {};
  for (const v of visits) {
    (grouped[v.visit_date] ??= []).push(v);
  }
  const dates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="page">
      <div className="page-header">
        <h3>Reception</h3>
        <button
          className="input-field"
          style={{ marginLeft: 12, cursor: "pointer" }}
          onClick={async () => {
            const d = new Date();
            const day = d.toISOString().slice(0, 10);
            const path = await exportReport("daily", day);
            alert("Saved: " + path);
          }}
        >Export Daily</button>
        <button
          className="input-field"
          style={{ marginLeft: 8, cursor: "pointer" }}
          onClick={async () => {
            const d = new Date();
            const month = d.toISOString().slice(0, 7);
            const path = await exportReport("monthly", month);
            alert("Saved: " + path);
          }}
        >Export Monthly</button>
        {online !== null && (
          <span className={`status-badge ${online ? "status-online" : "status-offline"}`}>
            {online ? "Online" : "Offline - saved locally"}
          </span>
        )}
      </div>
      <div className="form-row">
        <div style={{ position: "relative" }}>
          <input
            className="input-field"
            placeholder="Client name"
            value={name}
            onChange={(e) => { setName(e.target.value); setSelectedClientId(null); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #ccc", zIndex: 10, maxHeight: 180, overflowY: "auto" }}>
              {suggestions.map((c) => (
                <div key={c.id} style={{ padding: "6px 10px", cursor: "pointer" }} onMouseDown={() => pickClient(c)}>
                  {c.name} {c.vehicle_plate ? `- ${c.vehicle_plate}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
        <input className="input-field" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="input-field" placeholder="Vehicle plate" value={plate} onChange={(e) => setPlate(e.target.value)} />
        <input className="input-field" placeholder="Vehicle model" value={model} onChange={(e) => setModel(e.target.value)} />
        <input className="input-field" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
        <input className="input-field" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
        <button className="btn" onClick={submit}>{selectedClientId ? "Mark as came" : "Add Client"}</button>
      </div>

      {dates.map((date) => {
        const rows = grouped[date];
        const isShut = !!collapsedDates[date];
        return (
          <div key={date} className="group-block">
            <div className="group-header">
              <button className="group-toggle" onClick={() => toggleDate(date)}>
                <span className="group-caret">{isShut ? "\u25B8" : "\u25BE"}</span>
                {date}
                <span className="group-count">{rows.length}</span>
              </button>
            </div>
            {!isShut && (
              <table>
                <thead><tr><th>Name</th><th>Phone</th><th>Plate</th><th>Model</th><th>Location</th><th>Date</th><th>Synced</th><th></th></tr></thead>
                <tbody>
                  {rows.map((v) => {
                    const isEditing = editingId === v.id;
                    if (isEditing && editDraft) {
                      return (
                        <tr key={v.id}>
                          <td><input className="input-field" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></td>
                          <td><input className="input-field" value={editDraft.phone} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} /></td>
                          <td><input className="input-field" value={editDraft.vehicle_plate} onChange={(e) => setEditDraft({ ...editDraft, vehicle_plate: e.target.value })} /></td>
                          <td><input className="input-field" value={editDraft.vehicle_model} onChange={(e) => setEditDraft({ ...editDraft, vehicle_model: e.target.value })} /></td>
                          <td><input className="input-field" value={editDraft.location} onChange={(e) => setEditDraft({ ...editDraft, location: e.target.value })} /></td>
                          <td><input className="input-field" type="date" value={editDraft.visit_date} onChange={(e) => setEditDraft({ ...editDraft, visit_date: e.target.value })} /></td>
                          <td className={v.synced ? "pill-yes" : "pill-pending"}>{v.synced ? "Yes" : "Pending"}</td>
                          <td>
                            <button className="qty-btn" onClick={saveEdit}>Save</button>
                            <button className="qty-btn" onClick={cancelEdit}>Cancel</button>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={v.id}>
                        <td>{v.name}</td><td>{v.phone}</td><td>{v.vehicle_plate}</td>
                        <td>{v.vehicle_model}</td><td>{v.location}</td><td>{v.visit_date}</td>
                        <td className={v.synced ? "pill-yes" : "pill-pending"}>{v.synced ? "Yes" : "Pending"}</td>
                        <td>
                          <button className="qty-btn" onClick={() => startEdit(v)}>Edit</button>
                          <button className="qty-btn" onClick={() => remove(v.id, v.name)} style={{ color: "#c00" }}>Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StockScreen() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [takeAmounts, setTakeAmounts] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [groupId, setGroupId] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);

  const refresh = async () => {
    const [g, i] = await Promise.all([listStockGroups(), listStock()]);
    setGroups(g);
    setItems(i);
    setGroupId((cur) => (cur && g.some((x) => x.id === cur) ? cur : (g[0]?.id ?? "")));
  };

  useEffect(() => {
    refresh();
    checkInternet().then(setOnline);
    const id = setInterval(() => checkInternet().then(setOnline), 10000);
    return () => clearInterval(id);
  }, []);

  const fail = (err: unknown) =>
    logCrash("stock", err instanceof Error ? err.message : String(err));

  const submit = async () => {
    const qtyNum = parseFloat(qty);
    const priceNum = parseFloat(price || "0");
    if (!name.trim() || !Number.isFinite(qtyNum) || qtyNum < 0 || !Number.isFinite(priceNum)) {
      alert("Enter a valid item name and a whole-number quantity.");
      return;
    }
    try {
      await addStockItem(name.trim(), qtyNum, priceNum, groupId || null);
      setName(""); setQty(""); setPrice("");
      await refresh();
      flushSyncQueue();
    } catch (err) { fail(err); }
  };

  const createGroup = async () => {
    const n = newGroup.trim();
    if (!n) return;
    try {
      const g = await addStockGroup(n);
      setNewGroup("");
      await refresh();
      setGroupId(g.id);
      flushSyncQueue();
    } catch (err) {
      fail(err);
      alert("Could not create that group.");
    }
  };

  const rename = async (g: StockGroup) => {
    const next = window.prompt(`Rename "${g.name}" to:`, g.name);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === g.name) return;
    try {
      await renameStockGroup(g.id, trimmed);
      await refresh();
      flushSyncQueue();
    } catch (err) {
      fail(err);
      alert("Could not rename that group.");
    }
  };

  const removeGroup = async (g: StockGroup) => {
    const count = items.filter((i) => i.group_id === g.id).length;
    const msg = count
      ? `Delete group "${g.name}"? Its ${count} item(s) will move to General.`
      : `Delete group "${g.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteStockGroup(g.id);
      await refresh();
      flushSyncQueue();
    } catch (err) {
      fail(err);
      alert("That group could not be removed.");
    }
  };

  const move = async (itemId: string, targetGroupId: string) => {
    try {
      await setStockItemGroup(itemId, targetGroupId);
      await refresh();
      flushSyncQueue();
    } catch (err) { fail(err); }
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
    } catch (err) { fail(err); }
  };

  const remove = async (id: string, itemName: string) => {
    if (!window.confirm(`Delete "${itemName}"? This cannot be undone.`)) return;
    try {
      await deleteStockItem(id);
      await refresh();
      flushSyncQueue();
    } catch (err) { fail(err); }
  };

  const toggle = (id: string) =>
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const orphans = items.filter(
    (i) => !i.group_id || !groups.some((g) => g.id === i.group_id)
  );

  const renderRows = (rows: StockItem[]) => (
    <table>
      <thead>
        <tr><th>Item</th><th>Qty</th><th>Price</th><th>Group</th><th>Synced</th><th>Adjust</th><th></th></tr>
      </thead>
      <tbody>
        {rows.map((it) => (
          <tr key={it.id}>
            <td>{it.name}</td>
            <td>{Number(it.qty.toFixed(2))}</td>
            <td>{it.unit_price}</td>
            <td>
              <select
                className="input-field group-select"
                value={it.group_id ?? ""}
                onChange={(e) => move(it.id, e.target.value)}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </td>
            <td className={it.synced ? "pill-yes" : "pill-pending"}>{it.synced ? "Yes" : "Pending"}</td>
            <td>
              <button className="qty-btn" onClick={() => adjust(it.id, 1, it.qty)}>+1</button>
              <input
                className="input-field qty-take-input"
                type="number"
                step="any"
                min="0"
                placeholder="amount"
                value={takeAmounts[it.id] ?? ""}
                onChange={(e) => setTakeAmounts((m) => ({ ...m, [it.id]: e.target.value }))}
              />
              <button
                className="qty-btn"
                onClick={() => {
                  const amt = parseFloat(takeAmounts[it.id] ?? "");
                  if (!Number.isFinite(amt) || amt <= 0) {
                    alert("Enter a valid amount to take out.");
                    return;
                  }
                  adjust(it.id, -amt, it.qty);
                  setTakeAmounts((m) => ({ ...m, [it.id]: "" }));
                }}
              >
                Take out
              </button>
            </td>
            <td>
              <button className="qty-btn" onClick={() => remove(it.id, it.name)} style={{ color: "#c00" }}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

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
        <select className="input-field" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button className="btn" onClick={submit}>Add Item</button>
      </div>

      <div className="form-row">
        <input
          className="input-field"
          placeholder="New group (e.g. Car Wash)"
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createGroup()}
        />
        <button className="btn btn-secondary" onClick={createGroup}>Add Group</button>
      </div>

      {groups.map((g) => {
        const rows = items.filter((i) => i.group_id === g.id);
        const isShut = !!collapsed[g.id];
        return (
          <div key={g.id} className="group-block">
            <div className="group-header">
              <button className="group-toggle" onClick={() => toggle(g.id)}>
                <span className="group-caret">{isShut ? "\u25B8" : "\u25BE"}</span>
                {g.name}
                <span className="group-count">{rows.length}</span>
              </button>
              <span className="group-actions">
                <button className="qty-btn" onClick={() => rename(g)}>Rename</button>
                {g.name !== "General" && (
                  <button className="qty-btn" onClick={() => removeGroup(g)} style={{ color: "#c00" }}>Delete</button>
                )}
              </span>
            </div>
            {!isShut && (rows.length ? renderRows(rows) : <p className="group-empty">Nothing in this group yet.</p>)}
          </div>
        );
      })}

      {orphans.length > 0 && (
        <div className="group-block">
          <div className="group-header">
            <button className="group-toggle" onClick={() => toggle("__orphans")}>
              <span className="group-caret">{collapsed["__orphans"] ? "\u25B8" : "\u25BE"}</span>
              Ungrouped
              <span className="group-count">{orphans.length}</span>
            </button>
          </div>
          {!collapsed["__orphans"] && renderRows(orphans)}
        </div>
      )}
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