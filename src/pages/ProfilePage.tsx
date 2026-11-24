import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Mail,
  Phone,
  Save,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCRM } from '../context/CRMContext';
import { apiClient } from '../services/apiClient';

export const ProfilePage: React.FC = () => {
  const { crmUser, refreshProfile } = useAuth();
  const { currentUser, notify } = useCRM();

  const [name, setName] = useState(crmUser?.name || currentUser?.name || '');
  const [phone, setPhone] = useState(crmUser?.phone || currentUser?.phone || '');
  const [designation, setDesignation] = useState(
    crmUser?.designation || currentUser?.designation || ''
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (crmUser) {
      setName(crmUser.name);
      setPhone(crmUser.phone);
      setDesignation(crmUser.designation);
    }
  }, [crmUser]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSaveSuccess(false);

    if (name.trim().length < 2) {
      setErrorMsg('Please enter your full name.');
      return;
    }

    setIsSaving(true);
    try {
      await apiClient.updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        designation: designation.trim(),
      });
      await refreshProfile();
      setSaveSuccess(true);
      notify('Profile updated successfully.', 'success');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update profile.');
      notify('Failed to update profile.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const displayRole = crmUser?.role || currentUser?.role || 'AGENT';
  const displayEmail = crmUser?.email || currentUser?.email || '';
  const displayName = crmUser?.name || currentUser?.name || 'User';

  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#20251F]">My Profile</h1>
        <p className="text-xs text-[#77796F] mt-0.5">
          View your assigned CRM role, Google account identity, and personal contact details.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 shadow-sm text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-[#064E3B] text-[#FFFFFF] flex items-center justify-center font-semibold text-2xl shadow-sm mb-4">
              {initials}
            </div>
            <h2 className="text-base font-semibold text-[#20251F]">{displayName}</h2>
            <p className="text-xs text-[#77796F] mt-0.5">
              {crmUser?.designation || currentUser?.designation || 'Real Estate Specialist'}
            </p>

            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E4EBE0] text-[#064E3B]">
              <Shield className="w-3.5 h-3.5" />
              <span>Role: {displayRole}</span>
            </div>

            <div className="mt-6 pt-5 border-t border-[#E5E4DA] space-y-3 text-left">
              <div className="flex items-center gap-3 text-xs text-[#77796F]">
                <Mail className="w-4 h-4 text-[#064E3B] shrink-0" />
                <span className="truncate font-medium text-[#20251F]">{displayEmail}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#77796F]">
                <Phone className="w-4 h-4 text-[#064E3B] shrink-0" />
                <span className="font-medium text-[#20251F]">
                  {crmUser?.phone || currentUser?.phone || 'Not configured'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#77796F]">
                <Calendar className="w-4 h-4 text-[#064E3B] shrink-0" />
                <span>
                  Account Status: <strong className="text-[#064E3B]">Active · Google SSO</strong>
                </span>
              </div>
            </div>

            <div className="mt-6 p-3 rounded-xl bg-[#F1F0E8]/70 border border-[#E5E4DA] text-left">
              <p className="text-[11px] font-semibold text-[#20251F]">Role & Permission Policy</p>
              <p className="text-[11px] text-[#77796F] mt-1 leading-relaxed">
                Roles and publishing permissions are managed strictly by the agency System Administrator. Staff accounts cannot escalate their own permissions.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#20251F] mb-4">
              Edit Personal Information
            </h2>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-[#C96C60]/10 border border-[#C96C60]/30 text-xs text-[#9E3E33]">
                {errorMsg}
              </div>
            )}

            {saveSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-[#E4EBE0] border border-[#A8B9A2] text-xs text-[#064E3B] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Your profile details have been saved successfully.</span>
              </div>
            )}

            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-xs font-semibold text-[#20251F] mb-1.5"
                    htmlFor="name"
                  >
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
                  <label
                    className="block text-xs font-semibold text-[#20251F] mb-1.5"
                    htmlFor="email"
                  >
                    Corporate Google Email (Read Only)
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="email"
                      type="email"
                      value={displayEmail}
                      disabled
                      className="w-full h-9 pl-9 pr-3 text-xs bg-[#F1F0E8] border border-[#E5E4DA] rounded-lg text-[#77796F] cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label
                    className="block text-xs font-semibold text-[#20251F] mb-1.5"
                    htmlFor="phone"
                  >
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
                  <label
                    className="block text-xs font-semibold text-[#20251F] mb-1.5"
                    htmlFor="designation"
                  >
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
