import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
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
import { getFirestore, Firestore } from 'firebase/firestore';
import fallbackConfig from '../firebase-applet-config.json';

const env = (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || {};
const procEnv = (typeof process !== 'undefined' && process?.env) || {};

// Resolve Firebase configuration: environment variables take precedence, falling back to applet config
export const resolvedFirebaseConfig = {
  apiKey:
    env.VITE_FIREBASE_API_KEY ||
    procEnv.VITE_FIREBASE_API_KEY ||
    fallbackConfig.apiKey ||
    'AIzaSyDummyFallbackKeyForTestExecutionOnly000',
  authDomain:
    env.VITE_FIREBASE_AUTH_DOMAIN ||
    procEnv.VITE_FIREBASE_AUTH_DOMAIN ||
    fallbackConfig.authDomain ||
    'localhost',
  projectId:
    env.VITE_FIREBASE_PROJECT_ID ||
    procEnv.VITE_FIREBASE_PROJECT_ID ||
    fallbackConfig.projectId ||
    'skyops-netes-56b89',
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET ||
    procEnv.VITE_FIREBASE_STORAGE_BUCKET ||
    fallbackConfig.storageBucket ||
    '',
  messagingSenderId:
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    procEnv.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    fallbackConfig.messagingSenderId ||
    '',
  appId:
    env.VITE_FIREBASE_APP_ID ||
    procEnv.VITE_FIREBASE_APP_ID ||
    fallbackConfig.appId ||
    '1:000000000000:web:0000000000000000000000',
  firestoreDatabaseId:
    env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
    procEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
    (fallbackConfig as any).firestoreDatabaseId ||
    '(default)'
};

// Initialize Firebase App instance safely (singleton pattern)
export const app = !getApps().length ? initializeApp(resolvedFirebaseConfig) : getApp();

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Initialize Cloud Firestore with configured databaseId or default
const databaseId = resolvedFirebaseConfig.firestoreDatabaseId;
export const db: Firestore =
  databaseId && databaseId !== '(default)'
    ? getFirestore(app, databaseId)
    : getFirestore(app);

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
  updateProfile
};
export type { FirebaseUser };
