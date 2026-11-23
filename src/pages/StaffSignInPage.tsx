import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Headphones,
  Loader2,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_LOGO_URL } from '../services/crmService';

interface StaffSignInPageProps {
  onNavigatePath: (path: string) => void;
}

export const StaffSignInPage: React.FC<StaffSignInPageProps> = ({
  onNavigatePath,
}) => {
  const { authStatus, authError, firebaseUser, signInWithGoogle, signOutUser } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // Error surfaced via authError
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F0E8] text-[#20251F] flex flex-col justify-between p-4 sm:p-6">
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <button
          type="button"
          onClick={() => onNavigatePath('/')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Public Property Showcase
        </button>

        <button
          type="button"
          onClick={() => onNavigatePath('/submit-property')}
          className="text-xs font-medium text-[#77796F] hover:text-[#20251F] cursor-pointer"
        >
          Public Seller Form →
        </button>
      </div>

      <div className="max-w-md w-full mx-auto my-8 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-7 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <img
            src={DEFAULT_LOGO_URL}
            alt="Teakees CRM"
            className="w-11 h-11 rounded-full object-cover border border-[#E5E4DA]"
          />
          <div>
            <h1 className="text-lg font-semibold text-[#20251F]">
              Teakees Staff CRM
            </h1>
            <p className="text-xs text-[#77796F]">
              Role-Based Agency Operations Portal
            </p>
          </div>
        </div>

        {authStatus === 'loading' ? (
          <div className="py-8 flex flex-col items-center justify-center gap-3 text-xs text-[#77796F]">
            <Loader2 className="w-6 h-6 animate-spin text-[#064E3B]" />
            <span>Verifying team credentials...</span>
          </div>
        ) : authStatus === 'unauthorized' ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#C96C60]/10 border border-[#C96C60]/30 text-xs text-[#9E3E33] space-y-1.5">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Access Not Authorized</span>
              </div>
              <p className="leading-relaxed">
                {authError ||
                  'Your Google account is not registered as an active Teakees team member.'}
              </p>
              {firebaseUser?.email && (
                <p className="font-mono text-[11px] pt-1">
                  Signed in as: {firebaseUser.email}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="w-full h-10 rounded-xl border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium text-[#20251F] cursor-pointer"
            >
              Sign Out & Try Another Account
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {authError && (
              <div className="p-3 rounded-xl bg-[#C96C60]/10 border border-[#C96C60]/30 text-xs text-[#9E3E33]">
                {authError}
              </div>
            )}

            <button
              type="button"
              disabled={signingIn}
              onClick={handleGoogleSignIn}
              className="w-full h-11 px-4 rounded-xl bg-[#064E3B] hover:bg-[#176B50] disabled:opacity-60 text-[#FFFFFF] text-sm font-medium flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
            >
              {signingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
                  />
                </svg>
              )}
              <span>{signingIn ? 'Signing in...' : 'Sign in with Google'}</span>
            </button>

            <div className="pt-3 border-t border-[#E5E4DA] space-y-2.5 text-xs text-[#77796F]">
              <p className="font-semibold text-[#20251F]">Supported Access Roles</p>
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#064E3B] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[#20251F]">Admin:</strong> Review submissions, approve, publish listings, assign salespeople, and manage team roles.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <Headphones className="w-4 h-4 text-[#064E3B] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[#20251F]">Telecaller:</strong> Submit seller property listings with photos & videos and track approval status.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <UserCheck className="w-4 h-4 text-[#064E3B] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[#20251F]">Agent / Salesperson:</strong> Access assigned properties, seller contacts, media, and follow-ups.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-[#77796F] flex items-center justify-center gap-1.5">
        <Building2 className="w-3.5 h-3.5 text-[#064E3B]" />
        Teakees Real Estate CRM Platform
      </p>
    </div>
  );
};
