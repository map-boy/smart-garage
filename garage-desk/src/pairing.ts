import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { invoke } from "@tauri-apps/api/core";

const ROLE_RECEPTION = "reception";
const ROLE_STOCK = "stock";

export interface DeviceSession {
  uid: string;
  garage_id: string;
  role: string;
  staff_name: string;
  paired_at: string;
}

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) authInstance = getAuth(getFirebaseApp());
  return authInstance;
}

export function getFirebaseDb(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(getFirebaseApp());
  return dbInstance;
}

export async function ensureSignedIn(): Promise<string> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return auth.currentUser.uid;
  const result = await signInAnonymously(auth);
  return result.user.uid;
}

export function watchAuth(cb: (uid: string | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (user) => cb(user ? user.uid : null));
}

function wrongAppMessage(roleWire: string): string {
  return roleWire === ROLE_STOCK
    ? "That code is for the stock app. Ask for a reception code."
    : "That code is for the reception app. Ask for a stock code.";
}

/**
 * Redeems a pairing code for the given expected role, mirroring
 * shared/android DevicePairing.kt: anonymous sign-in, then a single
 * transaction that creates garages/{garageId}/devices/{uid} and burns
 * the pairing/{code} doc atomically so it cannot be redeemed twice.
 */
export async function redeemPairingCode(
  code: string,
  staffName: string,
  expectedRole: string
): Promise<DeviceSession> {
  const uid = await ensureSignedIn();
  const db = getFirebaseDb();
  const trimmed = code.trim().toUpperCase();
  const cleanName = staffName.trim();

  const pairingRef = doc(db, "pairing", trimmed);

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(pairingRef);
    if (!snap.exists()) {
      throw new Error("That code is not recognised. Check it and try again.");
    }

    const data = snap.data();
    const expiresAtMs = typeof data.expiresAtMs === "number" ? data.expiresAtMs : 0;
    if (expiresAtMs !== 0 && expiresAtMs <= Date.now()) {
      throw new Error("That code has expired. Ask for a new one.");
    }

    const garageId = typeof data.garageId === "string" ? data.garageId : "";
    if (!garageId) {
      throw new Error("That code is not set up correctly.");
    }

    const roleWire = data.role;
    if (roleWire !== ROLE_RECEPTION && roleWire !== ROLE_STOCK) {
      throw new Error("That code is not set up correctly.");
    }
    if (roleWire !== expectedRole) {
      throw new Error(wrongAppMessage(roleWire));
    }

    const deviceRef = doc(db, "garages", garageId, "devices", uid);
    tx.set(deviceRef, {
      role: roleWire,
      staffName: cleanName,
      garageId,
      pairingCode: trimmed,
      pairedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    });
    tx.delete(pairingRef);

    return { garageId, roleWire, staffName: cleanName };
  });

  const session: DeviceSession = {
    uid,
    garage_id: result.garageId,
    role: result.roleWire,
    staff_name: result.staffName,
    paired_at: new Date().toISOString(),
  };

  await invoke("save_device_session", {
    uid: session.uid,
    garageId: session.garage_id,
    role: session.role,
    staffName: session.staff_name,
  });

  return session;
}

export function listDeviceSessions(): Promise<DeviceSession[]> {
  return invoke("list_device_sessions");
}

export function clearDeviceSession(): Promise<void> {
  return invoke("clear_device_session");
}

export { ROLE_RECEPTION, ROLE_STOCK };