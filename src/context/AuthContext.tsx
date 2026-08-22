import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { auth, db, googleProvider } from '../firebase';
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
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, displayName?: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
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
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [role, setRole] = useState<Role>('VIEWER');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const syncUserWithFirestore = async (fbUser: FirebaseUser, displayName?: string) => {
    try {
      const userRef = doc(db, 'users', fbUser.uid);
      const snap = await getDoc(userRef);
      const name = displayName || fbUser.displayName || fbUser.email?.split('@')[0] || 'SkyOps Engineer';
      const email = fbUser.email || `${fbUser.uid}@skyops.internal`;

      if (!snap.exists()) {
        await setDoc(
          userRef,
          {
            uid: fbUser.uid,
            email,
            name,
            photoURL: fbUser.photoURL || null,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp()
          },
          { merge: true }
        );
      } else {
        await setDoc(
          userRef,
          {
            lastLoginAt: serverTimestamp()
          },
          { merge: true }
        );
      }
    } catch (err) {
      console.warn('Firestore user profile sync warning (non-blocking):', err);
    }
  };

  const refreshSession = async () => {
    if (!auth.currentUser) {
      setUser(null);
      setCurrentOrg(null);
      setOrganizations([]);
      setMembers([]);
      setRole('VIEWER');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const session = await api.getSession();
      setUser(session.user);
      setCurrentOrg(session.currentOrg);
      setOrganizations(session.organizations || []);
      setMembers(session.members || []);
      setRole(session.role || 'OWNER');
    } catch (err: any) {
      console.warn('Session refresh warning:', err?.message || err);
      // Fallback session state using current Firebase profile
      const fallbackUser: User = {
        id: auth.currentUser.uid,
        email: auth.currentUser.email || `${auth.currentUser.uid}@skyops.internal`,
        name: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'SkyOps Engineer'
      };
      setUser(fallbackUser);
      const fallbackOrg: Organization = {
        id: 'org-primary',
        name: `${fallbackUser.name.split(' ')[0]}'s Workspace`,
        slug: 'primary-workspace',
        createdAt: Date.now(),
        membersCount: 1
      };
      setCurrentOrg(fallbackOrg);
      setOrganizations([fallbackOrg]);
      setRole('OWNER');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await syncUserWithFirestore(fbUser);
        await refreshSession();
      } else {
        setUser(null);
        setCurrentOrg(null);
        setOrganizations([]);
        setMembers([]);
        setRole('VIEWER');
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      setError(null);
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        await syncUserWithFirestore(result.user);
        await refreshSession();
      }
    } catch (err: any) {
      console.error('Google Sign In failed:', err);
      setError(err.message || 'Failed to sign in with Google');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    try {
      setError(null);
      setLoading(true);
      const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
      if (result.user) {
        await syncUserWithFirestore(result.user);
        await refreshSession();
      }
    } catch (err: any) {
      console.error('Email Sign In failed:', err);
      setError(err.message || 'Failed to sign in with email');
      throw err;
    } finally {
      setLoading(false);
    }
  };

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
          // ignore non-fatal profile update error
        }
        await syncUserWithFirestore(result.user, name);
        await refreshSession();
      }
    } catch (err: any) {
      console.error('Email Sign Up failed:', err);
      setError(err.message || 'Failed to create account');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const sendPasswordReset = async (email: string) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err: any) {
      console.error('Password reset failed:', err);
      setError(err.message || 'Failed to send password reset email');
      throw err;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.warn('Firebase sign out warning:', err);
    } finally {
      localStorage.removeItem('skyops_active_org_id');
      setUser(null);
      setFirebaseUser(null);
      setCurrentOrg(null);
      setOrganizations([]);
      setMembers([]);
      setRole('VIEWER');
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
        sendPasswordReset,
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
