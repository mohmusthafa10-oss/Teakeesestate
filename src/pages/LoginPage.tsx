import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { InfinityPreloader } from '../components/common/InfinityPreloader';

export const LoginPage: React.FC = () => {
  const { login, db } = useCRM();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your company email address.');
      return;
    }
    if (!password) {
      setError('Please enter your account password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(trimmedEmail, password);
    } catch (err: any) {
      const msg = err?.message || 'Invalid credentials or inactive account. Please check your details.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F0E8] flex flex-col items-center justify-center px-4 py-12">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[#A8B9A2]/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[#064E3B]/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#064E3B] text-white shadow-md mb-3">
            <span className="font-serif text-2xl font-bold tracking-tight">T</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            {db.settings.agencyName || 'Teakees Real Estate'}
          </h1>
          <p className="text-xs text-[#77796F] mt-1 font-medium">
            {db.settings.agencyTagline || 'Centralized Agency Management CRM'}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl shadow-sm p-6 sm:p-8 relative">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-[#20251F]">Sign In to Your Workspace</h2>
            <p className="text-xs text-[#77796F] mt-1">
              Enter your corporate credentials to access the secure CRM.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
              <span className="font-bold shrink-0">!</span>
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-semibold text-[#20251F] mb-1.5" htmlFor="login-email">
                Company Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#77796F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@testate.in"
                  disabled={isSubmitting}
                  className="w-full h-10 pl-10 pr-3.5 text-xs bg-[#F1F0E8]/40 border border-[#E5E4DA] rounded-lg text-[#20251F] placeholder-[#77796F] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B] focus:ring-1 focus:ring-[#064E3B] transition-colors disabled:opacity-50"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#20251F] mb-1.5" htmlFor="login-password">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#77796F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={isSubmitting}
                  className="w-full h-10 pl-10 pr-10 text-xs bg-[#F1F0E8]/40 border border-[#E5E4DA] rounded-lg text-[#20251F] placeholder-[#77796F] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B] focus:ring-1 focus:ring-[#064E3B] transition-colors disabled:opacity-50"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#77796F] hover:text-[#20251F] p-1 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[#77796F]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-[#E5E4DA] text-[#064E3B] focus:ring-[#064E3B]"
                />
                <span>Remember me on this device</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-10 rounded-lg bg-[#064E3B] hover:bg-[#176B50] active:scale-[0.99] text-[#FFFFFF] text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed mt-2"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Verifying Credentials...</span>
                </div>
              ) : (
                <span>Sign In to CRM</span>
              )}
            </button>
          </form>

          {/* Security & Access Notice */}
          <div className="mt-6 pt-5 border-t border-[#E5E4DA] text-center">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-[#77796F]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#064E3B]" />
              <span>Role-Protected Internal System</span>
            </div>
            <p className="text-[11px] text-[#77796F] mt-1.5 leading-relaxed">
              Public self-registration is disabled. Employee accounts and assigned roles are provisioned exclusively by the System Administrator.
            </p>
          </div>
        </div>

        {/* Quick Demo Hint */}
        <div className="mt-6 p-4 rounded-xl bg-[#FFFFFF]/70 border border-[#E5E4DA] text-center text-xs text-[#77796F]">
          <p className="font-semibold text-[#20251F] mb-1">Company Staff Credentials</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
            <span>Admin: <strong className="text-[#064E3B]">admin@testate.in</strong> (admin123)</span>
            <span>Agent: <strong className="text-[#064E3B]">agent1@testate.in</strong> (agent123)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
