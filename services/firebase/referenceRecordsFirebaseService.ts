import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { getFirestoreDb, requireFirebaseBusinessId } from "@/lib/firebase/client";
import { referenceRecordFromFirestore, referenceRecordToFirestore } from "@/lib/firebase/mappers";
import { referenceRecordPath, referenceRecordsPath } from "@/lib/firebase/paths";
import type { LifecycleMetadata, ReferenceRecord, ReferenceRecordType } from "@/lib/types";

const requireDb = () => {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured.");
  return db;
};

const businessId = () => requireFirebaseBusinessId();

const normalizeReferenceValue = (value: string) => value.trim().toLowerCase();

const makeReferenceId = (type: ReferenceRecordType, value: string) => {
  const normalized = normalizeReferenceValue(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${type}-${normalized || "blank"}`;
};

export const referenceRecordsFirebaseService = {
  normalizeReferenceValue,

  async listReferenceRecords(type?: ReferenceRecordType) {
    const db = requireDb();
    const base = collection(db, referenceRecordsPath(businessId()));
    const snap = type ? await getDocs(query(base, where("type", "==", type))) : await getDocs(base);
    return snap.docs.map((row) => referenceRecordFromFirestore({ id: row.id, ...(row.data() as Record<string, unknown>) }));
  },

  async getReferenceRecordById(id: string) {
    const db = requireDb();
    const snap = await getDoc(doc(db, referenceRecordPath(businessId(), id)));
    if (!snap.exists()) return null;
    return referenceRecordFromFirestore({ id: snap.id, ...(snap.data() as Record<string, unknown>) });
  },

  async ensureReferenceRecord(input: {
    type: ReferenceRecordType;
    value: string;
    sourceOrderId?: string;
    lifecycle?: Partial<LifecycleMetadata>;
  }): Promise<{ record: ReferenceRecord; created: boolean }> {
    const cleanValue = input.value.trim();
    if (!cleanValue) throw new Error("Reference value is required.");
    const db = requireDb();
    const now = new Date().toISOString();
    const id = makeReferenceId(input.type, cleanValue);
    const existing = await this.getReferenceRecordById(id);
    const lifecycle: LifecycleMetadata = {
      type: "reference",
      status: "active",
      sourceType: input.lifecycle?.sourceType ?? (input.sourceOrderId ? "order" : "manual"),
      sourceOrderId: input.sourceOrderId || input.lifecycle?.sourceOrderId,
      createdByOrder: input.lifecycle?.createdByOrder ?? Boolean(input.sourceOrderId),
      reusable: input.lifecycle?.reusable ?? true,
      deletedAt: undefined,
      restoredAt: input.lifecycle?.restoredAt,
      deletedBy: undefined,
      restoredBy: input.lifecycle?.restoredBy,
      recycleBinEntryId: input.lifecycle?.recycleBinEntryId,
      linkedLedgerEntryIds: input.lifecycle?.linkedLedgerEntryIds,
      linkedTransactionIds: input.lifecycle?.linkedTransactionIds,
      linkedProductIds: input.lifecycle?.linkedProductIds,
      linkedCustomerIds: input.lifecycle?.linkedCustomerIds,
      linkedPaymentAgentIds: input.lifecycle?.linkedPaymentAgentIds,
      linkedWechatIds: input.lifecycle?.linkedWechatIds,
      linkedReferenceIds: input.lifecycle?.linkedReferenceIds,
    };
    const record: ReferenceRecord = {
      id,
      type: input.type,
      value: cleanValue,
      normalizedValue: normalizeReferenceValue(cleanValue),
      sourceOrderIds: Array.from(new Set([...(existing?.sourceOrderIds ?? []), ...(input.sourceOrderId ? [input.sourceOrderId] : [])])),
      status: "active",
      lifecycle: existing?.lifecycle ? { ...existing.lifecycle, ...lifecycle, status: "active", deletedAt: undefined } : lifecycle,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await setDoc(doc(db, referenceRecordPath(businessId(), id)), referenceRecordToFirestore(record), { merge: true });
    return { record, created: !existing };
  },

  async upsertReferenceRecord(record: ReferenceRecord) {
    const db = requireDb();
    await setDoc(doc(db, referenceRecordPath(businessId(), record.id)), referenceRecordToFirestore(record), { merge: true });
    return record;
  },
};
