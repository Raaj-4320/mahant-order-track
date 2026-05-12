/**
 * Phase 3A foundation wrapper.
 *
 * NOTE: Firebase SDK installation is environment-dependent.
 * This file intentionally provides safe getters that return `null`
 * when env config is missing or SDK is not yet available.
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

export const getFirebaseClientConfig = (): FirebaseClientConfig | null => {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    return null;
  }

  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId };
};

export const isFirebaseConfigured = () => getFirebaseClientConfig() !== null;

// SDK-backed getters are intentionally null in this environment until SDK install is available.
export const getFirebaseApp = () => null;
export const getFirestoreDb = () => null;
export const getFirebaseAuth = () => null;
export const getFirebaseStorage = () => null;
