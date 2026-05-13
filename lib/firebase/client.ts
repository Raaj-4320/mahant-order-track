/**
 * Phase 3 foundation wrapper with lazy SDK loading.
 */
export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;

export const getFirebaseClientConfig = (): FirebaseClientConfig | null => {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) return null;
  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId };
};

export const isFirebaseConfigured = () => getFirebaseClientConfig() !== null;

export const getFirebaseApp = async (): Promise<unknown | null> => {
  const config = getFirebaseClientConfig();
  if (!config) return null;
  try {
    const appModule = (await dynamicImport("firebase/app")) as {
      getApps: () => unknown[];
      initializeApp: (cfg: FirebaseClientConfig) => unknown;
      getApp: () => unknown;
    };
    return appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(config);
  } catch {
    return null;
  }
};

export const getFirestoreDb = async (): Promise<unknown | null> => {
  const app = await getFirebaseApp();
  if (!app) return null;
  try {
    const firestoreModule = (await dynamicImport("firebase/firestore")) as { getFirestore: (app: unknown) => unknown };
    return firestoreModule.getFirestore(app);
  } catch {
    return null;
  }
};

export const getFirebaseAuth = async () => null;
export const getFirebaseStorage = async () => null;
