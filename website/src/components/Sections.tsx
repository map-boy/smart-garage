import type { SiteSection } from "../types";

/**
 * Renders the free-form sections stored on site/content.
 *
 * These exist so the garage can put something new on the page without a code
 * change - the technician console writes a section, the site shows it. That
 * means the data arrives from outside this file and may be half-finished or a
 * shape this build has never seen, so every branch here degrades rather than
 * throws: an unknown `kind` is skipped, a section with nothing in it is
 * skipped, and a missing image simply does not render.
 */
export function Sections({ sections }: { sections?: SiteSection[] }) {
  if (!sections?.length) return null;

  const visible = sections
    .filter((s) => s && !s.hidden && s.kind)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (!visible.length) return null;

  return (
    <>
      {visible.map((s) => {
        if (s.kind === "banner") {
          if (!s.imageUrl && !s.title) return null;
          return (
            <section className="sec-banner" key={s.id}>
              {s.imageUrl && <img src={s.imageUrl} alt="" loading="lazy" />}
              <div className="wrap">
                {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
                {s.title && <h2>{s.title}</h2>}
                {s.body && <p className="lead">{s.body}</p>}
                {s.ctaLabel && (
                  <a className="btn" href={s.ctaHref || "#ask"}>{s.ctaLabel}</a>
                )}
              </div>
            </section>
          );
        }

        if (s.kind === "cards") {
          const cards = (s.cards || []).filter((c) => c && (c.title || c.body));
          if (!cards.length) return null;
          return (
            <section className="sec-cards" key={s.id}><div className="wrap">
              {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
              {s.title && <h2>{s.title}</h2>}
              <div className="grid">
                {cards.map((c, i) => (
                  <article className="card" key={c.title || i}>
                    {c.imageUrl && <img src={c.imageUrl} alt={c.title} loading="lazy" />}
                    <div className="b">
                      {c.title && <h3>{c.title}</h3>}
                      {c.body && <p>{c.body}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </div></section>
          );
        }

        if (s.kind === "text") {
          if (!s.title && !s.body) return null;
          return (
            <section className="sec-text" key={s.id}><div className="wrap">
              {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
              {s.title && <h2>{s.title}</h2>}
              {s.body && <p className="lead">{s.body}</p>}
              {s.ctaLabel && (
                <a className="btn" href={s.ctaHref || "#ask"}>{s.ctaLabel}</a>
              )}
            </div></section>
          );
        }

        // A kind this build does not know about. Newer content must never take
        // the page down on an older deploy.
        return null;
      })}
    </>
  );
}
