import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignInAnonymously,
  firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  FirebaseUser
} from '../firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Organization, OrgMember, Role, User } from '../types/index';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  currentOrg: Organization | null;
  organizations: Organization[];
  role: Role;
  members: OrgMember[];
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signInAsDemoUser: (email: string, name?: string, role?: Role) => Promise<void>;
  signIn: (email: string, name?: string) => Promise<void>; // backwards-compatibility
  signOut: () => Promise<void>;
  switchOrganization: (orgId: string) => Promise<void>;
  createOrganization: (name: string) => Promise<Organization>;
  refreshSession: () => Promise<void>;
  canManageClusters: boolean;
  canEditIncidents: boolean;
  canDeleteClusters: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [role, setRole] = useState<Role>('OWNER');
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync user profile with Firestore for persistence
  const syncUserWithFirestore = async (fbUser: FirebaseUser, displayName?: string) => {
    try {
      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);
      const email = fbUser.email || `anonymous-${fbUser.uid.substring(0, 6)}@skyops.io`;
      const name = displayName || fbUser.displayName || (fbUser.isAnonymous ? 'Guest SRE' : email.split('@')[0]);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: fbUser.uid,
          email,
          name,
          photoURL: fbUser.photoURL || null,
          isAnonymous: fbUser.isAnonymous,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        });
      } else {
        await setDoc(
          userRef,
          {
            lastLoginAt: serverTimestamp(),
            email,
            name: displayName || userSnap.data()?.name || name
          },
          { merge: true }
        );
      }
    } catch (err) {
      console.warn('Firestore user document synchronization notice:', err);
    }
  };

  const refreshSession = async (customUser?: { email: string; name: string }) => {
    try {
      setLoading(true);
      setError(null);

      // If a custom user is passed (e.g. from Firebase or Demo login), persist to localStorage
      if (customUser) {
        localStorage.setItem(
          'skyops_user',
          JSON.stringify({
            id: `usr-${customUser.email.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
            email: customUser.email,
            name: customUser.name
          })
        );
      }

      const session = await api.getSession();
      setUser(session.user);
      setCurrentOrg(session.currentOrg);
      setOrganizations(session.organizations);
      setRole(session.role);
      setMembers(session.members);

      // Persist active org id
      if (session.currentOrg) {
        localStorage.setItem('skyops_active_org_id', session.currentOrg.id);
      }
    } catch (err: any) {
      console.error('Session initialization error:', err);
      setError(err.message || 'Failed to authenticate');
    } finally {
      setLoading(false);
    }
  };

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        const email = fbUser.email || `guest-${fbUser.uid.substring(0, 6)}@skyops.io`;
        const name = fbUser.displayName || (fbUser.isAnonymous ? 'Guest SRE' : email.split('@')[0]);

        await syncUserWithFirestore(fbUser, name);
        await refreshSession({ email, name });
      } else {
        // When not logged into Firebase, check if there's an existing cached user session or use default SRE
        await refreshSession();
      }
    });

    return () => unsubscribe();
  }, []);

  // Firebase Sign-In with Google Popup
  const signInWithGoogle = async () => {
    try {
      setError(null);
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        const email = result.user.email || 'user@skyops.io';
        const name = result.user.displayName || email.split('@')[0];
        await syncUserWithFirestore(result.user, name);
        await refreshSession({ email, name });
      }
    } catch (err: any) {
      console.error('Google Sign In failed:', err);
      setError(err.message || 'Google Authentication failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Firebase Sign-In with Email & Password
  const signInWithEmail = async (email: string, pass: string) => {
    try {
      setError(null);
      setLoading(true);
      const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
      if (result.user) {
        const name = result.user.displayName || email.split('@')[0];
        await syncUserWithFirestore(result.user, name);
        await refreshSession({ email: result.user.email || email, name });
      }
    } catch (err: any) {
      console.error('Email Sign In failed:', err);
      setError(err.message || 'Failed to sign in with email');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Firebase Sign-Up with Email & Password
  const signUpWithEmail = async (email: string, pass: string, displayName?: string) => {
    try {
      setError(null);
      setLoading(true);
      const result = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      if (result.user) {
        const name = displayName?.trim() || email.split('@')[0];
        try {
          await updateProfile(result.user, { displayName: name });
        } catch {
          // non-blocking
        }
        await syncUserWithFirestore(result.user, name);
        await refreshSession({ email: result.user.email || email, name });
      }
    } catch (err: any) {
      console.error('Email Sign Up failed:', err);
      setError(err.message || 'Failed to create account');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Firebase Anonymous Sign In
  const signInAnonymously = async () => {
    try {
      setError(null);
      setLoading(true);
      const result = await firebaseSignInAnonymously(auth);
      if (result.user) {
        const email = `guest-${result.user.uid.substring(0, 6)}@skyops.io`;
        const name = 'Guest SRE';
        await syncUserWithFirestore(result.user, name);
        await refreshSession({ email, name });
      }
    } catch (err: any) {
      console.error('Anonymous Sign In failed:', err);
      setError(err.message || 'Anonymous authentication failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Quick Demo / Persona Sign In
  const signInAsDemoUser = async (email: string, name?: string) => {
    setError(null);
    const formattedEmail = email.trim();
    const formattedName = name?.trim() || email.split('@')[0];
    await refreshSession({ email: formattedEmail, name: formattedName });
  };

  // Generic Sign In (for backward compatibility)
  const signIn = async (email: string, name?: string) => {
    await signInAsDemoUser(email, name);
  };

  // Sign Out
  const signOut = async () => {
    try {
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
    } catch (err) {
      console.warn('Firebase sign out warning:', err);
    } finally {
      localStorage.removeItem('skyops_user');
      localStorage.removeItem('skyops_active_org_id');
      setUser(null);
      setFirebaseUser(null);
      setCurrentOrg(null);
      setOrganizations([]);
      await refreshSession();
    }
  };

  const switchOrganization = async (orgId: string) => {
    localStorage.setItem('skyops_active_org_id', orgId);
    await refreshSession();
  };

  const createOrganization = async (name: string): Promise<Organization> => {
    const newOrg = await api.createOrganization(name);
    await switchOrganization(newOrg.id);
    return newOrg;
  };

  const canManageClusters = role === 'OWNER' || role === 'ADMIN';
  const canDeleteClusters = role === 'OWNER' || role === 'ADMIN';
  const canEditIncidents = role === 'OWNER' || role === 'ADMIN' || role === 'ENGINEER';

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        currentOrg,
        organizations,
        role,
        members,
        loading,
        error,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signInAnonymously,
        signInAsDemoUser,
        signIn,
        signOut,
        switchOrganization,
        createOrganization,
        refreshSession,
        canManageClusters,
        canEditIncidents,
        canDeleteClusters
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
