/**
 * What the public website renders, and what the admin app edits.
 *
 * This lives in shared/ because exactly two surfaces touch it and they must
 * agree: the website reads site/content to draw itself, and the boss's
 * Electron app writes the same document. When the editor and the renderer
 * each kept their own copy of this shape, a field added on one side was a
 * field silently ignored on the other.
 */

/**
 * One thing the garage sells.
 *
 * fromPrice is deliberately not optional. A price that can be left out is a
 * price that will be, and "call for a quote" is the single most common reason
 * a visitor closes a garage site without contacting anyone.
 */
export interface ServiceItem {
  title: string;
  body: string;
  imageUrl: string;
  icon: string;
  fromPrice: number;
  currency: string;
  /** The detail shown when someone taps through for more. */
  detail?: string;
}

/** Website content the admin edits from a panel, never from code. */
export interface SiteContent {
  brand: { name: string; tagline: string; logoUrl?: string };
  topBar: { address: string; emergencyPhone: string; hours: string; promo?: string };
  hero: { eyebrow: string; titleLead: string; titleAccent: string; titleTail: string; titleAccent2: string; body: string; ctaLabel: string; backgroundUrl: string; backgroundUrls?: string[] };
  highlights: { title: string; body: string }[];
  about: { eyebrow: string; title: string; body: string; satisfactionPct: number; badges: string[]; phone: string; imageUrl: string };
  services: { eyebrow: string; titleLead: string; titleAccent: string; intro: string; items: ServiceItem[] };
  contact: { headline: string; phone: string; email: string; address: string };

  /**
   * Everything below turns the page from a brochure into something a customer
   * can act on. A visitor who has decided to come in should never have to hunt
   * for a number, a price, or an opening time.
   */

  /** Digits only in the href; the label is what a human reads. */
  whatsapp: string;
  mapUrl: string;
  /** Written the same way everywhere - search engines match on exact strings. */
  serviceArea: string;
  hours: { days: string; open: string }[];
  faq: { q: string; a: string }[];
  requestPanel: {
    eyebrow: string;
    title: string;
    body: string;
    successTitle: string;
    successBody: string;
  };
  seo: { title: string; description: string };

  /**
   * Free-form sections, rendered in order between About and the request panel.
   *
   * Everything above this is a fixed field, which means adding a block of
   * content to the site - a seasonal offer, a new workshop, a notice - needed a
   * code change and a deploy. These do not: the technician console writes them
   * into site/content and the page picks them up live. Anything the renderer
   * does not recognise is skipped rather than breaking the page.
   */
  sections?: SiteSection[];

  updatedAt?: string;
}

export type SiteSectionKind = 'text' | 'banner' | 'cards';

export interface SiteSection {
  /** Stable key so React can keep its place when the order changes. */
  id: string;
  kind: SiteSectionKind;
  /** Left out or set false to take a section off the site without losing it. */
  hidden?: boolean;
  /** Lower numbers render first. Ties keep their order in the array. */
  order?: number;

  eyebrow?: string;
  title?: string;
  body?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  cards?: { title: string; body: string; imageUrl?: string }[];
}

/** What the visitor filled in on the request panel. */
export interface EnquiryInput {
  name: string;
  phone: string;
  email?: string;
  vehicle?: string;
  service?: string;
  message: string;
}
