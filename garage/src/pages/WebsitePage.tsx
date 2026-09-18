import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Globe, RotateCcw, Save } from 'lucide-react';
import { db } from '../lib/firebase';
import { storage } from '../lib/storage';
import { settleWrite } from '../lib/firestoreWrite';
import { Button } from '../components/ui/Button';
import { DangerConfirm } from '../components/ui/DangerConfirm';
import type { SiteContent } from '../../../shared/src/site';
import { DEFAULT_CONTENT } from '../../../shared/src/siteDefaults';

/**
 * The public website's content, edited from the admin app.
 *
 * This used to be a panel hidden inside the website itself, opened by clicking
 * the logo twenty times and guarded by one hard-coded Google account. That put
 * the only way to change what customers read behind an easter egg on the very
 * page it edits, with its own private idea of who counts as an admin.
 *
 * Here it sits behind the same sign-in as the rest of the business, and the
 * Firestore rules already say what matters: site/content is world-readable and
 * manager-writable, so this screen cannot grant anyone more than they had.
 */
export function WebsitePage() {
  const [content, setContent] = useState<SiteContent>(DEFAULT_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'site', 'content'));
        if (cancelled) return;
        // Merged over the defaults, so a document written by an older build
        // does not leave the editor with undefined fields to crash on.
        setContent(snap.exists()
          ? { ...DEFAULT_CONTENT, ...(snap.data() as Partial<SiteContent>) }
          : DEFAULT_CONTENT);
      } catch (e) {
        if (!cancelled) {
          setNotice(`Could not load the current site content: ${(e as Error).message}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function set<K extends keyof SiteContent>(key: K, value: SiteContent[K]) {
    setContent((c) => ({ ...c, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    const outcome = await settleWrite(
      setDoc(doc(db, 'site', 'content'), { ...content, updatedAt: new Date().toISOString() })
    );
    setSaving(false);
    setNotice(
      outcome.state === 'confirmed'
        ? 'Saved. The public site picks this up immediately - no deploy needed.'
        : outcome.state === 'refused'
          ? 'The database refused this. Only an owner or manager may change the ' +
            'public site, so this account cannot save here.'
          : 'Saved on this computer but not confirmed by the server yet. The ' +
            'public site will not show it until this uploads.'
    );
  }

  async function uploadImage(file: File): Promise<string> {
    const r = ref(storage, `site-images/${Date.now()}-${file.name}`);
    await uploadBytes(r, file);
    return getDownloadURL(r);
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading the current site content...</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl pb-12">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Globe className="w-5 h-5 text-gray-400" /> Public website
          </h1>
          <p className="text-sm text-gray-500">
            Every word and picture customers see. Changes go live as soon as they save.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      {notice && (
        <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-800">
          {notice}
        </div>
      )}

      <Section title="Brand">
        <Field label="Name" value={content.brand.name}
          onChange={(v) => set('brand', { ...content.brand, name: v })} />
        <Field label="Tagline" value={content.brand.tagline}
          onChange={(v) => set('brand', { ...content.brand, tagline: v })} />
        <ImageField label="Logo" value={content.brand.logoUrl ?? ''}
          onUpload={async (f) => set('brand', { ...content.brand, logoUrl: await uploadImage(f) })} />
      </Section>

      <Section title="Top bar">
        <Field label="Address" value={content.topBar.address}
          onChange={(v) => set('topBar', { ...content.topBar, address: v })} />
        <Field label="Emergency phone" value={content.topBar.emergencyPhone}
          onChange={(v) => set('topBar', { ...content.topBar, emergencyPhone: v })} />
        <Field label="Hours" value={content.topBar.hours}
          onChange={(v) => set('topBar', { ...content.topBar, hours: v })} />
        <Field label="Promo" value={content.topBar.promo ?? ''}
          onChange={(v) => set('topBar', { ...content.topBar, promo: v })} />
      </Section>

      <Section title="Hero">
        <Field label="Eyebrow" value={content.hero.eyebrow}
          onChange={(v) => set('hero', { ...content.hero, eyebrow: v })} />
        <Field label="Title lead" value={content.hero.titleLead}
          onChange={(v) => set('hero', { ...content.hero, titleLead: v })} />
        <Field label="Title accent" value={content.hero.titleAccent}
          onChange={(v) => set('hero', { ...content.hero, titleAccent: v })} />
        <Field label="Title tail" value={content.hero.titleTail}
          onChange={(v) => set('hero', { ...content.hero, titleTail: v })} />
        <Field label="Title accent 2" value={content.hero.titleAccent2}
          onChange={(v) => set('hero', { ...content.hero, titleAccent2: v })} />
        <TextAreaField label="Body" value={content.hero.body}
          onChange={(v) => set('hero', { ...content.hero, body: v })} />
        <Field label="Button label" value={content.hero.ctaLabel}
          onChange={(v) => set('hero', { ...content.hero, ctaLabel: v })} />
        <ImageField label="Background image" value={content.hero.backgroundUrl}
          onUpload={async (f) => set('hero', { ...content.hero, backgroundUrl: await uploadImage(f) })} />
      </Section>

      <Section title="Services">
        <Field label="Eyebrow" value={content.services.eyebrow}
          onChange={(v) => set('services', { ...content.services, eyebrow: v })} />
        <TextAreaField label="Intro" value={content.services.intro}
          onChange={(v) => set('services', { ...content.services, intro: v })} />
        {content.services.items.map((s, i) => (
          <div key={i} className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50/50">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
              Service {i + 1}
            </p>
            <Field label="Title" value={s.title} onChange={(v) => {
              const arr = [...content.services.items]; arr[i] = { ...s, title: v };
              set('services', { ...content.services, items: arr });
            }} />
            <TextAreaField label="Body" value={s.body} onChange={(v) => {
              const arr = [...content.services.items]; arr[i] = { ...s, body: v };
              set('services', { ...content.services, items: arr });
            }} />
            <Field label="From price" value={String(s.fromPrice)} onChange={(v) => {
              const arr = [...content.services.items];
              arr[i] = { ...s, fromPrice: Number(v) || 0 };
              set('services', { ...content.services, items: arr });
            }} />
            <ImageField label="Image" value={s.imageUrl} onUpload={async (f) => {
              const url = await uploadImage(f);
              const arr = [...content.services.items]; arr[i] = { ...s, imageUrl: url };
              set('services', { ...content.services, items: arr });
            }} />
          </div>
        ))}
      </Section>

      <Section title="Getting in touch">
        <Field label="WhatsApp number (digits only)" value={content.whatsapp}
          onChange={(v) => set('whatsapp', v)} />
        <Field label="Map link" value={content.mapUrl} onChange={(v) => set('mapUrl', v)} />
        <Field label="Service area" value={content.serviceArea}
          onChange={(v) => set('serviceArea', v)} />
      </Section>

      <Section title="Opening hours">
        {content.hours.map((h, i) => (
          <div key={i} className="grid grid-cols-2 gap-3">
            <Field label="Days" value={h.days} onChange={(v) => {
              const arr = [...content.hours]; arr[i] = { ...h, days: v }; set('hours', arr);
            }} />
            <Field label="Hours" value={h.open} onChange={(v) => {
              const arr = [...content.hours]; arr[i] = { ...h, open: v }; set('hours', arr);
            }} />
          </div>
        ))}
      </Section>

      <Section title="Request panel">
        <Field label="Title" value={content.requestPanel.title}
          onChange={(v) => set('requestPanel', { ...content.requestPanel, title: v })} />
        <TextAreaField label="Body" value={content.requestPanel.body}
          onChange={(v) => set('requestPanel', { ...content.requestPanel, body: v })} />
        <Field label="Thank-you title" value={content.requestPanel.successTitle}
          onChange={(v) => set('requestPanel', { ...content.requestPanel, successTitle: v })} />
        <TextAreaField label="Thank-you body" value={content.requestPanel.successBody}
          onChange={(v) => set('requestPanel', { ...content.requestPanel, successBody: v })} />
      </Section>

      <Section title="Search listing">
        <Field label="Page title" value={content.seo.title}
          onChange={(v) => set('seo', { ...content.seo, title: v })} />
        <TextAreaField label="Description" value={content.seo.description}
          onChange={(v) => set('seo', { ...content.seo, description: v })} />
      </Section>

      <Section title="Contact / footer">
        <Field label="Headline" value={content.contact.headline}
          onChange={(v) => set('contact', { ...content.contact, headline: v })} />
        <Field label="Phone" value={content.contact.phone}
          onChange={(v) => set('contact', { ...content.contact, phone: v })} />
        <Field label="Email" value={content.contact.email}
          onChange={(v) => set('contact', { ...content.contact, email: v })} />
        <Field label="Address" value={content.contact.address}
          onChange={(v) => set('contact', { ...content.contact, address: v })} />
      </Section>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={() => void save()} disabled={saving}>
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save changes'}
        </Button>
        <Button variant="outline" onClick={() => setResetOpen(true)}>
          <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
        </Button>
      </div>

      <DangerConfirm
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => { setContent(DEFAULT_CONTENT); setResetOpen(false); setNotice('Reset on screen only - nothing is live until you save.'); }}
        title="Reset the website content"
        summary={
          'This replaces everything on this screen with the wording the app ships ' +
          'with, including prices and photos. Nothing reaches the public site until ' +
          'you press Save, so you can still close this page to back out.'
        }
        confirmLabel="Reset the form"
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
      <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-gray-500 uppercase">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-gray-500 uppercase">{label}</span>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
      />
    </label>
  );
}

function ImageField({ label, value, onUpload }: {
  label: string; value: string; onUpload: (f: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-gray-500 uppercase">{label}</span>
      {value && (
        <img src={value} alt="" className="h-20 rounded-lg border border-gray-200 object-cover" />
      )}
      <input
        type="file"
        accept="image/*"
        disabled={busy}
        className="block text-xs text-gray-500"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          setFailed(null);
          try {
            await onUpload(f);
          } catch (err) {
            // An upload that fails silently leaves the old picture on screen
            // and the boss believing the new one is live.
            setFailed((err as Error).message || 'The upload did not go through.');
          } finally {
            setBusy(false);
            e.target.value = '';
          }
        }}
      />
      {busy && <span className="text-xs text-gray-400">Uploading...</span>}
      {failed && <span className="text-xs text-rose-600">{failed}</span>}
    </label>
  );
}
