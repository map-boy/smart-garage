import { useState, FormEvent } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "../auth";

export function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await signIn(email, password); }
    catch (e: any) {
      const code = e?.code ?? "";
      setErr(code === "auth/network-request-failed"
        ? "No internet. You must sign in once with a connection; after that the app works offline."
        : code === "auth/invalid-credential" || code === "auth/wrong-password"
        ? "Wrong email or password."
        : e?.message ?? "Could not sign in.");
    } finally { setBusy(false); }
  };

  return (
    <div className="main" style={{ justifyContent: "center" }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900 }}>Garage <span style={{ color: "#f5b921" }}>Reception</span></h1>
        <p style={{ color: "#8e97ad", fontSize: 13, marginTop: 6 }}>Log every vehicle that comes through the gate.</p>
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="f">
          <label>Email</label>
          <input type="email" required autoComplete="username" inputMode="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="f">
          <label>Password</label>
          <input type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn" disabled={busy}>
          <LogIn size={16} style={{ verticalAlign: -3, marginRight: 8 }} />
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}