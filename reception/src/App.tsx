import { useState } from "react";
import { Car, ListChecks, LogOut, WifiOff } from "lucide-react";
import { AuthProvider, useAuth } from "./auth";
import { SignIn } from "./screens/SignIn";
import { CheckIn } from "./screens/CheckIn";
import { Arrivals } from "./screens/Arrivals";

function Inner() {
  const { profile, loading, online, logout } = useAuth();
  const [tab, setTab] = useState<"in" | "list">("in");

  if (loading) return <div className="main"><p className="empty">Loading...</p></div>;
  if (!profile) return <SignIn />;

  return (
    <>
      <div className="bar">
        <h1>Garage <span>Reception</span></h1>
        <button className="btn ghost" style={{ width: "auto", padding: "8px 12px" }} onClick={logout}>
          <LogOut size={14} />
        </button>
      </div>
      {!online && <div className="off"><WifiOff size={12} style={{ verticalAlign: -2 }} /> Offline &mdash; check-ins are saved and sent when signal returns</div>}
      {tab === "in" ? <CheckIn onDone={() => setTab("list")} /> : <Arrivals />}
      <nav className="tabs">
        <button className={tab === "in" ? "on" : ""} onClick={() => setTab("in")}><Car size={20} />Check in</button>
        <button className={tab === "list" ? "on" : ""} onClick={() => setTab("list")}><ListChecks size={20} />Today</button>
      </nav>
    </>
  );
}

export function App() {
  return <div className="app"><AuthProvider><Inner /></AuthProvider></div>;
}