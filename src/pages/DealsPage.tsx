import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService } from '../services/crmService';
import { Deal, DealStatus } from '../types/crm';
import { formatCurrency, formatDate, getTodayISO } from '../utils/formatters';
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  StatusTag,
} from '../components/common/UIPrimitives';

const DEAL_STAGES: DealStatus[] = [
  'Interested',
  'Site Visit',
  'Negotiation',
  'Booking',
  'Closed',
  'Cancelled',
  'Lost',
];

export const DealsPage: React.FC = () => {
  const { db, currentUser, navigate, updateDb, visibleDeals } = useCRM();
  const currency = db.settings.currencySymbol;

  const [stageFilter, setStageFilter] = useState<string>('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [deletingDeal, setDeletingDeal] = useState<Deal | null>(null);

  // Form fields
  const [dealType, setDealType] = useState<'Sale' | 'Rental'>('Sale');
  const [leadId, setLeadId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState(currentUser.id);
  const [agreedPrice, setAgreedPrice] = useState('');
  const [commissionRate, setCommissionRate] = useState(
    String(db.settings.defaultCommissionRate || 2)
  );
  const [dealDate, setDealDate] = useState(getTodayISO());
  const [status, setStatus] = useState<DealStatus>('Negotiation');
  const [notes, setNotes] = useState('');

  const availablePropertiesForDeal = useMemo(() => {
    return db.properties.filter(
      (p) => p.status !== 'Sold' || (editingDeal && editingDeal.propertyId === p.id)
    );
  }, [db.properties, editingDeal]);

  const openCreateModal = () => {
    setEditingDeal(null);
    const firstProp = availablePropertiesForDeal[0];
    setDealType('Sale');
    setLeadId(db.leads[0]?.id || '');
    setPropertyId(firstProp?.id || '');
    setAssignedAgentId(firstProp?.assignedAgentId || currentUser.id);
    setAgreedPrice(String(firstProp?.askingPrice || ''));
    setCommissionRate(String(db.settings.defaultCommissionRate || 2));
    setDealDate(getTodayISO());
    setStatus('Negotiation');
    setNotes('');
    setModalOpen(true);
  };

  const openEditModal = (deal: Deal) => {
    setEditingDeal(deal);
    setDealType(deal.dealType);
    setLeadId(deal.leadId);
    setPropertyId(deal.propertyId);
    setAssignedAgentId(deal.assignedAgentId);
    setAgreedPrice(String(deal.agreedPrice));
    setCommissionRate(String(deal.commissionRate));
    setDealDate(deal.dealDate);
    setStatus(deal.status);
    setNotes(deal.notes);
    setModalOpen(true);
  };

  const filtered = useMemo(() => {
    if (stageFilter === 'All') return visibleDeals;
    return visibleDeals.filter((d) => d.status === stageFilter);
  }, [visibleDeals, stageFilter]);

  const metrics = useMemo(() => {
    const closed = visibleDeals.filter((d) => d.status === 'Closed');
    const active = visibleDeals.filter(
      (d) => !['Closed', 'Cancelled', 'Lost'].includes(d.status)
    );
    return {
      closedCount: closed.length,
      closedVolume: closed.reduce((s, d) => s + d.agreedPrice, 0),
      commissionEarned: closed.reduce((s, d) => s + d.commissionAmount, 0),
      activeVolume: active.reduce((s, d) => s + d.agreedPrice, 0),
    };
  }, [visibleDeals]);

  const previewCommission = Math.round(
    ((Number(agreedPrice) || 0) * (Number(commissionRate) || 0)) / 100
  );

  const selectedProperty = db.properties.find((p) => p.id === propertyId);
  const autoSeller = selectedProperty
    ? db.sellers.find((s) => s.id === selectedProperty.sellerId)
    : undefined;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadId || !propertyId || !agreedPrice) return;
    const ok = updateDb(
      (prev) =>
        crmService.upsertDeal(prev, {
          id: editingDeal?.id,
          dealType,
          leadId,
          propertyId,
          assignedAgentId,
          agreedPrice: Number(agreedPrice),
          commissionRate: Number(commissionRate) || 0,
          dealDate,
          status,
          notes,
        }),
      status === 'Closed'
        ? 'Deal closed and property status updated automatically'
        : editingDeal
        ? 'Deal updated'
        : 'Deal created'
    );
    if (ok) setModalOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            Deals & Sales Pipeline
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Closing a deal automatically updates the property to Sold or Rented and converts the buyer lead.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="h-9 px-4 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Deal
        </button>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#151D18] text-[#FFFFFF] rounded-xl p-4">
          <p className="text-[11px] text-[#A8B9A2]">Closed Deals Volume</p>
          <p className="text-xl font-mono tabular-nums font-semibold mt-1">
            {formatCurrency(metrics.closedVolume, currency)}
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-4">
          <p className="text-[11px] text-[#77796F]">Commission Earned</p>
          <p className="text-xl font-mono tabular-nums font-semibold text-[#064E3B] mt-1">
            {formatCurrency(metrics.commissionEarned, currency)}
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-4">
          <p className="text-[11px] text-[#77796F]">Active Negotiation Value</p>
          <p className="text-xl font-mono tabular-nums font-semibold text-[#20251F] mt-1">
            {formatCurrency(metrics.activeVolume, currency)}
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-4">
          <p className="text-[11px] text-[#77796F]">Closed Transactions</p>
          <p className="text-xl font-mono tabular-nums font-semibold text-[#20251F] mt-1">
            {metrics.closedCount}
          </p>
        </div>
      </div>

      {/* Stage Filter */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-3 flex flex-wrap gap-1.5">
        {['All', ...DEAL_STAGES].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStageFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              stageFilter === st
                ? 'bg-[#064E3B] text-[#FFFFFF]'
                : 'bg-[#F1F0E8]/60 text-[#20251F] hover:bg-[#E4EBE0]'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No deals in this stage"
          description="Create a new deal from an active buyer lead and available property."
          actionLabel="Create Deal"
          onAction={openCreateModal}
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                  <th className="py-3 px-4">Deal ID</th>
                  <th className="py-3 px-3">Property</th>
                  <th className="py-3 px-3">Buyer</th>
                  <th className="py-3 px-3">Seller</th>
                  <th className="py-3 px-3">Agreed Price</th>
                  <th className="py-3 px-3">Commission</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Agent</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DA] text-xs">
                {filtered.map((deal) => {
                  const prop = db.properties.find((p) => p.id === deal.propertyId);
                  const buyer = db.leads.find((l) => l.id === deal.leadId);
                  const seller = db.sellers.find((s) => s.id === deal.sellerId);
                  const agent = db.users.find((u) => u.id === deal.assignedAgentId);
                  return (
                    <tr key={deal.id} className="hover:bg-[#F1F0E8]/40">
                      <td className="py-3 px-4 font-mono tabular-nums text-[11px] text-[#77796F]">
                        {deal.code}
                        <span className="block text-[10px]">{deal.dealType}</span>
                      </td>
                      <td className="py-3 px-3">
                        {prop ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate({ page: 'property-detail', id: prop.id })
                            }
                            className="font-semibold text-[#064E3B] hover:underline text-left cursor-pointer"
                          >
                            {prop.title}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {buyer ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate({ page: 'lead-detail', id: buyer.id })
                            }
                            className="font-medium text-[#20251F] hover:text-[#064E3B] hover:underline cursor-pointer"
                          >
                            {buyer.name}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {seller ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate({ page: 'seller-detail', id: seller.id })
                            }
                            className="text-[#77796F] hover:text-[#064E3B] hover:underline cursor-pointer"
                          >
                            {seller.name}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums font-semibold text-[#20251F] whitespace-nowrap">
                        {formatCurrency(deal.agreedPrice, currency)}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-[#064E3B] font-medium whitespace-nowrap">
                        {formatCurrency(deal.commissionAmount, currency)} ({deal.commissionRate}%)
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-[11px] text-[#77796F] whitespace-nowrap">
                        {formatDate(deal.dealDate)}
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={deal.status}
                          onChange={(e) =>
                            updateDb(
                              (prev) =>
                                crmService.upsertDeal(prev, {
                                  ...deal,
                                  status: e.target.value as DealStatus,
                                }),
                              `Deal ${deal.code} marked ${e.target.value}`
                            )
                          }
                          className="h-7 px-2 text-[11px] border border-[#E5E4DA] rounded bg-[#FFFFFF]"
                        >
                          {DEAL_STAGES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {agent?.name || '—'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(deal)}
                            className="p-1.5 rounded-md hover:bg-[#F1F0E8] text-[#20251F] cursor-pointer"
                            title="Edit Deal"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingDeal(deal)}
                            className="p-1.5 rounded-md hover:bg-[#C96C60]/15 text-[#C96C60] cursor-pointer"
                            title="Delete Deal"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Deal Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingDeal ? `Edit Deal — ${editingDeal.code}` : 'Create Property Deal'}
        subtitle="Closing a Sale deal automatically marks the property Sold and removes it from Available Listings."
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium mb-1">Deal Type</label>
              <select
                value={dealType}
                onChange={(e) => setDealType(e.target.value as 'Sale' | 'Rental')}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="Sale">Sale</option>
                <option value="Rental">Rental Lease</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Deal Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DealStatus)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                {DEAL_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Property *</label>
              <select
                required
                value={propertyId}
                onChange={(e) => {
                  const prop = db.properties.find((p) => p.id === e.target.value);
                  setPropertyId(e.target.value);
                  if (prop && !editingDeal) {
                    setAgreedPrice(String(prop.askingPrice));
                    setAssignedAgentId(prop.assignedAgentId);
                  }
                }}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="">Select property...</option>
                {availablePropertiesForDeal.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Buyer Lead *</label>
              <select
                required
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="">Select buyer...</option>
                {db.leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
            {autoSeller && (
              <div className="sm:col-span-2 px-3 py-2 rounded-lg bg-[#F1F0E8] text-xs text-[#20251F]">
                Linked Seller: <span className="font-semibold">{autoSeller.name}</span> ({autoSeller.phone})
              </div>
            )}
            <div>
              <label className="block text-xs font-medium mb-1">
                Agreed Price ({currency}) *
              </label>
              <input
                type="number"
                required
                value={agreedPrice}
                onChange={(e) => setAgreedPrice(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Commission Rate (%) — {formatCurrency(previewCommission, currency)}
              </label>
              <input
                type="number"
                step="0.1"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Deal Date</label>
              <input
                type="date"
                value={dealDate}
                onChange={(e) => setDealDate(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
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
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Deal Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E4DA]">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              {editingDeal ? 'Update Deal' : 'Save Deal'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingDeal)}
        title="Delete Deal"
        message={`Delete deal ${deletingDeal?.code}?`}
        confirmLabel="Delete"
        onCancel={() => setDeletingDeal(null)}
        onConfirm={() => {
          if (!deletingDeal) return;
          updateDb(
            (prev) => crmService.deleteDeal(prev, deletingDeal.id),
            'Deal removed'
          );
          setDeletingDeal(null);
        }}
      />
    </div>
  );
};
