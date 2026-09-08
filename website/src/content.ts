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
      { title: 'Exterior Detailing', body: 'Wash, clay, polish and protect the paintwork.', imageUrl: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?w=600&q=80', icon: 'Sparkles' },
      { title: 'Interior Detailing', body: 'Deep clean of seats, carpets, vents and trim.', imageUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&q=80', icon: 'Armchair' },
      { title: 'Paint Correction', body: 'Remove swirls and scratches, restore the gloss.', imageUrl: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=600&q=80', icon: 'Brush' },
      { title: 'Engine Diagnostics & Repair', body: 'Fault codes read, root cause found, parts replaced.', imageUrl: 'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=600&q=80', icon: 'Wrench' },
      { title: 'Electrical System Repairs', body: 'Batteries, alternators, wiring and lighting.', imageUrl: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=600&q=80', icon: 'Zap' },
      { title: 'Suspension & Brake Services', body: 'Pads, discs, shocks and full brake safety checks.', imageUrl: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=600&q=80', icon: 'Disc' },
    ],
  },
  contact: {
    headline: 'Book your vehicle in',
    phone: '+250 788 302 465 | +250 788 355 096',
    email: 'cvsmartgarage@gmail.com',
    address: 'KG 34 St, Kimironko, Kigali',
  },
};


