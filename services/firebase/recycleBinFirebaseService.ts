import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { getFirestoreDb, requireFirebaseBusinessId } from "@/lib/firebase/client";
import { recycleBinEntryFromFirestore, recycleBinEntryToFirestore, sanitizeFirestorePayload } from "@/lib/firebase/mappers";
import { recycleBinEntryPath, recycleBinPath } from "@/lib/firebase/paths";
import type { RecycleBinEntry } from "@/lib/types";

const requireDb = () => {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured.");
  return db;
};

const businessId = () => requireFirebaseBusinessId();

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `bin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const recycleBinFirebaseService = {
  async listRecycleBinEntries() {
    const db = requireDb();
    const snap = await getDocs(collection(db, recycleBinPath(businessId())));
    return snap.docs
      .map((row) => recycleBinEntryFromFirestore({ id: row.id, ...(row.data() as Record<string, unknown>) }))
      .sort((a, b) => (b.deletedAt || "").localeCompare(a.deletedAt || ""));
  },

  async getRecycleBinEntryById(id: string) {
    const db = requireDb();
    const snap = await getDoc(doc(db, recycleBinEntryPath(businessId(), id)));
    if (!snap.exists()) return null;
    return recycleBinEntryFromFirestore({ id: snap.id, ...(snap.data() as Record<string, unknown>) });
  },

  async upsertRecycleBinEntry(entry: Omit<RecycleBinEntry, "id"> & { id?: string }) {
    const db = requireDb();
    const id = entry.id || makeId();
    const next = { ...entry, id };
    const payload = sanitizeFirestorePayload(recycleBinEntryToFirestore(next)).value;
    await setDoc(doc(db, recycleBinEntryPath(businessId(), id)), payload, { merge: true });
    return next;
  },
};
