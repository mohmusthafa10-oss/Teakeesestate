import React, { useMemo, useState } from 'react';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService, SELLER_RELATIONSHIPS } from '../services/crmService';
import { Seller, SellerRelationship } from '../types/crm';
import { formatDate, formatDaysAgo } from '../utils/formatters';
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  Pagination,
} from '../components/common/UIPrimitives';

export const SellersPage: React.FC = () => {
  const { db, currentUser, navigate, updateDb, visibleSellers } = useCRM();

  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('All');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const [sellerModalOpen, setSellerModalOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);
  const [deletingSeller, setDeletingSeller] = useState<Seller | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [relationshipWithProperty, setRelationshipWithProperty] =
    useState<SellerRelationship>('Owner');
  const [notes, setNotes] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState(currentUser.id);

  const openAddModal = () => {
    setEditingSeller(null);
    setName('');
    setPhone('');
    setWhatsapp('');
    setAddress('');
    setRelationshipWithProperty('Owner');
    setNotes('');
    setAssignedAgentId(currentUser.id);
    setSellerModalOpen(true);
  };

  const openEditModal = (seller: Seller) => {
    setEditingSeller(seller);
    setName(seller.name);
    setPhone(seller.phone);
    setWhatsapp(seller.whatsapp);
    setAddress(seller.address);
    setRelationshipWithProperty(seller.relationshipWithProperty || 'Owner');
    setNotes(seller.notes);
    setAssignedAgentId(seller.assignedAgentId);
    setSellerModalOpen(true);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleSellers.filter((s) => {
      if (q) {
        const hit =
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.phone.includes(q) ||
          s.address.toLowerCase().includes(q) ||
          (s.relationshipWithProperty || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (agentFilter !== 'All' && s.assignedAgentId !== agentFilter) return false;
      return true;
    });
  }, [visibleSellers, search, agentFilter]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page]
  );

  const getAgentName = (id: string) =>
    db.users.find((u) => u.id === id)?.name || 'Unassigned';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    const ok = updateDb(
      (prev) =>
        crmService.upsertSeller(prev, {
          id: editingSeller?.id,
          name,
          phone,
          whatsapp: whatsapp || phone,
          address,
          relationshipWithProperty,
          notes,
          assignedAgentId,
        }),
      editingSeller
        ? 'Seller record updated (last-contacted log preserved)'
        : 'New seller registered'
    );
    if (ok) setSellerModalOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            Sellers &amp; Property Owners
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Track owner relationship, last-contacted activity, advances, and linked property listings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAddModal}
            className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/50 text-xs font-medium text-[#20251F] flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#064E3B]" />
            Add Seller Only
          </button>
          <button
            type="button"
            onClick={() => navigate({ page: 'register-property' })}
            className="h-9 px-3.5 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Seller + Property
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-4 flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search seller name, ID, phone, relationship, or address..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-[#F1F0E8]/60 border border-[#E5E4DA] rounded-lg focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
          />
        </div>
        <select
          value={agentFilter}
          onChange={(e) => {
            setAgentFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 px-3 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
        >
          <option value="All">All Agents</option>
          {db.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No sellers found"
          description="Register a seller directly or use Add Seller + Property to onboard an owner with their listing."
          actionLabel="Add Seller + Property"
          onAction={() => navigate({ page: 'register-property' })}
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                  <th className="py-3 px-4">Seller ID</th>
                  <th className="py-3 px-3">Name &amp; Relationship</th>
                  <th className="py-3 px-3">Phone</th>
                  <th className="py-3 px-3 text-right">Properties</th>
                  <th className="py-3 px-3 text-right">Active</th>
                  <th className="py-3 px-3">Last Contacted</th>
                  <th className="py-3 px-3">Assigned Agent</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DA] text-xs">
                {paged.map((seller) => {
                  const owned = db.properties.filter((p) => p.sellerId === seller.id);
                  const activeCount = owned.filter(
                    (p) => !['Sold', 'Inactive'].includes(p.status)
                  ).length;
                  const lastDate = seller.lastContactedDate || seller.lastContactAt;
                  return (
                    <tr key={seller.id} className="hover:bg-[#F1F0E8]/40 transition-colors">
                      <td className="py-3 px-4 font-mono tabular-nums text-[11px] text-[#77796F]">
                        {seller.code}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              navigate({ page: 'seller-detail', id: seller.id })
                            }
                            className="font-semibold text-[#064E3B] hover:underline text-left cursor-pointer"
                          >
                            {seller.name}
                          </button>
                          <span className="px-1.5 py-0.5 rounded bg-[#E4EBE0]/70 text-[#064E3B] text-[10px] font-medium">
                            {seller.relationshipWithProperty || 'Owner'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#77796F] truncate max-w-[240px]">
                          {seller.address}
                        </p>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                        {seller.phone}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                        {owned.length}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#064E3B] font-semibold">
                        {activeCount}
                      </td>
                      <td className="py-3 px-3 max-w-[220px]">
                        <p className="text-[11px] font-medium text-[#20251F] whitespace-nowrap">
                          {formatDaysAgo(lastDate)}
                          {seller.lastContactMethod ? ` · ${seller.lastContactMethod}` : ''}
                        </p>
                        <p className="text-[10px] font-mono text-[#77796F] truncate">
                          {formatDate(lastDate)}
                          {seller.lastConversationNotes
                            ? ` — ${seller.lastConversationNotes}`
                            : ''}
                        </p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {getAgentName(seller.assignedAgentId)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              navigate({ page: 'seller-detail', id: seller.id })
                            }
                            title="View Seller Profile"
                            className="p-1.5 rounded-md hover:bg-[#E4EBE0] text-[#064E3B] cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(seller)}
                            title="Edit Seller"
                            className="p-1.5 rounded-md hover:bg-[#F1F0E8] text-[#20251F] cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingSeller(seller)}
                            title="Delete Seller"
                            className="p-1.5 rounded-md hover:bg-[#C96C60]/15 text-[#C96C60] cursor-pointer"
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
          <Pagination
            totalItems={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Add/Edit Seller Modal */}
      <Modal
        open={sellerModalOpen}
        onClose={() => setSellerModalOpen(false)}
        title={editingSeller ? `Edit Seller — ${editingSeller.name}` : 'Register New Seller'}
        subtitle={
          editingSeller
            ? 'Last-contacted logs remain protected during profile edits.'
            : undefined
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">WhatsApp Number</label>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Relationship with Property *
              </label>
              <select
                value={relationshipWithProperty}
                onChange={(e) =>
                  setRelationshipWithProperty(e.target.value as SellerRelationship)
                }
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                {SELLER_RELATIONSHIPS.map((rel) => (
                  <option key={rel} value={rel}>
                    {rel}
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
              <label className="block text-xs font-medium mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Notes</label>
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
              onClick={() => setSellerModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Save Seller
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingSeller)}
        title="Delete Seller Record"
        message={`Remove seller "${deletingSeller?.name}"? Sellers with existing linked properties cannot be deleted until their properties are reassigned or removed.`}
        confirmLabel="Delete Seller"
        onCancel={() => setDeletingSeller(null)}
        onConfirm={() => {
          if (!deletingSeller) return;
          updateDb(
            (prev) => crmService.deleteSeller(prev, deletingSeller.id),
            'Seller record removed'
          );
          setDeletingSeller(null);
        }}
      />
    </div>
  );
};
