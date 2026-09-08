import { useEffect, useRef, useState } from "react";
import { Sparkles, Armchair, Brush, Wrench, Zap, Disc, Phone, MapPin, Clock, Percent, ArrowRight } from "lucide-react";
import type { SiteContent } from "./types";
import { DEFAULT_CONTENT } from "./content";
import { subscribeContent } from "./contentSource";
import { AdminPanel } from "./admin/AdminPanel";

const ICONS: Record<string, typeof Wrench> = { Sparkles, Armchair, Brush, Wrench, Zap, Disc };

export function App() {
  const [c, setC] = useState<SiteContent>(DEFAULT_CONTENT);
  const [showAdmin, setShowAdmin] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const clickCount = useRef(0);
  const clickTimer = useRef<number | undefined>(undefined);
  useEffect(() => subscribeContent(setC), []);
  useEffect(() => {
    const imgs = c.hero.backgroundUrls?.length ? c.hero.backgroundUrls : [c.hero.backgroundUrl];
    if (imgs.length < 2) return;
    const id = window.setInterval(() => setHeroIndex(i => (i + 1) % imgs.length), 5000);
    return () => window.clearInterval(id);
  }, [c.hero.backgroundUrls, c.hero.backgroundUrl]);

  function handleLogoClick() {
    clickCount.current += 1;
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => { clickCount.current = 0; }, 4000);
    if (clickCount.current >= 20) { clickCount.current = 0; setShowAdmin(true); }
  }

  return (
    <>
      <div className="topbar"><div className="wrap">
        <span><MapPin size={12} style={{ color: "#f5b921", verticalAlign: -1 }} /> {c.topBar.address}</span>
        <span>For Emergency : {c.topBar.emergencyPhone}</span>
        <span><Percent size={12} style={{ color: "#f5b921", verticalAlign: -1 }} /> {c.topBar.promo} &nbsp;|&nbsp; <Clock size={12} style={{ verticalAlign: -1 }} /> {c.topBar.hours}</span>
      </div></div>

      <nav className="nav"><div className="wrap">
        <div className="logo" onClick={handleLogoClick}>{c.brand.logoUrl ? <img src={c.brand.logoUrl} alt={c.brand.name} className="logo-img" /> : <>{c.brand.name.slice(0, 3)}<span>{c.brand.name.slice(3)}</span></>}</div>
        <ul><li><a href="#home">Homepage</a></li><li><a href="#about">About Us</a></li><li><a href="#services">Services</a></li><li><a href="#contact">Contact Us</a></li></ul>
      </div></nav>

      <header id="home" className="hero">
        {(c.hero.backgroundUrls?.length ? c.hero.backgroundUrls : [c.hero.backgroundUrl]).map((url, i) => (
          <div key={url + i} className={"hero-bg" + (i === heroIndex ? " active" : "")} style={{ backgroundImage: `url(${url})` }} />
        ))}
        <div className="wrap">
          <p className="eyebrow">{c.hero.eyebrow}</p>
          <h1>{c.hero.titleLead}<span className="a">{c.hero.titleAccent}</span>{c.hero.titleTail}<span className="a">{c.hero.titleAccent2}</span></h1>
          <p className="lead">{c.hero.body}</p>
          <a className="btn" href="#contact">{c.hero.ctaLabel}</a>
        </div>
      </header>

      <div className="wrap"><div className="hl">
        {c.highlights.map(h => (<div key={h.title}><h3>{h.title}</h3><p>{h.body}</p></div>))}
      </div></div>

      <section id="about"><div className="wrap about">
        <div>
          <p className="eyebrow">{c.about.eyebrow}</p>
          <h2>{c.about.title}</h2>
          <p className="lead">{c.about.body}</p>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
            <span>Client Satisfaction</span><span>{c.about.satisfactionPct}%</span>
          </div>
          <div className="bar"><div style={{ width: `${c.about.satisfactionPct}%` }} /></div>
          <div className="badges">{c.about.badges.map(b => <div className="badge" key={b}>{b}</div>)}</div>
          <p style={{ marginTop: 26, fontWeight: 800 }}><Phone size={15} style={{ color: "#f5b921", verticalAlign: -2 }} /> {c.about.phone}</p>
        </div>
        <img src={c.about.imageUrl} alt="" style={{ width: "100%", borderRadius: 4 }} />
      </div></section>

      <section id="services" className="services"><div className="wrap">
        <p className="eyebrow">{c.services.eyebrow}</p>
        <h2>{c.services.titleLead}<span className="a">{c.services.titleAccent}</span> Car Detailing &amp; Repair</h2>
        <p className="lead">{c.services.intro}</p>
        <div className="grid">
          {c.services.items.map(s => {
            const Icon = ICONS[s.icon] ?? Wrench;
            return (
              <article className="card" key={s.title}>
                <img src={s.imageUrl} alt={s.title} loading="lazy" />
                <div className="ic"><Icon size={18} /></div>
                <div className="b"><h3>{s.title}</h3><p>{s.body}</p><span className="more">READ MORE <ArrowRight size={12} /></span></div>
              </article>
            );
          })}
        </div>
      </div></section>

      <footer id="contact"><div className="wrap">
        <h2 style={{ fontSize: 24 }}>{c.contact.headline}</h2>
        <p style={{ marginTop: 12 }}>{c.contact.phone} &nbsp;&middot;&nbsp; {c.contact.email} &nbsp;&middot;&nbsp; {c.contact.address}</p>
        <p style={{ marginTop: 24, fontSize: 12, opacity: .5 }}>&copy; {new Date().getFullYear()} {c.brand.name}. {c.brand.tagline}.</p>
      </div></footer>

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </>
  );
}


