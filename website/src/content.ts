/**
 * Every word and image on the public site lives here.
 *
 * This file is the fallback that ships with the build. At runtime the site
 * prefers the same shape stored in Firestore at site/content, which the admin
 * edits from a panel - so changing a headline or a phone number never means
 * touching code or redeploying.
 */
import type { SiteContent } from './types';

export const DEFAULT_CONTENT: SiteContent = {
  brand: { name: 'C&V SMART GARAGE', tagline: 'Smart Garage & Carwash', logoUrl: '/logo.png' },
  topBar: {
    address: 'KG 34 St, Kimironko, Kigali',
    emergencyPhone: '+250 788 302 465',
    hours: '08.00AM - 17.00PM',
    promo: 'Discount 25% for every service',
  },
  hero: {
    eyebrow: 'DRIVE WITH CONFIDENCE',
    titleLead: 'Premium Car ', titleAccent: 'Detailing',
    titleTail: ' & Repair ', titleAccent2: 'Solutions',
    body: 'Full-service detailing, diagnostics and mechanical repair, handled by technicians who treat every vehicle as their own.',
    ctaLabel: 'MAKE APPOINTMENT',
    backgroundUrl: '/photo_2026-09-08_18-04-02.jpg',
    backgroundUrls: ['/photo_2026-09-08_18-04-02.jpg', '/photo_2026-09-08_18-04-09.jpg', '/photo_2026-09-08_18-04-13.jpg'],
  },
  highlights: [
    { title: 'Expertise & Professional', body: 'Certified technicians with years on the workshop floor.' },
    { title: '24/7 Ready Support', body: 'Breakdown? Call the emergency line at any hour.' },
    { title: 'Free Consulting', body: 'Bring the vehicle in and we will tell you what it truly needs.' },
  ],
  about: {
    eyebrow: 'WHO WE ARE ?',
    title: 'Car Detailing And Repair Services You Can Rely On',
    body: 'We keep a full record of every job on every vehicle, so you always know what was done, what it cost, and what is due next.',
    satisfactionPct: 90,
    badges: ['Professional & Creative Staff', 'Warranties & Guarantees'],
    phone: '+250 788 302 465',
    imageUrl: '/photo_2026-09-08_18-04-17.jpg',
  },
  services: {
    eyebrow: 'OUR SERVICES',
    titleLead: 'Delivering ', titleAccent: 'Superior',
    intro: 'From a wash and polish to full engine diagnostics, under one roof.',
    items: [
      { title: 'Exterior Detailing', body: 'Wash, clay, polish and protect the paintwork.', imageUrl: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?w=600&q=80', icon: 'Sparkles', fromPrice: 15000, currency: 'RWF', detail: 'Full hand wash, clay bar, machine polish and a protective sealant. Takes about three hours; you are welcome to wait.' },
      { title: 'Interior Detailing', body: 'Deep clean of seats, carpets, vents and trim.', imageUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&q=80', icon: 'Armchair', fromPrice: 20000, currency: 'RWF', detail: 'Seats, carpets, headlining, vents and trim deep-cleaned and sanitised. Pet hair and smoke odour cost a little more.' },
      { title: 'Paint Correction', body: 'Remove swirls and scratches, restore the gloss.', imageUrl: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=600&q=80', icon: 'Brush', fromPrice: 60000, currency: 'RWF', detail: 'Swirls, scratches and oxidation cut back over one to three stages depending on the paint. We show you a test panel before committing.' },
      { title: 'Engine Diagnostics & Repair', body: 'Fault codes read, root cause found, parts replaced.', imageUrl: 'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=600&q=80', icon: 'Wrench', fromPrice: 10000, currency: 'RWF', detail: 'Fault codes read on the scanner, then traced to a root cause rather than guessed. The diagnostic fee comes off the repair if you go ahead.' },
      { title: 'Electrical System Repairs', body: 'Batteries, alternators, wiring and lighting.', imageUrl: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=600&q=80', icon: 'Zap', fromPrice: 12000, currency: 'RWF', detail: 'Batteries, alternators, starters, wiring faults and lighting. Intermittent faults are quoted after testing, never before.' },
      { title: 'Suspension & Brake Services', body: 'Pads, discs, shocks and full brake safety checks.', imageUrl: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=600&q=80', icon: 'Disc', fromPrice: 25000, currency: 'RWF', detail: 'Pads, discs, shocks, bushes and a full safety inspection. We photograph worn parts so you can see what you are paying for.' },
    ],
  },
  contact: {
    headline: 'Book your vehicle in',
    phone: '+250 788 302 465 | +250 788 355 096',
    email: 'cvsmartgarage@gmail.com',
    address: 'KG 34 St, Kimironko, Kigali',
  },

  // Digits only: a tel: or wa.me link breaks on spaces and punctuation.
  whatsapp: '+250788302465',
  mapUrl: 'https://www.google.com/maps/search/?api=1&query=KG+34+St+Kimironko+Kigali',
  serviceArea: 'Kimironko, Remera, Kacyiru, Gisozi and the rest of Kigali',
  hours: [
    { days: 'Monday to Friday', open: '08:00 - 17:00' },
    { days: 'Saturday', open: '08:00 - 14:00' },
    { days: 'Sunday', open: 'Closed - emergency line open' },
  ],
  faq: [
    {
      q: 'Do I need an appointment?',
      a: 'No. You can drive in during opening hours and we will look at the vehicle. Sending a request first just means the bay and the parts are ready when you arrive.',
    },
    {
      q: 'Will you tell me the price before you start?',
      a: 'Always. We inspect first, then quote. Nothing is fitted and no labour is charged without you agreeing to the figure.',
    },
    {
      q: 'How long does a service take?',
      a: 'A wash and polish is a few hours. A service is usually the same day. Anything needing a part we do not stock depends on the supplier, and we tell you that up front.',
    },
    {
      q: 'Do you give a receipt and a record of the work?',
      a: 'Yes. Every job is recorded against your vehicle, so you can ask us later what was done, when, and what it cost.',
    },
    {
      q: 'Can you collect the vehicle?',
      a: 'Within Kigali, usually yes. Call the number above and we will arrange it.',
    },
  ],
  requestPanel: {
    eyebrow: 'ASK US ANYTHING',
    title: 'Tell us what the car is doing',
    body: 'Describe the problem in your own words and we will come back with what it is likely to be and what it should cost. No obligation.',
    successTitle: 'We have it',
    successBody: 'Your message is with the workshop. We usually reply the same day - if it is urgent, call and speak to a technician now.',
  },
  seo: {
    title: 'Car Service, Repair & Detailing in Kigali',
    description:
      'Servicing, diagnostics, mechanical repair and detailing in Kimironko, Kigali. Clear prices quoted before work starts. Call or send a request today.',
  },
};


