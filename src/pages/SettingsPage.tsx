import React, { useState } from 'react';
import { Lock, Plus, RotateCcw, ShieldCheck, UserPlus } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService } from '../services/crmService';
import { PropertyType, UserRole } from '../types/crm';
import { ConfirmDialog, Modal } from '../components/common/UIPrimitives';

export const SettingsPage: React.FC = () => {
  const { db, currentUser, isAdmin, updateDb, resetDemo, notify } = useCRM();

  const [agencyName, setAgencyName] = useState(db.settings.agencyName);
  const [agencyTagline, setAgencyTagline] = useState(db.settings.agencyTagline);
  const [currencySymbol, setCurrencySymbol] = useState(db.settings.currencySymbol);
  const [defaultCommission, setDefaultCommission] = useState(
    String(db.settings.defaultCommissionRate)
  );
  const [defaultTime, setDefaultTime] = useState(
    db.settings.followUpDefaults.defaultTime
  );
  const [reminderWindow, setReminderWindow] = useState(
    String(db.settings.followUpDefaults.reminderWindowHours)
  );

  const [newCategory, setNewCategory] = useState('');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPhone, setUPhone] = useState('');
  const [uRole, setURole] = useState<UserRole>('Agent');
  const [uDesignation, setUDesignation] = useState('Property Advisor');

  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      notify('Only Admin users can modify company settings.', 'error');
      return;
    }
    updateDb(
      (prev) =>
        crmService.updateSettings(prev, {
          agencyName: agencyName.trim() || 'Real Estate CRM',
          agencyTagline: agencyTagline.trim(),
          currencySymbol: currencySymbol.trim() || '₹',
          defaultCommissionRate: Number(defaultCommission) || 2,
          followUpDefaults: {
            ...prev.settings.followUpDefaults,
            defaultTime,
            reminderWindowHours: Number(reminderWindow) || 24,
          },
        }),
      'Agency & follow-up settings saved'
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            Settings & Team Permissions
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Configure agency branding, team members, access roles, property categories, lead stages, and follow-up defaults.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setConfirmResetOpen(true)}
            className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium text-[#20251F] flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#C96C60]" />
            Reset Demo Data
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="p-4 rounded-xl bg-[#D9AC57]/15 border border-[#D9AC57]/40 flex items-center gap-3 text-xs text-[#7A5612]">
          <Lock className="w-4 h-4 shrink-0" />
          <span>
            Signed in as <strong>{currentUser.name} (Agent)</strong>. Agency-wide settings and team administration require Admin permissions. You can switch to an Admin user in the top-right user menu.
          </span>
        </div>
      )}

      {/* Company & Follow-up Settings */}
      <form
        onSubmit={handleSaveCompany}
        className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-5"
      >
        <div className="pb-3 border-b border-[#E5E4DA]">
          <h2 className="text-sm font-semibold text-[#20251F]">
            Company & Follow-up Configuration
          </h2>
          <p className="text-xs text-[#77796F]">
            Update the application name and default operating parameters without changing code.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">
              Configurable Agency Name
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg disabled:bg-[#F1F0E8]/60"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium mb-1">Agency Tagline</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={agencyTagline}
              onChange={(e) => setAgencyTagline(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg disabled:bg-[#F1F0E8]/60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Currency Symbol</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={currencySymbol}
              onChange={(e) => setCurrencySymbol(e.target.value)}
              className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg disabled:bg-[#F1F0E8]/60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Default Commission (%)
            </label>
            <input
              type="number"
              step="0.1"
              disabled={!isAdmin}
              value={defaultCommission}
              onChange={(e) => setDefaultCommission(e.target.value)}
              className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg disabled:bg-[#F1F0E8]/60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Default Follow-up Time
            </label>
            <input
              type="time"
              disabled={!isAdmin}
              value={defaultTime}
              onChange={(e) => setDefaultTime(e.target.value)}
              className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg disabled:bg-[#F1F0E8]/60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Reminder Window (Hours)
            </label>
            <input
              type="number"
              disabled={!isAdmin}
              value={reminderWindow}
              onChange={(e) => setReminderWindow(e.target.value)}
              className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg disabled:bg-[#F1F0E8]/60"
            />
          </div>
        </div>
        {isAdmin && (
          <div className="flex justify-end">
            <button
              type="submit"
              className="h-9 px-5 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] cursor-pointer"
            >
              Save Settings
            </button>
          </div>
        )}
      </form>

      {/* Team & Agent Management + Roles */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5E4DA] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#20251F]">
              Users, Agents & Access Control
            </h2>
            <p className="text-[11px] text-[#77796F]">
              Admins have full access. Agents view and manage their assigned leads, sellers, properties, follow-ups, and deals.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setUserModalOpen(true)}
              className="h-8 px-3 rounded-lg bg-[#E4EBE0] hover:bg-[#064E3B] text-[#064E3B] hover:text-[#FFFFFF] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add Team Member
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                <th className="py-2.5 px-5">Name</th>
                <th className="py-2.5 px-3">Email & Phone</th>
                <th className="py-2.5 px-3">Designation</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-5 text-right">Session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E4DA] text-xs">
              {db.users.map((u) => {
                const isSelf = u.id === currentUser.id;
                return (
                  <tr key={u.id} className="hover:bg-[#F1F0E8]/40">
                    <td className="py-3 px-5 font-semibold text-[#20251F]">
                      {u.name}
                    </td>
                    <td className="py-3 px-3 text-[#77796F]">
                      <span className="block">{u.email}</span>
                      <span className="font-mono text-[11px]">{u.phone}</span>
                    </td>
                    <td className="py-3 px-3">{u.designation}</td>
                    <td className="py-3 px-3">
                      <select
                        disabled={!isAdmin || isSelf}
                        value={u.role}
                        onChange={(e) =>
                          updateDb(
                            (prev) =>
                              crmService.upsertUser(prev, {
                                ...u,
                                role: e.target.value as UserRole,
                              }),
                            `Updated ${u.name}'s role to ${e.target.value}`
                          )
                        }
                        className="h-7 px-2 text-[11px] border border-[#E5E4DA] rounded bg-[#FFFFFF] disabled:opacity-60"
                      >
                        <option value="Admin">Admin</option>
                        <option value="Agent">Agent</option>
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        disabled={!isAdmin || isSelf}
                        onClick={() =>
                          updateDb(
                            (prev) =>
                              crmService.upsertUser(prev, {
                                ...u,
                                active: !u.active,
                              }),
                            `${u.name} ${u.active ? 'deactivated' : 'activated'}`
                          )
                        }
                        className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                          u.active
                            ? 'bg-[#E4EBE0] text-[#064E3B] border-[#A8B9A2]/60'
                            : 'bg-[#F1F0E8] text-[#77796F] border-[#E5E4DA]'
                        }`}
                      >
                        {u.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="py-3 px-5 text-right">
                      {isSelf ? (
                        <span className="text-[11px] font-semibold text-[#064E3B] inline-flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Active View
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            updateDb(
                              (prev) => ({
                                ...prev,
                                settings: { ...prev.settings, currentUserId: u.id },
                              }),
                              `Switched session to ${u.name} (${u.role})`
                            )
                          }
                          className="text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
                        >
                          Switch View
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Property Categories & Lead Status Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[#20251F]">Property Categories</h2>
          <div className="divide-y divide-[#E5E4DA]">
            {db.settings.propertyCategories.map((cat) => (
              <div
                key={cat}
                className="py-2 flex items-center justify-between text-xs"
              >
                <span className="font-medium text-[#20251F]">{cat}</span>
                {isAdmin && db.settings.propertyCategories.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateDb(
                        (prev) =>
                          crmService.updateSettings(prev, {
                            propertyCategories:
                              prev.settings.propertyCategories.filter(
                                (c) => c !== cat
                              ),
                          }),
                        `Removed category ${cat}`
                      )
                    }
                    className="text-[11px] text-[#C96C60] hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="flex gap-2 pt-2">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Add category..."
                className="flex-1 h-8 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newCategory.trim()) return;
                  updateDb(
                    (prev) =>
                      crmService.updateSettings(prev, {
                        propertyCategories: [
                          ...prev.settings.propertyCategories,
                          newCategory.trim() as PropertyType,
                        ],
                      }),
                    'Category added'
                  );
                  setNewCategory('');
                }}
                className="h-8 px-3 rounded-lg bg-[#064E3B] text-[#FFFFFF] text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
          )}
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[#20251F]">
            Lead Pipeline Stages
          </h2>
          <div className="divide-y divide-[#E5E4DA]">
            {db.settings.leadStatuses.map((st, idx) => (
              <div
                key={st}
                className="py-2 flex items-center justify-between text-xs"
              >
                <span className="text-[#20251F]">
                  <span className="font-mono text-[#77796F] mr-2">0{idx + 1}.</span>
                  <span className="font-medium">{st}</span>
                </span>
                <span className="text-[11px] font-mono text-[#77796F]">
                  {db.leads.filter((l) => l.status === st).length} leads
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title="Add Team Member"
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!uName.trim() || !uEmail.trim()) return;
            updateDb(
              (prev) =>
                crmService.upsertUser(prev, {
                  name: uName,
                  email: uEmail,
                  phone: uPhone,
                  role: uRole,
                  designation: uDesignation,
                }),
              'Team member added'
            );
            setUName('');
            setUEmail('');
            setUPhone('');
            setUserModalOpen(false);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={uName}
              onChange={(e) => setUName(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Email *</label>
            <input
              type="email"
              required
              value={uEmail}
              onChange={(e) => setUEmail(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Phone</label>
            <input
              type="tel"
              value={uPhone}
              onChange={(e) => setUPhone(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Role</label>
              <select
                value={uRole}
                onChange={(e) => setURole(e.target.value as UserRole)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="Agent">Agent</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Designation</label>
              <input
                type="text"
                value={uDesignation}
                onChange={(e) => setUDesignation(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setUserModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Add User
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmResetOpen}
        title="Restore Sample Agency Data"
        message="Reset all properties, sellers, leads, deals, investments, and rentals back to the initial demonstration records?"
        confirmLabel="Reset Data"
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          setConfirmResetOpen(false);
          resetDemo();
        }}
      />
    </div>
  );
};
