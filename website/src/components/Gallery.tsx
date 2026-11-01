import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { GALLERY } from "../gallery";
import { SmartImg } from "./Skeleton";

const PAGE = 12;

export function Gallery() {
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);
  const n = GALLERY.length;
  const isOpen = open !== null;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % n));
      else if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + n) % n));
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [isOpen, n]);

  if (!n) return null;
  const cur = open === null ? null : GALLERY[open];

  return (
    <section id="gallery" className="gallery">
      <div className="wrap">
        <p className="eyebrow">OUR WORKSHOP</p>
        <h2>See the work <span className="a">up close</span></h2>
        <div className="gal-grid">
          {GALLERY.slice(0, shown).map((g, i) => (
            <button type="button" className="gal-item" key={g.id} onClick={() => setOpen(i)}
              aria-label={`Open photo ${i + 1} of ${n}`}>
              <SmartImg src={g.thumb} alt={`C&V Smart Garage photo ${i + 1}`}
                ratio={g.w / g.h} blur={g.blur} priority={i < 3} />
            </button>
          ))}
        </div>
        {shown < n && (
          <div className="gal-more">
            <button type="button" className="btn" onClick={() => setShown(n)}>SHOW ALL {n} PHOTOS</button>
          </div>
        )}
      </div>

      {cur && (
        <div className="lb" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={() => setOpen(null)}>
          <div style={{ width: "100%", maxWidth: `min(94vw, ${((88 * cur.w) / cur.h).toFixed(1)}vh)` }}
            onClick={(e) => e.stopPropagation()}>
            <SmartImg key={cur.id} src={cur.full} alt="C&V Smart Garage photo"
              ratio={cur.w / cur.h} blur={cur.thumb} priority />
          </div>
          <button type="button" className="lb-btn lb-close" aria-label="Close"
            onClick={(e) => { e.stopPropagation(); setOpen(null); }}><X size={20} /></button>
          <button type="button" className="lb-btn lb-prev" aria-label="Previous photo"
            onClick={(e) => { e.stopPropagation(); setOpen((i) => (i === null ? i : (i - 1 + n) % n)); }}><ChevronLeft size={22} /></button>
          <button type="button" className="lb-btn lb-next" aria-label="Next photo"
            onClick={(e) => { e.stopPropagation(); setOpen((i) => (i === null ? i : (i + 1) % n)); }}><ChevronRight size={22} /></button>
          <div className="lb-count">{(open ?? 0) + 1} / {n}</div>
        </div>
      )}
    </section>
  );
}