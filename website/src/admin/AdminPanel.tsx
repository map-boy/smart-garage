import { useEffect, useState } from "react";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import type { SiteContent } from "../types";
import { DEFAULT_CONTENT } from "../content";
import { getFirebaseApp, getFirebaseAuth } from "../firebase";

const ALLOWED_EMAIL = "techubwenge@gmail.com";

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const app = getFirebaseApp();
  const auth = getFirebaseAuth();
  const [stage, setStage] = useState<"checking" | "signed_out" | "denied" | "unlocked">("checking");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [content, setContent] = useState<SiteContent>(DEFAULT_CONTENT);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!app || !auth) { setError("Firebase is not configured (missing VITE_FIREBASE_* env vars)."); return; }
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setUser(null); setStage("signed_out"); return; }
      if (u.email !== ALLOWED_EMAIL) {
        setError(`Signed in as ${u.email}, which is not an admin account.`);
        await signOut(auth);
        setUser(null);
        setStage("denied");
        return;
      }
      setUser(u);
      await loadContent();
      setStage("unlocked");
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadContent() {
    if (!app) return;
    const snap = await getDoc(doc(getFirestore(app), "site", "content"));
    setContent(snap.exists() ? { ...DEFAULT_CONTENT, ...(snap.data() as Partial<SiteContent>) } : DEFAULT_CONTENT);
  }

  async function handleSignIn() {
    if (!auth) return;
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e: any) {
      setError(e?.message ?? "Sign-in failed.");
    }
  }

  async function handleSave() {
    if (!app) return;
    setSaving(true);
    try {
      await setDoc(doc(getFirestore(app), "site", "content"), { ...content, updatedAt: new Date().toISOString() });
      setSavedAt(new Date().toLocaleTimeString());
    } finally { setSaving(false); }
  }

  async function uploadImage(file: File): Promise<string> {
    if (!app) throw new Error("no app");
    const storage = getStorage(app);
    const r = ref(storage, `site-images/${Date.now()}-${file.name}`);
    await uploadBytes(r, file);
    return getDownloadURL(r);
  }

  function set<K extends keyof SiteContent>(key: K, value: SiteContent[K]) {
    setContent(c => ({ ...c, [key]: value }));
  }

  return (
    <div className="admin-overlay">
      <div className="admin-panel">
        <button className="admin-close" onClick={onClose}>&times;</button>
        {error && stage !== "unlocked" && <p className="admin-error">{error}</p>}
        {stage === "checking" && <p>Loading…</p>}

        {(stage === "signed_out" || stage === "denied") && (
          <div className="admin-lock">
            <h2>Admin sign-in</h2>
            <p>Sign in with the {ALLOWED_EMAIL} Google account to manage this site.</p>
            <button className="btn" onClick={handleSignIn}>Sign in with Google</button>
          </div>
        )}

        {stage === "unlocked" && (
          <div className="admin-body">
            <div className="admin-header">
              <h2>Control Room</h2>
              <div>
                {savedAt && <span className="admin-saved">Saved {savedAt}</span>}
                <span className="admin-saved">{user?.email}</span>
                <button className="btn" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save changes"}</button>
                <button className="admin-remove" onClick={() => auth && signOut(auth)}>Sign out</button>
              </div>
            </div>

            <Section title="Brand">
              <Field label="Name" value={content.brand.name} onChange={v => set("brand", { ...content.brand, name: v })} />
              <Field label="Tagline" value={content.brand.tagline} onChange={v => set("brand", { ...content.brand, tagline: v })} />
              <ImageField label="Logo" value={content.brand.logoUrl ?? ""} onUpload={async f => set("brand", { ...content.brand, logoUrl: await uploadImage(f) })} />
            </Section>

            <Section title="Top bar">
              <Field label="Address" value={content.topBar.address} onChange={v => set("topBar", { ...content.topBar, address: v })} />
              <Field label="Emergency phone" value={content.topBar.emergencyPhone} onChange={v => set("topBar", { ...content.topBar, emergencyPhone: v })} />
              <Field label="Hours" value={content.topBar.hours} onChange={v => set("topBar", { ...content.topBar, hours: v })} />
              <Field label="Promo" value={content.topBar.promo ?? ""} onChange={v => set("topBar", { ...content.topBar, promo: v })} />
            </Section>

            <Section title="Hero">
              <Field label="Eyebrow" value={content.hero.eyebrow} onChange={v => set("hero", { ...content.hero, eyebrow: v })} />
              <Field label="Title lead" value={content.hero.titleLead} onChange={v => set("hero", { ...content.hero, titleLead: v })} />
              <Field label="Title accent" value={content.hero.titleAccent} onChange={v => set("hero", { ...content.hero, titleAccent: v })} />
              <Field label="Title tail" value={content.hero.titleTail} onChange={v => set("hero", { ...content.hero, titleTail: v })} />
              <Field label="Title accent 2" value={content.hero.titleAccent2} onChange={v => set("hero", { ...content.hero, titleAccent2: v })} />
              <TextAreaField label="Body" value={content.hero.body} onChange={v => set("hero", { ...content.hero, body: v })} />
              <Field label="CTA label" value={content.hero.ctaLabel} onChange={v => set("hero", { ...content.hero, ctaLabel: v })} />
              <ImageField label="Background image" value={content.hero.backgroundUrl} onUpload={async f => set("hero", { ...content.hero, backgroundUrl: await uploadImage(f) })} />
            </Section>

            <Section title="Highlights">
              {content.highlights.map((h, i) => (
                <div className="admin-row" key={i}>
                  <Field label="Title" value={h.title} onChange={v => { const arr = [...content.highlights]; arr[i] = { ...h, title: v }; set("highlights", arr); }} />
                  <TextAreaField label="Body" value={h.body} onChange={v => { const arr = [...content.highlights]; arr[i] = { ...h, body: v }; set("highlights", arr); }} />
                  <button className="admin-remove" onClick={() => set("highlights", content.highlights.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              <button className="admin-add" onClick={() => set("highlights", [...content.highlights, { title: "New highlight", body: "" }])}>+ Add highlight</button>
            </Section>

            <Section title="About">
              <Field label="Eyebrow" value={content.about.eyebrow} onChange={v => set("about", { ...content.about, eyebrow: v })} />
              <Field label="Title" value={content.about.title} onChange={v => set("about", { ...content.about, title: v })} />
              <TextAreaField label="Body" value={content.about.body} onChange={v => set("about", { ...content.about, body: v })} />
              <Field label="Satisfaction %" value={String(content.about.satisfactionPct)} onChange={v => set("about", { ...content.about, satisfactionPct: Number(v) || 0 })} />
              <Field label="Phone" value={content.about.phone} onChange={v => set("about", { ...content.about, phone: v })} />
              <Field label="Badges (comma separated)" value={content.about.badges.join(", ")} onChange={v => set("about", { ...content.about, badges: v.split(",").map(s => s.trim()).filter(Boolean) })} />
              <ImageField label="Photo" value={content.about.imageUrl} onUpload={async f => set("about", { ...content.about, imageUrl: await uploadImage(f) })} />
            </Section>

            <Section title="Services">
              <Field label="Eyebrow" value={content.services.eyebrow} onChange={v => set("services", { ...content.services, eyebrow: v })} />
              <Field label="Title lead" value={content.services.titleLead} onChange={v => set("services", { ...content.services, titleLead: v })} />
              <Field label="Title accent" value={content.services.titleAccent} onChange={v => set("services", { ...content.services, titleAccent: v })} />
              <TextAreaField label="Intro" value={content.services.intro} onChange={v => set("services", { ...content.services, intro: v })} />
              {content.services.items.map((s, i) => (
                <div className="admin-row" key={i}>
                  <Field label="Title" value={s.title} onChange={v => { const arr = [...content.services.items]; arr[i] = { ...s, title: v }; set("services", { ...content.services, items: arr }); }} />
                  <TextAreaField label="Body" value={s.body} onChange={v => { const arr = [...content.services.items]; arr[i] = { ...s, body: v }; set("services", { ...content.services, items: arr }); }} />
                  <Field label="Icon (lucide name)" value={s.icon} onChange={v => { const arr = [...content.services.items]; arr[i] = { ...s, icon: v }; set("services", { ...content.services, items: arr }); }} />
                  <Field label="From price" value={String(s.fromPrice)} onChange={v => { const arr = [...content.services.items]; arr[i] = { ...s, fromPrice: Number(v) || 0 }; set("services", { ...content.services, items: arr }); }} />
                  <Field label="Currency" value={s.currency} onChange={v => { const arr = [...content.services.items]; arr[i] = { ...s, currency: v }; set("services", { ...content.services, items: arr }); }} />
                  <TextAreaField label="Detail (shown on Read more)" value={s.detail ?? ""} onChange={v => { const arr = [...content.services.items]; arr[i] = { ...s, detail: v }; set("services", { ...content.services, items: arr }); }} />
                  <ImageField label="Image" value={s.imageUrl} onUpload={async f => { const url = await uploadImage(f); const arr = [...content.services.items]; arr[i] = { ...s, imageUrl: url }; set("services", { ...content.services, items: arr }); }} />
                  <button className="admin-remove" onClick={() => set("services", { ...content.services, items: content.services.items.filter((_, j) => j !== i) })}>Remove service</button>
                </div>
              ))}
              <button className="admin-add" onClick={() => set("services", { ...content.services, items: [...content.services.items, { title: "New service", body: "", imageUrl: "", icon: "Wrench", fromPrice: 0, currency: "RWF", detail: "" }] })}>+ Add service</button>
            </Section>

            <Section title="Contact channels">
              <Field label="WhatsApp number (digits only)" value={content.whatsapp} onChange={v => set("whatsapp", v)} />
              <Field label="Map link" value={content.mapUrl} onChange={v => set("mapUrl", v)} />
              <Field label="Service area" value={content.serviceArea} onChange={v => set("serviceArea", v)} />
            </Section>

            <Section title="Opening hours">
              {content.hours.map((h, i) => (
                <div className="admin-row" key={i}>
                  <Field label="Days" value={h.days} onChange={v => { const arr = [...content.hours]; arr[i] = { ...h, days: v }; set("hours", arr); }} />
                  <Field label="Hours" value={h.open} onChange={v => { const arr = [...content.hours]; arr[i] = { ...h, open: v }; set("hours", arr); }} />
                  <button className="admin-remove" onClick={() => set("hours", content.hours.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              <button className="admin-add" onClick={() => set("hours", [...content.hours, { days: "Saturday", open: "08:00 - 14:00" }])}>+ Add row</button>
            </Section>

            <Section title="Questions people ask">
              {content.faq.map((f, i) => (
                <div className="admin-row" key={i}>
                  <Field label="Question" value={f.q} onChange={v => { const arr = [...content.faq]; arr[i] = { ...f, q: v }; set("faq", arr); }} />
                  <TextAreaField label="Answer" value={f.a} onChange={v => { const arr = [...content.faq]; arr[i] = { ...f, a: v }; set("faq", arr); }} />
                  <button className="admin-remove" onClick={() => set("faq", content.faq.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              <button className="admin-add" onClick={() => set("faq", [...content.faq, { q: "New question", a: "" }])}>+ Add question</button>
            </Section>

            <Section title="Request panel wording">
              <Field label="Eyebrow" value={content.requestPanel.eyebrow} onChange={v => set("requestPanel", { ...content.requestPanel, eyebrow: v })} />
              <Field label="Title" value={content.requestPanel.title} onChange={v => set("requestPanel", { ...content.requestPanel, title: v })} />
              <TextAreaField label="Body" value={content.requestPanel.body} onChange={v => set("requestPanel", { ...content.requestPanel, body: v })} />
              <Field label="Thank-you title" value={content.requestPanel.successTitle} onChange={v => set("requestPanel", { ...content.requestPanel, successTitle: v })} />
              <TextAreaField label="Thank-you body" value={content.requestPanel.successBody} onChange={v => set("requestPanel", { ...content.requestPanel, successBody: v })} />
            </Section>

            <Section title="Search listing">
              <Field label="Page title" value={content.seo.title} onChange={v => set("seo", { ...content.seo, title: v })} />
              <TextAreaField label="Description" value={content.seo.description} onChange={v => set("seo", { ...content.seo, description: v })} />
            </Section>

            <Section title="Contact / Footer">
              <Field label="Headline" value={content.contact.headline} onChange={v => set("contact", { ...content.contact, headline: v })} />
              <Field label="Phone" value={content.contact.phone} onChange={v => set("contact", { ...content.contact, phone: v })} />
              <Field label="Email" value={content.contact.email} onChange={v => set("contact", { ...content.contact, email: v })} />
              <Field label="Address" value={content.contact.address} onChange={v => set("contact", { ...content.contact, address: v })} />
            </Section>

            <div className="admin-footer">
              <button className="btn" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save changes"}</button>
              <button className="admin-reset" onClick={() => { if (confirm("Reset all content to the built-in defaults? Not saved until you click Save.")) setContent(DEFAULT_CONTENT); }}>Reset to defaults</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="admin-section"><legend>{title}</legend>{children}</fieldset>;
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="admin-field"><span>{label}</span><input value={value} onChange={e => onChange(e.target.value)} /></label>;
}
function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="admin-field"><span>{label}</span><textarea rows={3} value={value} onChange={e => onChange(e.target.value)} /></label>;
}
function ImageField({ label, value, onUpload }: { label: string; value: string; onUpload: (f: File) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="admin-field">
      <span>{label}</span>
      {value && <img src={value} alt="" className="admin-thumb" />}
      <input type="file" accept="image/*" disabled={busy} onChange={async e => {
        const f = e.target.files?.[0]; if (!f) return;
        setBusy(true); try { await onUpload(f); } finally { setBusy(false); }
      }} />
      {busy && <span>Uploading…</span>}
    </label>
  );
}
