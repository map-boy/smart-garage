import { useEffect, useRef, useState } from "react";
import {
  Sparkles, Armchair, Brush, Wrench, Zap, Disc, Phone, MapPin, Clock, Percent,
  ArrowRight, MessageCircle, Mail, ChevronDown, Navigation, Send,
} from "lucide-react";
import type { SiteContent } from "./types";
import { DEFAULT_CONTENT } from "./content";
import { subscribeContent } from "./contentSource";
import { AdminPanel } from "./admin/AdminPanel";
import { RequestPanel } from "./components/RequestPanel";
import { Sections } from "./components/Sections";
import { telHref, waHref } from "./enquiries";
import { applySeo } from "./seo";

const ICONS: Record<string, typeof Wrench> = { Sparkles, Armchair, Brush, Wrench, Zap, Disc };

export function App() {
  const [c, setC] = useState<SiteContent>(DEFAULT_CONTENT);
  const [showAdmin, setShowAdmin] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [openService, setOpenService] = useState<string | null>(null);
  const clickCount = useRef(0);
  const clickTimer = useRef<number | undefined>(undefined);

  useEffect(() => subscribeContent(setC), []);
  useEffect(() => { applySeo(c); }, [c]);

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

  const firstPhone = c.contact.phone.split("|")[0].trim();
  const money = (n: number, cur: string) => `${n.toLocaleString()} ${cur}`;

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>

      <div className="topbar"><div className="wrap">
        <span><MapPin size={12} style={{ color: "#f5b921", verticalAlign: -1 }} /> {c.topBar.address}</span>
        {/* The number is a link everywhere it appears. A phone number a visitor
            has to copy out by hand is a phone call the garage does not get. */}
        <span>
          For Emergency : <a href={telHref(c.contact.phone)}><b>{c.topBar.emergencyPhone}</b></a>
        </span>
        <span>
          <Percent size={12} style={{ color: "#f5b921", verticalAlign: -1 }} /> {c.topBar.promo}
          &nbsp;|&nbsp; <Clock size={12} style={{ verticalAlign: -1 }} /> {c.topBar.hours}
        </span>
      </div></div>

      <nav className="nav"><div className="wrap">
        <div className="logo" onClick={handleLogoClick}>
          {c.brand.logoUrl
            ? <img src={c.brand.logoUrl} alt={c.brand.name} className="logo-img" />
            : <>{c.brand.name.slice(0, 3)}<span>{c.brand.name.slice(3)}</span></>}
        </div>
        <ul>
          <li><a href="#home">Home</a></li>
          <li><a href="#services">Services</a></li>
          <li><a href="#about">About</a></li>
          <li><a href="#faq">Questions</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
        <div className="nav-cta">
          <a className="callbtn" href={telHref(c.contact.phone)}>
            <Phone size={15} style={{ color: "#f5b921" }} /> {firstPhone}
          </a>
          <a className="btn" href="#ask">Ask a question</a>
        </div>
      </div></nav>

      <main id="main">
        <header id="home" className="hero">
          {(c.hero.backgroundUrls?.length ? c.hero.backgroundUrls : [c.hero.backgroundUrl]).map((url, i) => (
            <div key={url + i} className={"hero-bg" + (i === heroIndex ? " active" : "")}
              style={{ backgroundImage: `url(${url})` }} />
          ))}
          <div className="wrap">
            <p className="eyebrow">{c.hero.eyebrow}</p>
            <h1>
              {c.hero.titleLead}<span className="a">{c.hero.titleAccent}</span>
              {c.hero.titleTail}<span className="a">{c.hero.titleAccent2}</span>
            </h1>
            <p className="lead">{c.hero.body}</p>
            <div className="hero-actions">
              <a className="btn" href="#ask">{c.hero.ctaLabel}</a>
              <a className="callbtn big" href={telHref(c.contact.phone)}>
                <Phone size={17} style={{ color: "#f5b921" }} /> {firstPhone}
              </a>
            </div>
          </div>
        </header>

        <div className="wrap"><div className="hl">
          {c.highlights.map(h => (<div key={h.title}><h3>{h.title}</h3><p>{h.body}</p></div>))}
        </div></div>

        <section id="services" className="services"><div className="wrap">
          <p className="eyebrow">{c.services.eyebrow}</p>
          <h2>{c.services.titleLead}<span className="a">{c.services.titleAccent}</span> Car Detailing &amp; Repair</h2>
          <p className="lead">{c.services.intro}</p>
          <div className="grid">
            {c.services.items.map(s => {
              const Icon = ICONS[s.icon] ?? Wrench;
              const open = openService === s.title;
              return (
                <article className="card" key={s.title}>
                  <img src={s.imageUrl} alt={s.title} loading="lazy" />
                  <div className="ic"><Icon size={18} /></div>
                  <div className="b">
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                    {/* A real starting figure. "Call for a quote" is the most
                        common reason someone closes a garage site. */}
                    <p className="price"><small>from</small> {money(s.fromPrice, s.currency)}</p>
                    {s.detail && (
                      <>
                        <button type="button" className="more"
                          aria-expanded={open}
                          onClick={() => setOpenService(open ? null : s.title)}>
                          {open ? "LESS" : "READ MORE"} <ChevronDown size={12}
                            style={{ transform: open ? "rotate(180deg)" : undefined }} />
                        </button>
                        {open && <p className="detail">{s.detail}</p>}
                      </>
                    )}
                    <a className="ask-link" href="#ask">Ask about this <ArrowRight size={12} /></a>
                  </div>
                </article>
              );
            })}
          </div>
        </div></section>

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
            <p style={{ marginTop: 26, fontWeight: 800 }}>
              <a href={telHref(c.contact.phone)}>
                <Phone size={15} style={{ color: "#f5b921", verticalAlign: -2 }} /> {c.about.phone}
              </a>
            </p>
          </div>
          <img src={c.about.imageUrl} alt="" style={{ width: "100%", borderRadius: 4 }} />
        </div></section>

        <Sections sections={c.sections} />

        <section id="ask" className="asksec"><div className="wrap asklayout">
          <RequestPanel c={c} />
          <aside className="aside">
            <h3>Straight to a person</h3>
            <a className="aside-row" href={telHref(c.contact.phone)}>
              <Phone size={18} /><div><b>Call</b><span>{c.contact.phone}</span></div>
            </a>
            <a className="aside-row" href={waHref(c.whatsapp, `Hello ${c.brand.name}, I have a question about my vehicle.`)}
              target="_blank" rel="noopener noreferrer">
              <MessageCircle size={18} /><div><b>WhatsApp</b><span>Message us now</span></div>
            </a>
            <a className="aside-row" href={`mailto:${c.contact.email}`}>
              <Mail size={18} /><div><b>Email</b><span>{c.contact.email}</span></div>
            </a>
            <a className="aside-row" href={c.mapUrl} target="_blank" rel="noopener noreferrer">
              <Navigation size={18} /><div><b>Find us</b><span>{c.contact.address}</span></div>
            </a>

            <h3 style={{ marginTop: 26 }}>Opening hours</h3>
            <ul className="hours">
              {c.hours.map(h => (
                <li key={h.days}><span>{h.days}</span><b>{h.open}</b></li>
              ))}
            </ul>
            <p className="area">Serving {c.serviceArea}.</p>
          </aside>
        </div></section>

        <section id="faq" className="faqsec"><div className="wrap">
          <p className="eyebrow">BEFORE YOU COME IN</p>
          <h2>Questions we get <span className="a">every week</span></h2>
          <div className="faq">
            {c.faq.map((f, i) => (
              <div className={"faq-item" + (openFaq === i ? " on" : "")} key={f.q}>
                <button type="button" aria-expanded={openFaq === i}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  {f.q} <ChevronDown size={16} />
                </button>
                {openFaq === i && <p>{f.a}</p>}
              </div>
            ))}
          </div>
        </div></section>
      </main>

      <footer id="contact"><div className="wrap">
        <h2 style={{ fontSize: 24 }}>{c.contact.headline}</h2>
        <p style={{ marginTop: 12 }}>
          <a href={telHref(c.contact.phone)}>{c.contact.phone}</a>
          &nbsp;&middot;&nbsp;<a href={`mailto:${c.contact.email}`}>{c.contact.email}</a>
          &nbsp;&middot;&nbsp;{c.contact.address}
        </p>
        <p style={{ marginTop: 24, fontSize: 12, opacity: .5 }}>
          &copy; {new Date().getFullYear()} {c.brand.name}. {c.brand.tagline}.
        </p>
      </div></footer>

      {/* Phone only. Two taps, always reachable, and the body carries matching
          bottom padding so it never covers the last line of the footer. */}
      <div className="sticky">
        <a className="btn" href={telHref(c.contact.phone)}><Phone size={15} /> Call</a>
        <a className="btn ghost" href="#ask"><Send /> Ask</a>
        <a className="btn ghost" href={waHref(c.whatsapp, "Hello, I have a question about my vehicle.")}
          target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> WhatsApp</a>
      </div>

      <a className="wa-fab"
        href={waHref(c.whatsapp, `Hello ${c.brand.name}, I have a question about my vehicle.`)}
        target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">
        <MessageCircle size={24} />
      </a>

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </>
  );
}
