import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { Organization, OrgMember, Role, User } from '../types/index';

interface AuthContextType {
  user: User | null;
  currentOrg: Organization | null;
  organizations: Organization[];
  role: Role;
  members: OrgMember[];
  loading: boolean;
  error: string | null;
  signIn: (email: string, name?: string) => Promise<void>;
  signOut: () => void;
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
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [role, setRole] = useState<Role>('OWNER');
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = async () => {
    try {
      setLoading(true);
      setError(null);
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

  useEffect(() => {
    refreshSession();
  }, []);

  const signIn = async (email: string, name?: string) => {
    const formattedUser = {
      id: `usr-${Math.random().toString(36).substring(2, 9)}`,
      email: email.trim(),
      name: name?.trim() || email.split('@')[0]
    };
    localStorage.setItem('skyops_user', JSON.stringify(formattedUser));
    await refreshSession();
  };

  const signOut = () => {
    localStorage.removeItem('skyops_user');
    localStorage.removeItem('skyops_active_org_id');
    setUser(null);
    setCurrentOrg(null);
    setOrganizations([]);
    refreshSession();
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
        currentOrg,
        organizations,
        role,
        members,
        loading,
        error,
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
