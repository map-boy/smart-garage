import type { SiteContent } from './types';

/**
 * Title, description and structured data, applied from the same content the
 * page renders.
 *
 * Built from `c` rather than written out again, so the opening hours a search
 * result shows can never disagree with the ones on the page - which is the
 * usual way this markup goes stale and starts actively misleading people.
 */
export function applySeo(c: SiteContent): void {
  if (typeof document === 'undefined') return;

  const full = `${c.seo.title} | ${c.brand.name}`;
  document.title = full;
  upsert('name', 'description', c.seo.description);
  upsert('property', 'og:title', full);
  upsert('property', 'og:description', c.seo.description);
  upsert('property', 'og:type', 'website');
  if (c.hero.backgroundUrl) upsert('property', 'og:image', absolute(c.hero.backgroundUrl));

  setStructuredData(c);
}

function absolute(path: string): string {
  if (/^https?:/i.test(path)) return path;
  return typeof location === 'undefined' ? path : new URL(path, location.origin).toString();
}

function upsert(attr: 'name' | 'property', key: string, value: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/** Maps the site's own opening-hours strings onto schema.org day names. */
const DAY_MAP: Record<string, string[]> = {
  'monday to friday': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  saturday: ['Saturday'],
  sunday: ['Sunday'],
};

function setStructuredData(c: SiteContent): void {
  const id = 'ld-autorepair';
  document.getElementById(id)?.remove();

  const openingHours = c.hours
    .map((h) => {
      const days = DAY_MAP[h.days.trim().toLowerCase()];
      const [opens, closes] = h.open.split('-').map((s) => s.trim());
      // "Closed" has no hours to publish; saying nothing beats saying wrong.
      if (!days || !opens || !closes || !/^\d/.test(opens)) return null;
      return {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: days,
        opens,
        closes,
      };
    })
    .filter(Boolean);

  const data = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: c.brand.name,
    description: c.seo.description,
    telephone: c.contact.phone.split('|')[0].trim(),
    email: c.contact.email,
    address: { '@type': 'PostalAddress', streetAddress: c.contact.address, addressLocality: 'Kigali', addressCountry: 'RW' },
    areaServed: c.serviceArea,
    hasMap: c.mapUrl,
    openingHoursSpecification: openingHours,
    makesOffer: c.services.items.map((s) => ({
      '@type': 'Offer',
      name: s.title,
      description: s.body,
      priceCurrency: s.currency,
      price: s.fromPrice,
      priceSpecification: {
        '@type': 'PriceSpecification',
        priceCurrency: s.currency,
        price: s.fromPrice,
        // The published figure is a floor, not the final bill.
        valueAddedTaxIncluded: true,
      },
    })),
  };

  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}
