import { getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const firebaseConfigured = Object.values(config).every(Boolean);
const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
export const auth: Auth | null = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
let pendingGoogleLogin: ReturnType<typeof signInWithPopup> | null = null;

export const loginWithGoogle = () => {
  if (!auth) return Promise.reject(new Error('Firebase credentials are missing in apps/web/.env.'));
  if (pendingGoogleLogin) return pendingGoogleLogin;

  pendingGoogleLogin = signInWithPopup(auth, googleProvider).finally(() => {
    pendingGoogleLogin = null;
  });

  return pendingGoogleLogin;
};
export const logout = () => auth ? signOut(auth) : Promise.resolve();
