import React, { useMemo, useState } from 'react';
import {
  FilePlus2,
  MapPin,
  MessageSquarePlus,
  Pencil,
  Phone,
  Plus,
  Wallet,
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import {
  CONTACT_METHODS,
  crmService,
  SELLER_RELATIONSHIPS,
} from '../services/crmService';
import { ContactMethod, SellerRelationship } from '../types/crm';
import {
  formatCurrency,
  formatDate,
  formatDaysAgo,
  formatDaysListed,
  getTodayISO,
} from '../utils/formatters';
import {
  Breadcrumbs,
  EmptyState,
  Modal,
  PropertyThumbnail,
  StatusTag,
} from '../components/common/UIPrimitives';

export const SellerProfilePage: React.FC = () => {
  const { db, route, navigate, updateDb } = useCRM();
  const currency = db.settings.currencySymbol;
  const seller = db.sellers.find((s) => s.id === route.id);

  const [propTab, setPropTab] = useState<'all' | 'active' | 'sold' | 'rental'>('all');
  const [fupModalOpen, setFupModalOpen] = useState(false);
  const [fupTitle, setFupTitle] = useState('');
  const [fupDate, setFupDate] = useState(getTodayISO());
  const [fupType, setFupType] = useState<'Call' | 'WhatsApp' | 'Meeting'>('Call');
  const [fupNotes, setFupNotes] = useState('');

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactMethod, setContactMethod] = useState<ContactMethod>('Call');
  const [contactNotes, setContactNotes] = useState('');
  const [contactPropId, setContactPropId] = useState('');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editRel, setEditRel] = useState<SellerRelationship>('Owner');
  const [editNotes, setEditNotes] = useState('');

  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('Seller Mandate');

  const ownedProperties = useMemo(
    () => (seller ? db.properties.filter((p) => p.sellerId === seller.id) : []),
    [db.properties, seller]
  );

  const sellerAdvances = useMemo(
    () =>
      seller
        ? (db.sellerAdvances || []).filter((a) => a.sellerId === seller.id)
        : [],
    [db.sellerAdvances, seller]
  );

  const filteredProperties = useMemo(() => {
    if (propTab === 'active')
      return ownedProperties.filter((p) =>
        ['Available', 'Under Negotiation', 'Reserved'].includes(p.status)
      );
    if (propTab === 'sold') return ownedProperties.filter((p) => p.status === 'Sold');
    if (propTab === 'rental')
      return ownedProperties.filter((p) => p.status === 'Rented' || p.isManaged);
    return ownedProperties;
  }, [ownedProperties, propTab]);

  const followUps = useMemo(
    () =>
      seller
        ? db.followUps.filter(
            (f) => f.relatedType === 'Seller' && f.relatedId === seller.id
          )
        : [],
    [db.followUps, seller]
  );

  const documents = useMemo(
    () =>
      seller
        ? db.propertyDocuments.filter(
            (d) => d.entityType === 'Seller' && d.entityId === seller.id
          )
        : [],
    [db.propertyDocuments, seller]
  );

  if (!seller) {
    return (
      <EmptyState
        title="Seller not found"
        description="The requested seller profile could not be located."
        actionLabel="Back to Sellers"
        onAction={() => navigate({ page: 'sellers' })}
      />
    );
  }

  const agent = db.users.find((u) => u.id === seller.assignedAgentId);
  const lastContactDate = seller.lastContactedDate || seller.lastContactAt;

  const getPrimaryImage = (propertyId: string) =>
    db.propertyImages.find((i) => i.propertyId === propertyId && i.isPrimary)?.url ||
    db.propertyImages.find((i) => i.propertyId === propertyId)?.url;

  const openEditSeller = () => {
    setEditName(seller.name);
    setEditPhone(seller.phone);
    setEditWhatsapp(seller.whatsapp);
    setEditAddress(seller.address);
    setEditRel(seller.relationshipWithProperty || 'Owner');
    setEditNotes(seller.notes);
    setEditModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: 'Sellers', onClick: () => navigate({ page: 'sellers' }) },
            { label: seller.code },
            { label: seller.name },
          ]}
        />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#77796F]">
              <span>{seller.code}</span>
              <span>·</span>
              <span className="font-sans px-2 py-0.5 rounded bg-[#E4EBE0] text-[#064E3B] font-medium">
                {seller.relationshipWithProperty || 'Owner'}
              </span>
              <span>·</span>
              <span className="font-sans">Managed by {agent?.name || 'Unassigned'}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#20251F] mt-1">
              {seller.name}
            </h1>
            <p className="text-xs text-[#77796F] flex items-center gap-1.5 mt-1">
              <MapPin className="w-3.5 h-3.5 text-[#064E3B]" />
              {seller.address || 'Address not specified'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openEditSeller}
              className="h-9 px-3 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium text-[#20251F] flex items-center gap-1.5 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 text-[#064E3B]" />
              Edit Profile
            </button>
            <button
              type="button"
              onClick={() => {
                setContactPropId(ownedProperties[0]?.id || '');
                setContactModalOpen(true);
              }}
              className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/60 text-xs font-medium text-[#064E3B] flex items-center gap-1.5 cursor-pointer"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Log Contact
            </button>
            <button
              type="button"
              onClick={() => setFupModalOpen(true)}
              className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium text-[#20251F] cursor-pointer"
            >
              + Schedule Follow-up
            </button>
            <button
              type="button"
              onClick={() =>
                navigate({
                  page: 'register-property',
                  preselectedSellerId: seller.id,
                })
              }
              className="h-9 px-3.5 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Property for Seller
            </button>
          </div>
        </div>
      </div>

      {/* Contact, Last Contacted & Owned Properties */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 bg-[#151D18] text-[#FFFFFF] rounded-2xl p-6 space-y-4">
          <h2 className="text-xs font-semibold text-[#A8B9A2]">Contact &amp; Last Activity</h2>
          <div className="space-y-2.5 text-xs">
            <p className="flex items-center gap-2 font-mono">
              <Phone className="w-3.5 h-3.5 text-[#70A76B]" />
              Phone: {seller.phone}
            </p>
            <p className="font-mono text-[#E4EBE0]">WhatsApp: {seller.whatsapp}</p>
            <div className="p-3 rounded-xl bg-[#1F2B24] border border-[#29382F] space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#A8B9A2]">Last Contacted</span>
                <span className="font-mono text-[#70A76B]">
                  {formatDaysAgo(lastContactDate)}
                </span>
              </div>
              <p className="font-medium text-[#FFFFFF]">
                {formatDate(lastContactDate)}
                {seller.lastContactMethod ? ` · via ${seller.lastContactMethod}` : ''}
              </p>
              {seller.lastConversationNotes && (
                <p className="text-[11px] text-[#E4EBE0] leading-relaxed">
                  {seller.lastConversationNotes}
                </p>
              )}
            </div>
          </div>
          <div className="pt-4 border-t border-[#243028] grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-mono font-semibold">{ownedProperties.length}</p>
              <p className="text-[11px] text-[#A8B9A2]">Total</p>
            </div>
            <div>
              <p className="text-lg font-mono font-semibold text-[#70A76B]">
                {ownedProperties.filter((p) => ['Available', 'Under Negotiation', 'Reserved'].includes(p.status)).length}
              </p>
              <p className="text-[11px] text-[#A8B9A2]">Active</p>
            </div>
            <div>
              <p className="text-lg font-mono font-semibold">
                {ownedProperties.filter((p) => p.status === 'Sold').length}
              </p>
              <p className="text-[11px] text-[#A8B9A2]">Sold</p>
            </div>
          </div>
          {seller.notes && (
            <div className="pt-3 border-t border-[#243028]">
              <p className="text-[11px] text-[#A8B9A2]">Owner Notes</p>
              <p className="text-xs text-[#FFFFFF] mt-1 leading-relaxed">{seller.notes}</p>
            </div>
          )}
        </div>

        {/* Owned Properties List */}
        <div className="lg:col-span-8 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E4DA] flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[#20251F]">
              Owned Properties ({ownedProperties.length})
            </h2>
            <div className="inline-flex p-0.5 bg-[#F1F0E8] border border-[#E5E4DA] rounded-lg">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'active', label: 'Active Listings' },
                  { id: 'sold', label: 'Sold' },
                  { id: 'rental', label: 'Rentals' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPropTab(tab.id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    propTab === tab.id
                      ? 'bg-[#FFFFFF] text-[#064E3B] shadow-xs'
                      : 'text-[#77796F]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredProperties.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#77796F]">
              No properties in this category.
            </div>
          ) : (
            <div className="divide-y divide-[#E5E4DA]">
              {filteredProperties.map((prop) => (
                <button
                  key={prop.id}
                  type="button"
                  onClick={() => navigate({ page: 'property-detail', id: prop.id })}
                  className="w-full px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-[#F1F0E8]/40 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PropertyThumbnail
                      src={getPrimaryImage(prop.id)}
                      alt={prop.title}
                      className="w-14 h-11 rounded-lg"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#20251F] truncate">
                        {prop.title}
                      </p>
                      <p className="text-[11px] text-[#77796F]">
                        {prop.code} · {prop.type} ({prop.category}) · {prop.locality}, {prop.district} ·{' '}
                        {formatDaysListed(prop.listedDate || prop.addedDate)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono tabular-nums font-semibold text-[#064E3B]">
                      {formatCurrency(prop.expectedPrice ?? prop.askingPrice, currency)}
                    </p>
                    <StatusTag status={prop.status} className="mt-1" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Advance Collection History */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[#064E3B]" />
              <h2 className="text-sm font-semibold text-[#20251F]">
                Seller Advance Collection History ({sellerAdvances.length})
              </h2>
            </div>
            <p className="text-[11px] text-[#77796F] mt-0.5">
              Financial escrow/advance records linked to this seller's properties (separate from sales revenue).
            </p>
          </div>
        </div>
        {sellerAdvances.length === 0 ? (
          <p className="text-xs text-[#77796F] py-3">No advance transactions recorded for this seller.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                  <th className="py-2.5 px-3">Ref</th>
                  <th className="py-2.5 px-3">Property</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Method &amp; Txn Ref</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DA] text-xs">
                {sellerAdvances.map((adv) => {
                  const prop = db.properties.find((p) => p.id === adv.propertyId);
                  return (
                    <tr key={adv.id} className="hover:bg-[#F1F0E8]/40">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#77796F]">
                        {adv.code}
                      </td>
                      <td className="py-2.5 px-3">
                        {prop ? (
                          <button
                            type="button"
                            onClick={() => navigate({ page: 'property-detail', id: prop.id })}
                            className="font-medium text-[#064E3B] hover:underline cursor-pointer"
                          >
                            {prop.code} · {prop.title}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        {formatDate(adv.collectionDate)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#064E3B] whitespace-nowrap">
                        {formatCurrency(adv.amount, currency)}
                      </td>
                      <td className="py-2.5 px-3">
                        {adv.paymentMethod} · <span className="font-mono">{adv.transactionReference || '—'}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusTag status={adv.status} />
                      </td>
                      <td className="py-2.5 px-3 text-[#77796F]">{adv.remarks || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Follow-up History & Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#20251F]">
              Follow-up History ({followUps.length})
            </h2>
            <button
              type="button"
              onClick={() => setFupModalOpen(true)}
              className="text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
            >
              + Add Follow-up
            </button>
          </div>
          {followUps.length === 0 ? (
            <p className="text-xs text-[#77796F] py-3">No follow-ups logged for this seller.</p>
          ) : (
            <div className="divide-y divide-[#E5E4DA]">
              {followUps.map((f) => (
                <div key={f.id} className="py-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#20251F]">{f.title}</span>
                    <StatusTag status={f.status} />
                  </div>
                  <p className="text-[11px] font-mono text-[#77796F]">
                    {formatDate(f.date)} · {f.time} · {f.activityType}
                  </p>
                  {f.notes && <p className="text-[#77796F]">{f.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#20251F]">
              Seller Documents ({documents.length})
            </h2>
            <button
              type="button"
              onClick={() => setDocModalOpen(true)}
              className="text-xs font-medium text-[#064E3B] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              Attach Doc
            </button>
          </div>
          {documents.length === 0 ? (
            <p className="text-xs text-[#77796F] py-3">No seller documents uploaded.</p>
          ) : (
            <div className="divide-y divide-[#E5E4DA]">
              {documents.map((d) => (
                <div key={d.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-medium text-[#20251F]">{d.name}</p>
                    <p className="text-[11px] text-[#77796F]">
                      {d.docType} · {d.fileSize} · {formatDate(d.uploadedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateDb(
                        (prev) => crmService.deleteDocument(prev, d.id),
                        'Document removed'
                      )
                    }
                    className="text-[11px] text-[#C96C60] hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Log Contact Activity Modal */}
      <Modal
        open={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        title={`Log Contact Activity — ${seller.name}`}
        subtitle="Automatically updates Last Contacted Date, Method & Conversation Notes."
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!contactNotes.trim()) return;
            updateDb(
              (prev) =>
                crmService.logContactActivity(prev, {
                  relatedType: 'Seller',
                  relatedId: seller.id,
                  propertyId: contactPropId || undefined,
                  contactMethod,
                  notes: contactNotes,
                }),
              'Seller contact activity logged'
            );
            setContactNotes('');
            setContactModalOpen(false);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Contact Method *</label>
            <select
              value={contactMethod}
              onChange={(e) => setContactMethod(e.target.value as ContactMethod)}
              className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
            >
              {CONTACT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          {ownedProperties.length > 0 && (
            <div>
              <label className="block text-xs font-medium mb-1">Related Property</label>
              <select
                value={contactPropId}
                onChange={(e) => setContactPropId(e.target.value)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="">General Seller Contact</option>
                {ownedProperties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1">Conversation Notes *</label>
            <textarea
              rows={3}
              required
              value={contactNotes}
              onChange={(e) => setContactNotes(e.target.value)}
              placeholder="Summarize call outcome, price discussion, or next step..."
              className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setContactModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Log Contact
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Seller Modal (preserves last-contacted fields) */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`Edit Seller — ${seller.name}`}
        subtitle="Profile edits preserve last-contacted logs automatically."
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateDb(
              (prev) =>
                crmService.upsertSeller(prev, {
                  id: seller.id,
                  name: editName,
                  phone: editPhone,
                  whatsapp: editWhatsapp || editPhone,
                  address: editAddress,
                  relationshipWithProperty: editRel,
                  notes: editNotes,
                }),
              'Seller profile updated'
            );
            setEditModalOpen(false);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Phone *</label>
              <input
                type="tel"
                required
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">WhatsApp</label>
              <input
                type="tel"
                value={editWhatsapp}
                onChange={(e) => setEditWhatsapp(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Relationship with Property</label>
            <select
              value={editRel}
              onChange={(e) => setEditRel(e.target.value as SellerRelationship)}
              className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
            >
              {SELLER_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Address</label>
            <input
              type="text"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Owner Notes</label>
            <textarea
              rows={2}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Follow-up Modal */}
      <Modal
        open={fupModalOpen}
        onClose={() => setFupModalOpen(false)}
        title={`Schedule Follow-up — ${seller.name}`}
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!fupTitle.trim()) return;
            updateDb(
              (prev) =>
                crmService.upsertFollowUp(prev, {
                  title: fupTitle,
                  relatedType: 'Seller',
                  relatedId: seller.id,
                  propertyId: ownedProperties[0]?.id,
                  assignedAgentId: seller.assignedAgentId,
                  date: fupDate,
                  time: '11:00',
                  activityType: fupType,
                  notes: fupNotes,
                }),
              'Seller follow-up scheduled'
            );
            setFupTitle('');
            setFupNotes('');
            setFupModalOpen(false);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Task Title *</label>
            <input
              type="text"
              required
              value={fupTitle}
              onChange={(e) => setFupTitle(e.target.value)}
              placeholder="e.g. Confirm site visit availability"
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Date</label>
              <input
                type="date"
                required
                value={fupDate}
                onChange={(e) => setFupDate(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Activity</label>
              <select
                value={fupType}
                onChange={(e) => setFupType(e.target.value as any)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="Call">Call</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Meeting">Meeting</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Notes</label>
            <textarea
              rows={2}
              value={fupNotes}
              onChange={(e) => setFupNotes(e.target.value)}
              className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setFupModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      {/* Attach Doc Modal */}
      <Modal
        open={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        title="Attach Seller Document"
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!docName.trim()) return;
            updateDb(
              (prev) =>
                crmService.addDocument(prev, {
                  entityType: 'Seller',
                  entityId: seller.id,
                  name: docName.trim(),
                  docType,
                  fileSize: '950 KB',
                }),
              'Seller document added'
            );
            setDocName('');
            setDocModalOpen(false);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Document Name *</label>
            <input
              type="text"
              required
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. Owner_KYC_Passport.pdf"
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Category</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
            >
              <option value="Seller Mandate">Seller Mandate</option>
              <option value="Identity KYC">Identity KYC</option>
              <option value="Power of Attorney">Power of Attorney</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDocModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Save Document
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
