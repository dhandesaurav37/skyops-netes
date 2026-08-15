import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Flame,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Shield,
  User as UserIcon,
  UserCheck,
  Zap
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, Modal } from '../common/UI';
import firebaseConfig from '../../../firebase-applet-config.json';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const {
    user,
    firebaseUser,
    role,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAnonymously,
    signInAsDemoUser,
    signOut
  } = useAuth();

  const [tab, setTab] = useState<'signin' | 'signup' | 'demo'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setAuthError(null);
      await signInWithGoogle();
      setAuthSuccess('Successfully signed in with Google');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setAuthError(err.message || 'Google sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setAuthError('Email and password are required');
      return;
    }

    try {
      setLoading(true);
      setAuthError(null);
      if (tab === 'signup') {
        await signUpWithEmail(email, password, displayName);
        setAuthSuccess('Account successfully registered with Firebase Auth!');
      } else {
        await signInWithEmail(email, password);
        setAuthSuccess('Signed in successfully!');
      }
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    try {
      setLoading(true);
      setAuthError(null);
      await signInAnonymously();
      setAuthSuccess('Signed in as Guest SRE via Firebase');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setAuthError(err.message || 'Anonymous sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = async (demoEmail: string, demoName: string) => {
    try {
      setLoading(true);
      setAuthError(null);
      await signInAsDemoUser(demoEmail, demoName);
      setAuthSuccess(`Switched to ${demoName}`);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setAuthError(err.message || 'Demo switch failed');
    } finally {
      setLoading(false);
    }
  };

  const demoPersonas = [
    {
      name: 'Alex Rivera',
      role: 'Staff SRE & Incident Commander (Owner)',
      email: 'sre-lead@acme.corp',
      badge: 'OWNER'
    },
    {
      name: 'Maya Lin',
      role: 'Principal Kubernetes Platform Architect',
      email: 'maya.lin@acme.corp',
      badge: 'ADMIN'
    },
    {
      name: 'David Chen',
      role: 'On-Call DevOps Engineer',
      email: 'david.chen@acme.corp',
      badge: 'ENGINEER'
    },
    {
      name: 'Security & Compliance Auditor',
      role: 'Read-Only Security Reviewer',
      email: 'auditor@acme.corp',
      badge: 'VIEWER'
    }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="SkyOps Authentication & Identity" maxWidth="lg">
      <div className="space-y-6">
        {/* Firebase Environment Status Banner */}
        <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-zinc-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Firebase Project: <strong className="text-zinc-100">{firebaseConfig.projectId}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Database className="w-3.5 h-3.5 text-sky-400" />
            <span>Firestore: Ready</span>
          </div>
        </div>

        {/* Current User Card if signed in */}
        {user && (
          <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-300 font-bold text-sm font-mono">
                {user.name.charAt(0)}
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  {user.name}
                  {firebaseUser && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                      Firebase Verified
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-zinc-400">{user.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-1 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                {role}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await signOut();
                  setAuthSuccess('Signed out');
                }}
                className="text-xs font-mono border-zinc-700 hover:bg-rose-950/40 hover:text-rose-300 hover:border-rose-800"
              >
                <LogOut className="w-3.5 h-3.5 mr-1" />
                Sign Out
              </Button>
            </div>
          </div>
        )}

        {/* Error / Success Notifications */}
        {authError && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg text-rose-300 text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {authSuccess && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-lg text-emerald-300 text-xs font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{authSuccess}</span>
          </div>
        )}

        {/* Auth Mode Tabs */}
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => {
              setTab('signin');
              setAuthError(null);
            }}
            className={`pb-2.5 px-4 text-xs font-mono font-medium transition-colors border-b-2 -mb-px ${
              tab === 'signin'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Email Sign In
          </button>
          <button
            onClick={() => {
              setTab('signup');
              setAuthError(null);
            }}
            className={`pb-2.5 px-4 text-xs font-mono font-medium transition-colors border-b-2 -mb-px ${
              tab === 'signup'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Create Account
          </button>
          <button
            onClick={() => {
              setTab('demo');
              setAuthError(null);
            }}
            className={`pb-2.5 px-4 text-xs font-mono font-medium transition-colors border-b-2 -mb-px ${
              tab === 'demo'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Demo SRE Personas
          </button>
        </div>

        {/* Sign In & Sign Up Form */}
        {(tab === 'signin' || tab === 'signup') && (
          <div className="space-y-4">
            {/* Primary Google Auth Action */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-100 font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="flex items-center gap-3 my-2">
              <div className="h-px bg-zinc-800 flex-1" />
              <span className="text-[10px] font-mono uppercase text-zinc-500">or with email credentials</span>
              <div className="h-px bg-zinc-800 flex-1" />
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-3">
              {tab === 'signup' && (
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">Display Name / Title</label>
                  <div className="relative">
                    <UserIcon className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="e.g. Alex Rivera (Lead SRE)"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">Corporate Email Address</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="engineer@skyops.io"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAnonymousSignIn}
                  disabled={loading}
                  className="text-xs font-mono text-zinc-400 hover:text-zinc-200"
                >
                  Continue as Guest
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={loading}
                  className="text-xs font-mono px-5 py-2 font-semibold"
                >
                  {loading ? 'Authenticating...' : tab === 'signup' ? 'Create Account' : 'Sign In'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Demo Personas */}
        {tab === 'demo' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400 font-mono">
              Quickly switch between pre-configured enterprise personas to test multi-tenant RBAC permissions:
            </p>

            <div className="space-y-2">
              {demoPersonas.map((persona) => (
                <div
                  key={persona.email}
                  onClick={() => handleDemoSignIn(persona.email, persona.name)}
                  className="p-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl cursor-pointer transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono font-bold text-xs text-zinc-200">
                      {persona.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                        {persona.name}
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                          {persona.badge}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono">{persona.role}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">{persona.email}</div>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" className="text-xs font-mono shrink-0">
                    Switch
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
