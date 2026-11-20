import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  KeyRound,
  Mail,
  Phone,
  Save,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { apiClient } from '../services/apiClient';

export const ProfilePage: React.FC = () => {
  const { currentUser, notify } = useCRM();

  const [name, setName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [designation, setDesignation] = useState(currentUser?.designation || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSaveSuccess(false);

    if (password && password.length < 6) {
      setErrorMsg('New password must be at least 6 characters long.');
      return;
    }
    if (password && password !== confirmPassword) {
      setErrorMsg('New password and confirmation do not match.');
      return;
    }

    setIsSaving(true);
    try {
      const payload: { name?: string; phone?: string; designation?: string; password?: string } = {
        name,
        phone,
        designation,
      };
      if (password) {
        payload.password = password;
      }

      await apiClient.updateProfile(payload);
      setSaveSuccess(true);
      setPassword('');
      setConfirmPassword('');
      notify('Profile updated successfully.', 'success');
      // Refresh current user in state if supported
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update profile.');
      notify('Failed to update profile.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const initials = (currentUser?.name || 'User')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#20251F]">My Profile</h1>
        <p className="text-xs text-[#77796F] mt-0.5">
          View your assigned role, personal contact details and account security settings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Profile Card */}
        <div className="lg:col-span-1">
          <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 shadow-sm text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-[#064E3B] text-[#FFFFFF] flex items-center justify-center font-semibold text-2xl shadow-sm mb-4">
              {initials}
            </div>
            <h2 className="text-base font-semibold text-[#20251F]">{currentUser?.name}</h2>
            <p className="text-xs text-[#77796F] mt-0.5">{currentUser?.designation || 'Real Estate Specialist'}</p>

            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E4EBE0] text-[#064E3B]">
              <Shield className="w-3.5 h-3.5" />
              <span>Role: {currentUser?.role}</span>
            </div>

            <div className="mt-6 pt-5 border-t border-[#E5E4DA] space-y-3 text-left">
              <div className="flex items-center gap-3 text-xs text-[#77796F]">
                <Mail className="w-4 h-4 text-[#064E3B] shrink-0" />
                <span className="truncate font-medium text-[#20251F]">{currentUser?.email}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#77796F]">
                <Phone className="w-4 h-4 text-[#064E3B] shrink-0" />
                <span className="font-medium text-[#20251F]">{currentUser?.phone || 'Not configured'}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#77796F]">
                <Calendar className="w-4 h-4 text-[#064E3B] shrink-0" />
                <span>Account Status: <strong className="text-emerald-700">Active</strong></span>
              </div>
            </div>

            <div className="mt-6 p-3 rounded-xl bg-[#F1F0E8]/70 border border-[#E5E4DA] text-left">
              <p className="text-[11px] font-semibold text-[#20251F]">Role & Permission Policy</p>
              <p className="text-[11px] text-[#77796F] mt-1 leading-relaxed">
                Roles and system permissions are managed strictly by the agency System Administrator. Employees cannot modify their own assigned role.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Edit Profile & Security */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#20251F] mb-4">Edit Personal Information</h2>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            {saveSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Your profile details have been saved successfully!</span>
              </div>
            )}

            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#20251F] mb-1.5" htmlFor="name">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full h-9 pl-9 pr-3 text-xs bg-[#F1F0E8]/40 border border-[#E5E4DA] rounded-lg text-[#20251F] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#20251F] mb-1.5" htmlFor="email">
                    Corporate Email (Read Only)
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="email"
                      type="email"
                      value={currentUser?.email}
                      disabled
                      className="w-full h-9 pl-9 pr-3 text-xs bg-[#F1F0E8] border border-[#E5E4DA] rounded-lg text-[#77796F] cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#20251F] mb-1.5" htmlFor="phone">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="phone"
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98470 00000"
                      className="w-full h-9 pl-9 pr-3 text-xs bg-[#F1F0E8]/40 border border-[#E5E4DA] rounded-lg text-[#20251F] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#20251F] mb-1.5" htmlFor="designation">
                    Designation
                  </label>
                  <input
                    id="designation"
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Senior Property Advisor"
                    className="w-full h-9 px-3 text-xs bg-[#F1F0E8]/40 border border-[#E5E4DA] rounded-lg text-[#20251F] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[#E5E4DA]">
                <h3 className="text-xs font-semibold text-[#20251F] mb-1">Change Password (Optional)</h3>
                <p className="text-[11px] text-[#77796F] mb-3">Leave blank if you do not want to change your password.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#20251F] mb-1.5" htmlFor="new-password">
                      New Password
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="new-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full h-9 pl-9 pr-3 text-xs bg-[#F1F0E8]/40 border border-[#E5E4DA] rounded-lg text-[#20251F] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#20251F] mb-1.5" htmlFor="confirm-password">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full h-9 pl-9 pr-3 text-xs bg-[#F1F0E8]/40 border border-[#E5E4DA] rounded-lg text-[#20251F] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-9 px-4 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-[#FFFFFF] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
