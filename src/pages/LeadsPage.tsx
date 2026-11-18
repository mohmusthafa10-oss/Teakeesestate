import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService } from '../services/crmService';
import { Lead, LeadStatus, PropertyType } from '../types/crm';
import { formatCurrency, formatDate, getTodayISO } from '../utils/formatters';
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  Pagination,
  StatusTag,
} from '../components/common/UIPrimitives';

export const LeadsPage: React.FC = () => {
  const { db, currentUser, route, navigate, updateDb, visibleLeads } = useCRM();
  const currency = db.settings.currencySymbol;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(route.filterStatus || 'All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [agentFilter, setAgentFilter] = useState('All');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [deletingLead, setDeletingLead] = useState<Lead | null>(null);

  // Independent Lead Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [preferredLocation, setPreferredLocation] = useState('');
  const [minBudget, setMinBudget] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType | 'Any'>('Plot / Land');
  const [requirementDescription, setRequirementDescription] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState(currentUser.id);
  const [status, setStatus] = useState<LeadStatus>('New');
  const [nextFollowUpDate, setNextFollowUpDate] = useState(getTodayISO());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (route.filterStatus) {
      setStatusFilter(route.filterStatus);
      setPage(1);
    }
  }, [route.filterStatus]);

  const openAddModal = () => {
    setEditingLead(null);
    setName('');
    setPhone('');
    setWhatsapp('');
    setPreferredLocation('');
    setMinBudget('');
    setMaxBudget('');
    setPropertyType('Plot / Land');
    setRequirementDescription('');
    setAssignedAgentId(currentUser.id);
    setStatus('New');
    setNextFollowUpDate(getTodayISO());
    setNotes('');
    setLeadModalOpen(true);
  };

  const openEditModal = (lead: Lead) => {
    setEditingLead(lead);
    setName(lead.name);
    setPhone(lead.phone);
    setWhatsapp(lead.whatsapp);
    setPreferredLocation(lead.preferredLocation);
    setMinBudget(String(lead.minBudget || ''));
    setMaxBudget(String(lead.maxBudget || ''));
    setPropertyType(lead.propertyType);
    setRequirementDescription(lead.requirementDescription);
    setAssignedAgentId(lead.assignedAgentId);
    setStatus(lead.status);
    setNextFollowUpDate(lead.nextFollowUpDate);
    setNotes(lead.notes);
    setLeadModalOpen(true);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleLeads.filter((l) => {
      if (q) {
        const hit =
          l.name.toLowerCase().includes(q) ||
          l.code.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          l.preferredLocation.toLowerCase().includes(q) ||
          l.requirementDescription.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (statusFilter !== 'All' && l.status !== statusFilter) return false;
      if (typeFilter !== 'All' && l.propertyType !== typeFilter) return false;
      if (agentFilter !== 'All' && l.assignedAgentId !== agentFilter) return false;
      return true;
    });
  }, [visibleLeads, search, statusFilter, typeFilter, agentFilter]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page]
  );

  const getAgentName = (id: string) =>
    db.users.find((u) => u.id === id)?.name || 'Unassigned';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    const ok = updateDb(
      (prev) =>
        crmService.upsertLead(prev, {
          id: editingLead?.id,
          name,
          phone,
          whatsapp: whatsapp || phone,
          preferredLocation,
          minBudget: Number(minBudget) || 0,
          maxBudget: Number(maxBudget) || 0,
          propertyType,
          requirementDescription,
          assignedAgentId,
          status,
          nextFollowUpDate,
          notes,
        }),
      editingLead ? 'Lead details updated' : 'Buyer lead registered'
    );
    if (ok) setLeadModalOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            Buyer Leads & Requirements
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Independent buyer requirements. Register a lead anytime and match properties directly from their profile.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="h-9 px-4 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Lead
        </button>
      </div>

      {/* Filters */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-4 flex flex-col lg:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search customer, ID, phone, location, or requirement..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-[#F1F0E8]/60 border border-[#E5E4DA] rounded-lg focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
          >
            <option value="All">All Statuses</option>
            {db.settings.leadStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
          >
            <option value="All">All Property Types</option>
            <option value="Any">Any</option>
            {db.settings.propertyCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={agentFilter}
            onChange={(e) => {
              setAgentFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
          >
            <option value="All">All Agents</option>
            {db.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No leads match your filters"
          description="Add a new independent buyer lead or adjust the current filter selection."
          actionLabel="Add Lead"
          onAction={openAddModal}
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                  <th className="py-3 px-4">Lead ID</th>
                  <th className="py-3 px-3">Customer Name</th>
                  <th className="py-3 px-3">Phone</th>
                  <th className="py-3 px-3">Preferred Location</th>
                  <th className="py-3 px-3">Budget</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Requirement Summary</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Agent</th>
                  <th className="py-3 px-3">Next Follow-up</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DA] text-xs">
                {paged.map((lead) => (
                  <tr key={lead.id} className="hover:bg-[#F1F0E8]/40 transition-colors">
                    <td className="py-3 px-4 font-mono tabular-nums text-[11px] text-[#77796F] whitespace-nowrap">
                      {lead.code}
                    </td>
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        onClick={() =>
                          navigate({ page: 'lead-detail', id: lead.id })
                        }
                        className="font-semibold text-[#064E3B] hover:underline text-left whitespace-nowrap cursor-pointer"
                      >
                        {lead.name}
                      </button>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                      {lead.phone}
                    </td>
                    <td className="py-3 px-3 text-[#20251F] whitespace-nowrap">
                      {lead.preferredLocation || 'Flexible'}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-[#064E3B] font-medium whitespace-nowrap">
                      {lead.maxBudget > 0
                        ? `${formatCurrency(lead.minBudget, currency)} – ${formatCurrency(
                            lead.maxBudget,
                            currency
                          )}`
                        : 'Open'}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">{lead.propertyType}</td>
                    <td className="py-3 px-3 max-w-[230px]">
                      <p className="text-[#77796F] truncate">
                        {lead.requirementDescription}
                      </p>
                    </td>
                    <td className="py-3 px-3">
                      <StatusTag status={lead.status} />
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getAgentName(lead.assignedAgentId)}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-[11px] text-[#77796F] whitespace-nowrap">
                      {lead.nextFollowUpDate ? formatDate(lead.nextFollowUpDate) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            navigate({ page: 'lead-detail', id: lead.id })
                          }
                          title="Open Lead Profile & Match Properties"
                          className="p-1.5 rounded-md hover:bg-[#E4EBE0] text-[#064E3B] cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(lead)}
                          title="Edit Lead"
                          className="p-1.5 rounded-md hover:bg-[#F1F0E8] text-[#20251F] cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingLead(lead)}
                          title="Delete Lead"
                          className="p-1.5 rounded-md hover:bg-[#C96C60]/15 text-[#C96C60] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            totalItems={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Add / Edit Lead Modal */}
      <Modal
        open={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
        title={editingLead ? `Edit Lead — ${editingLead.name}` : 'Register Independent Buyer Lead'}
        subtitle="No property selection required during lead registration."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium mb-1">Customer Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maheshwar Pai"
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Phone Number *</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98470 00000"
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">WhatsApp</label>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="Same as phone if blank"
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Preferred Location</label>
              <input
                type="text"
                value={preferredLocation}
                onChange={(e) => setPreferredLocation(e.target.value)}
                placeholder="e.g. Kanhangad, Bekal"
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Minimum Budget ({currency})
              </label>
              <input
                type="number"
                value={minBudget}
                onChange={(e) => setMinBudget(e.target.value)}
                placeholder="1500000"
                className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Maximum Budget ({currency})
              </label>
              <input
                type="number"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
                placeholder="2500000"
                className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Property Type</label>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value as PropertyType | 'Any')}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="Any">Any Type</option>
                {db.settings.propertyCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Lead Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LeadStatus)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                {db.settings.leadStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Assigned Agent</label>
              <select
                value={assignedAgentId}
                onChange={(e) => setAssignedAgentId(e.target.value)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                {db.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Follow-up Date</label>
              <input
                type="date"
                value={nextFollowUpDate}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">
                Requirement Description
              </label>
              <textarea
                rows={4}
                value={requirementDescription}
                onChange={(e) => setRequirementDescription(e.target.value)}
                placeholder="Looking for 10–15 cents of land around Kanhangad. Budget up to ₹25 lakh. Needs road access and residential surroundings."
                className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg leading-relaxed"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Agent Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E4DA]">
            <button
              type="button"
              onClick={() => setLeadModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              {editingLead ? 'Save Changes' : 'Register Lead'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingLead)}
        title="Delete Lead"
        message={`Remove lead "${deletingLead?.name}" and their property match history?`}
        confirmLabel="Delete Lead"
        onCancel={() => setDeletingLead(null)}
        onConfirm={() => {
          if (!deletingLead) return;
          updateDb(
            (prev) => crmService.deleteLead(prev, deletingLead.id),
            'Lead removed'
          );
          setDeletingLead(null);
        }}
      />
    </div>
  );
};
