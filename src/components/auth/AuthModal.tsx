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
  Zap
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, Modal } from '../common/UI';
import { resolvedFirebaseConfig } from '../../firebase';

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
    sendPasswordReset,
    signOut
  } = useAuth();

  const [tab, setTab] = useState<'signin' | 'signup' | 'reset'>('signin');
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
    if (!email.trim() || (tab !== 'reset' && !password.trim())) {
      setAuthError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      setAuthError(null);

      if (tab === 'reset') {
        await sendPasswordReset(email);
        setAuthSuccess('Password reset link sent to your email address');
        return;
      }

      if (tab === 'signup') {
        await signUpWithEmail(email, password, displayName);
        setAuthSuccess('Account registered successfully with SkyOps!');
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

  const handleSignOut = async () => {
    try {
      setLoading(true);
      await signOut();
      setAuthSuccess('Signed out of SkyOps');
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      setAuthError(err.message || 'Sign out failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="SkyOps Authentication & Identity" maxWidth="lg">
      <div className="space-y-6">
        {/* Firebase Environment Status Banner */}
        <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-zinc-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Firebase Project: <strong className="text-zinc-100">{resolvedFirebaseConfig.projectId}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Database className="w-3.5 h-3.5 text-sky-400" />
            <span>Firestore: Connected</span>
          </div>
        </div>

        {/* Current User Card if signed in */}
        {user && (
          <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-300 font-bold text-sm font-mono">
                {user.name.charAt(0).toUpperCase()}
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
                <div className="text-xs text-zinc-400 font-mono">{user.email}</div>
                <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                  Role: <span className="text-amber-400 font-semibold">{role}</span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={loading} className="text-rose-400 hover:text-rose-300">
              <LogOut className="w-4 h-4 mr-1.5" />
              Sign Out
            </Button>
          </div>
        )}

        {/* Notification alerts */}
        {authError && (
          <div className="p-3.5 bg-rose-950/40 border border-rose-800 rounded-xl text-rose-300 text-xs font-mono flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div>{authError}</div>
          </div>
        )}

        {authSuccess && (
          <div className="p-3.5 bg-emerald-950/40 border border-emerald-800 rounded-xl text-emerald-300 text-xs font-mono flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <div>{authSuccess}</div>
          </div>
        )}

        {/* Form Selection Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => {
              setTab('signin');
              setAuthError(null);
            }}
            className={`py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              tab === 'signin' ? 'bg-zinc-800 text-sky-400 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('signup');
              setAuthError(null);
            }}
            className={`py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              tab === 'signup' ? 'bg-zinc-800 text-sky-400 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            Create Account
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('reset');
              setAuthError(null);
            }}
            className={`py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              tab === 'reset' ? 'bg-zinc-800 text-sky-400 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Reset Password
          </button>
        </div>

        {/* Single Sign-On (Google) */}
        {tab !== 'reset' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-xl text-zinc-100 font-medium text-xs flex items-center justify-center gap-3 transition-colors shadow-xs"
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
              <span>Continue with Google Workspace (SSO)</span>
            </button>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-zinc-800 w-full" />
              <span className="bg-zinc-900 px-3 text-[11px] font-mono text-zinc-500 uppercase tracking-wider absolute">
                Or with corporate email
              </span>
            </div>
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          {tab === 'signup' && (
            <div>
              <label className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">
                Full Name or Engineering Callout
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="e.g. Alex Rivera (Staff SRE)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">Corporate Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                placeholder="sre@acme.corp"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>
          </div>

          {tab !== 'reset' && (
            <div>
              <label className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>
            </div>
          )}

          <div className="pt-2">
            <Button variant="primary" type="submit" disabled={loading} className="w-full justify-center">
              {loading ? (
                'Processing...'
              ) : tab === 'signin' ? (
                'Sign In to SkyOps'
              ) : tab === 'signup' ? (
                'Create SkyOps Account'
              ) : (
                'Send Password Reset Link'
              )}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
