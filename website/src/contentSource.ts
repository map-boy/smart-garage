import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import type { SiteContent } from "./types";
import { DEFAULT_CONTENT } from "./content";
import { getFirebaseApp, hasFirebaseConfig } from "./firebase";

export function subscribeContent(cb: (c: SiteContent) => void): () => void {
  cb(DEFAULT_CONTENT);
  if (!hasFirebaseConfig) return () => {};
  try {
    const app = getFirebaseApp()!;
    return onSnapshot(doc(getFirestore(app), "site", "content"),
      (snap) => { if (snap.exists()) cb({ ...DEFAULT_CONTENT, ...(snap.data() as Partial<SiteContent>) }); },
      () => {});
  } catch { return () => {}; }
}
