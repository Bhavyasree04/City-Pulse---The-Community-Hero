import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase Config derived from firebase-applet-config.json
const firebaseConfig = {
  projectId: "gen-lang-client-0243136156",
  appId: "1:781273358188:web:f7ef9588d6affe0b43dd49",
  apiKey: "AIzaSyAVb1LY49rSnTyko5RcaKbMGbguPb_9cFg",
  authDomain: "gen-lang-client-0243136156.firebaseapp.com",
  storageBucket: "gen-lang-client-0243136156.firebasestorage.app",
  messagingSenderId: "781273358188",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);

// Use the specific Firestore Database ID from configuration
export const db = getFirestore(app, "ai-studio-9ebcd8f3-f1fc-4583-9741-3bebf1d26eff");

// Firebase Storage (with standard bucket)
export const storage = getStorage(app);

// Standardized Firestore error handler for AI Studio diagnostics
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default app;
