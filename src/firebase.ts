import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously as firebaseSignInAnonymously,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { getFirestore, initializeFirestore, setLogLevel, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata,
  FirebaseStorage
} from 'firebase/storage';
import { fallbackFirebaseConfig } from './config/firebaseFallbackConfig';

const env = (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || {};

const rawBucket = env.VITE_FIREBASE_STORAGE_BUCKET || fallbackFirebaseConfig.storageBucket || 'skyops-a1143.firebasestorage.app';
const cleanStorageBucket = String(rawBucket).replace(/^gs:\/\//, '').trim();

// Resolve Firebase configuration: environment variables take precedence, falling back to applet config
export const resolvedFirebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || fallbackFirebaseConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || fallbackFirebaseConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || fallbackFirebaseConfig.projectId,
  storageBucket: cleanStorageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackFirebaseConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || fallbackFirebaseConfig.appId,
  firestoreDatabaseId:
    env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || fallbackFirebaseConfig.firestoreDatabaseId
};

// Initialize Firebase App instance safely (singleton pattern)
export const app = !getApps().length ? initializeApp(resolvedFirebaseConfig) : getApp();

// Initialize Firebase Authentication
export const auth = getAuth(app);
const authEmulator = env.VITE_FIREBASE_AUTH_EMULATOR_URL;
if (authEmulator && env.MODE !== 'production') {
  connectAuthEmulator(auth, authEmulator, { disableWarnings: true });
}

// Suppress internal Firestore gRPC idle stream warnings
try {
  setLogLevel('silent');
} catch {}

// Initialize Cloud Firestore with configured databaseId or default
const databaseId = resolvedFirebaseConfig.firestoreDatabaseId;
let firestoreInstance: Firestore;
try {
  firestoreInstance =
    databaseId && databaseId !== '(default)'
      ? initializeFirestore(app, { experimentalForceLongPolling: true }, databaseId)
      : initializeFirestore(app, { experimentalForceLongPolling: true });
} catch {
  firestoreInstance =
    databaseId && databaseId !== '(default)'
      ? getFirestore(app, databaseId)
      : getFirestore(app);
}
export const db: Firestore = firestoreInstance;
const firestoreEmulator = env.VITE_FIRESTORE_EMULATOR_HOST;
if (firestoreEmulator && env.MODE !== 'production') {
  const [host, rawPort] = String(firestoreEmulator).split(':');
  connectFirestoreEmulator(db, host, Number(rawPort) || 8080);
}

// Initialize Firebase Cloud Storage with canonical bucket
export const storage: FirebaseStorage = getStorage(app, `gs://${cleanStorageBucket}`);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignInAnonymously,
  firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata
};
export type { FirebaseUser, FirebaseStorage };
