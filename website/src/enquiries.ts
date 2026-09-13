import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { getFirebaseApp, getFirebaseAuth, hasFirebaseConfig } from './firebase';
import type { EnquiryInput } from './types';

/**
 * Which garage this site belongs to.
 *
 * Set once per deployment. Without it an enquiry has nowhere to land, so the
 * form says so plainly rather than pretending to send.
 */
export const GARAGE_ID: string =
  (import.meta as unknown as { env: Record<string, string> }).env.VITE_GARAGE_ID ?? '';

export const canReceiveEnquiries = (): boolean => hasFirebaseConfig && !!GARAGE_ID;

/**
 * Sends one enquiry from the public site.
 *
 * The visitor is signed in anonymously first. That looks like a formality and
 * is not: it gives the security rules something to check, so the enquiry
 * collection can accept a write from a stranger while still refusing to let
 * that same stranger read anyone else's messages back out. An unauthenticated
 * write would have to be open to the world in both directions.
 *
 * This one does await the network, unlike the writes inside the workshop apps.
 * A visitor filling in a form is watching the button and will retry or phone if
 * it fails, so a silent local-only success would be a lie - the opposite of the
 * receptionist at the gate, who needs the write to land instantly and sync
 * later.
 */
export async function submitEnquiry(input: EnquiryInput): Promise<void> {
  if (!canReceiveEnquiries()) {
    throw new Error('This site is not connected to the workshop yet.');
  }

  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Could not reach the workshop.');
  if (!auth.currentUser) await signInAnonymously(auth);

  const db = getFirestore(getFirebaseApp()!);
  await addDoc(collection(db, 'garages', GARAGE_ID, 'enquiries'), {
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || null,
    vehicle: input.vehicle?.trim() || null,
    service: input.service?.trim() || null,
    message: input.message.trim(),
    status: 'new',
    source: 'website',
    createdAt: serverTimestamp(),
    // The server clock decides ordering, but a local stamp survives the gap
    // before the server one resolves and keeps the inbox sortable meanwhile.
    createdAtLocal: new Date().toISOString(),
  });
}

/** Digits and a leading plus only - tel: and wa.me both choke on anything else. */
export function telHref(phone: string): string {
  return `tel:${phone.split('|')[0].replace(/[^\d+]/g, '')}`;
}

export function waHref(whatsapp: string, message: string): string {
  return `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
