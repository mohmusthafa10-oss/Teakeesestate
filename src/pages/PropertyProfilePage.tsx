import React, { useMemo, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  FilePlus2,
  Handshake,
  ImagePlus,
  MapPin,
  Phone,
  Sparkles,
  User,
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService } from '../services/crmService';
import { PropertyStatus } from '../types/crm';
import { findMatchingLeadsForProperty } from '../utils/matching';
import { formatCurrency, formatDate, getTodayISO } from '../utils/formatters';
import {
  Breadcrumbs,
  EmptyState,
  Modal,
  StatusTag,
} from '../components/common/UIPrimitives';

export const PropertyProfilePage: React.FC = () => {
  const { db, route, navigate, updateDb, notify } = useCRM();
  const currency = db.settings.currencySymbol;

  const property = db.properties.find((p) => p.id === route.id);

  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);

  // Add photo state
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [newPhotoCaption, setNewPhotoCaption] = useState('');

  // Add doc state
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('Title Deed');

  // Schedule visit state
  const [visitLeadId, setVisitLeadId] = useState('');
  const [visitDate, setVisitDate] = useState(getTodayISO());
  const [visitTime, setVisitTime] = useState('11:00');

  // Quick follow-up state
  const [fupTitle, setFupTitle] = useState('');
  const [fupDate, setFupDate] = useState(getTodayISO());
  const [fupType, setFupType] = useState<'Call' | 'WhatsApp' | 'Meeting' | 'Site Visit'>('Call');
  const [fupNotes, setFupNotes] = useState('');

  const seller = useMemo(
    () => (property ? db.sellers.find((s) => s.id === property.sellerId) : undefined),
    [db.sellers, property]
  );

  const agent = useMemo(
    () => (property ? db.users.find((u) => u.id === property.assignedAgentId) : undefined),
    [db.users, property]
  );

  const images = useMemo(
    () => (property ? db.propertyImages.filter((i) => i.propertyId === property.id) : []),
    [db.propertyImages, property]
  );

  const documents = useMemo(
    () =>
      property
        ? db.propertyDocuments.filter(
            (d) => d.entityType === 'Property' && d.entityId === property.id
          )
        : [],
    [db.propertyDocuments, property]
  );

  const connectedMatches = useMemo(
    () => (property ? db.propertyMatches.filter((m) => m.propertyId === property.id) : []),
    [db.propertyMatches, property]
  );

  const propertyFollowUps = useMemo(
    () => (property ? db.followUps.filter((f) => f.propertyId === property.id) : []),
    [db.followUps, property]
  );

  const propertyVisits = useMemo(
    () => (property ? db.siteVisits.filter((v) => v.propertyId === property.id) : []),
    [db.siteVisits, property]
  );

  const propertyDeals = useMemo(
    () => (property ? db.deals.filter((d) => d.propertyId === property.id) : []),
    [db.deals, property]
  );

  const suggestedLeadMatches = useMemo(() => {
    if (!property) return [];
    const connectedSet = new Set(connectedMatches.map((m) => m.leadId));
    return findMatchingLeadsForProperty(property, db.leads, currency).filter(
      (m) => !connectedSet.has(m.lead.id)
    );
  }, [property, db.leads, connectedMatches, currency]);

  if (!property) {
    return (
      <EmptyState
        title="Property not found"
        description="The requested property record may have been deleted."
        actionLabel="Back to Properties"
        onAction={() => navigate({ page: 'properties' })}
      />
    );
  }

  const currentPhoto = images[activePhotoIdx] || images[0];

  const handleUploadImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateDb(
          (prev) =>
            crmService.addPropertyImage(
              prev,
              property.id,
              reader.result as string,
              file.name.replace(/\.[^.]+$/, ''),
              images.length === 0
            ),
          'Property photo uploaded'
        );
        setPhotoModalOpen(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConnectLeads = () => {
    if (selectedLeadIds.length === 0) return;
    const items = selectedLeadIds
      .map((leadId) => suggestedLeadMatches.find((s) => s.lead.id === leadId))
      .filter(Boolean)
      .map((match) => ({
        leadId: match!.lead.id,
        propertyId: property.id,
        matchScore: match!.score,
        matchReasons: match!.reasons,
        markShared: true,
      }));
    updateDb(
      (prev) => crmService.connectMatches(prev, items),
      `Connected ${items.length} interested buyer lead(s)`
    );
    setSelectedLeadIds([]);
    setMatchModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: 'Properties', onClick: () => navigate({ page: 'properties' }) },
            { label: property.code },
            { label: property.title },
          ]}
        />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#77796F]">
              <span className="font-mono">{property.code}</span>
              <span aria-hidden="true">·</span>
              <span>{property.type}</span>
              <span aria-hidden="true">·</span>
              <span>Added {formatDate(property.addedDate)}</span>
              <StatusTag status={property.status} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#20251F] mt-1">
              {property.title}
            </h1>
            <p className="text-xs text-[#77796F] flex items-center gap-1.5 mt-1">
              <MapPin className="w-3.5 h-3.5 text-[#064E3B]" />
              {property.location} · {property.areaDisplay}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={property.status}
              onChange={(e) =>
                updateDb(
                  (prev) =>
                    crmService.updateProperty(prev, property.id, {
                      status: e.target.value as PropertyStatus,
                    }),
                  `Status updated to ${e.target.value}`
                )
              }
              className="h-9 px-3 text-xs font-medium bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg cursor-pointer"
            >
              <option value="Available">Available</option>
              <option value="Under Negotiation">Under Negotiation</option>
              <option value="Reserved">Reserved</option>
              <option value="Sold">Sold</option>
              <option value="Rented">Rented</option>
              <option value="Inactive">Inactive</option>
            </select>

            <button
              type="button"
              onClick={() => setMatchModalOpen(true)}
              className="h-9 px-3.5 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Find Matching Leads
            </button>

            <button
              type="button"
              onClick={() => navigate({ page: 'deals' })}
              className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/60 text-xs font-medium text-[#20251F] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Handshake className="w-3.5 h-3.5 text-[#064E3B]" />
              Deals
            </button>
          </div>
        </div>
      </div>

      {/* Main Split: Photo Gallery + Specs / Seller Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Photos */}
        <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="relative h-72 sm:h-80 rounded-xl overflow-hidden bg-[#E4EBE0]">
              {currentPhoto ? (
                <img
                  src={currentPhoto.url}
                  alt={currentPhoto.caption}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-[#77796F]">
                  No property photos uploaded yet
                </div>
              )}
            </div>
            {currentPhoto && (
              <p className="text-xs text-[#77796F] mt-2">{currentPhoto.caption}</p>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-[#E5E4DA] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-x-auto">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActivePhotoIdx(idx)}
                  className={`w-16 h-12 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer ${
                    idx === activePhotoIdx ? 'border-[#064E3B]' : 'border-transparent'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.caption}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPhotoModalOpen(true)}
              className="h-9 px-3 rounded-lg border border-[#E5E4DA] bg-[#F1F0E8]/60 hover:bg-[#E4EBE0] text-xs font-medium text-[#20251F] flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <ImagePlus className="w-3.5 h-3.5 text-[#064E3B]" />
              Upload Photo
            </button>
          </div>
        </div>

        {/* Price, Specs & Seller Information */}
        <div className="lg:col-span-5 space-y-5 flex flex-col justify-between">
          <div className="bg-[#151D18] text-[#FFFFFF] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-[#A8B9A2]">Asking Price</p>
                <p className="text-3xl font-mono tabular-nums font-semibold mt-1">
                  {formatCurrency(property.askingPrice, currency)}
                </p>
              </div>
              <StatusTag status={property.runningCategory} />
            </div>
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#243028] text-xs">
              <div>
                <span className="text-[#A8B9A2]">Area / Size</span>
                <p className="font-mono tabular-nums font-medium mt-0.5">
                  {property.areaDisplay}
                </p>
              </div>
              <div>
                <span className="text-[#A8B9A2]">Assigned Agent</span>
                <p className="font-medium mt-0.5">{agent?.name || 'Unassigned'}</p>
              </div>
              <div>
                <span className="text-[#A8B9A2]">Next Follow-up</span>
                <p className="font-mono tabular-nums font-medium mt-0.5">
                  {property.nextFollowUpDate ? formatDate(property.nextFollowUpDate) : 'None'}
                </p>
              </div>
              <div>
                <span className="text-[#A8B9A2]">Managed Stay/Rental</span>
                <p className="font-medium mt-0.5">{property.isManaged ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>

          {/* Seller Info Card (Clicking opens Seller Profile) */}
          <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#20251F]">Seller Information</h2>
              {seller && (
                <button
                  type="button"
                  onClick={() => navigate({ page: 'seller-detail', id: seller.id })}
                  className="text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
                >
                  View Seller Profile
                </button>
              )}
            </div>
            {seller ? (
              <div className="space-y-2 text-xs">
                <button
                  type="button"
                  onClick={() => navigate({ page: 'seller-detail', id: seller.id })}
                  className="flex items-center gap-2 text-sm font-semibold text-[#064E3B] hover:underline cursor-pointer"
                >
                  <User className="w-4 h-4" />
                  {seller.name} ({seller.code})
                </button>
                <p className="text-[#77796F] flex items-center gap-1.5 font-mono">
                  <Phone className="w-3.5 h-3.5" />
                  {seller.phone} · WhatsApp: {seller.whatsapp}
                </p>
                <p className="text-[#20251F]">{seller.address}</p>
              </div>
            ) : (
              <p className="text-xs text-[#77796F]">Seller record unavailable.</p>
            )}
          </div>
        </div>
      </div>

      {/* Full Description & Internal Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-3">
          <h2 className="text-sm font-semibold text-[#20251F]">
            Property Description & Site Features
          </h2>
          <p className="text-sm text-[#20251F] leading-relaxed whitespace-pre-line">
            {property.description || 'No detailed description recorded yet.'}
          </p>
          {property.internalNotes && (
            <div className="pt-3 border-t border-[#E5E4DA]">
              <p className="text-xs font-semibold text-[#77796F]">Internal Agency Notes</p>
              <p className="text-xs text-[#20251F] mt-1">{property.internalNotes}</p>
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="lg:col-span-4 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#20251F]">
              Documents ({documents.length})
            </h2>
            <button
              type="button"
              onClick={() => setDocModalOpen(true)}
              className="text-xs font-medium text-[#064E3B] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              Add Doc
            </button>
          </div>
          {documents.length === 0 ? (
            <p className="text-xs text-[#77796F] py-4">No property documents attached.</p>
          ) : (
            <div className="divide-y divide-[#E5E4DA]">
              {documents.map((d) => (
                <div key={d.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-[#20251F] truncate">{d.name}</p>
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
                    className="text-[11px] text-[#C96C60] hover:underline shrink-0 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Interested Leads (Many-to-Many Matches) */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5E4DA] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#20251F]">
              Interested Buyer Leads ({connectedMatches.length})
            </h2>
            <p className="text-[11px] text-[#77796F]">
              Matched buyers tracked with interest level, share date, and outcome.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMatchModalOpen(true)}
            className="h-8 px-3 rounded-lg bg-[#E4EBE0] hover:bg-[#064E3B] text-[#064E3B] hover:text-[#FFFFFF] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Find Matching Leads
          </button>
        </div>

        {connectedMatches.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#77796F]">
            No buyer leads connected yet. Click "Find Matching Leads" to discover qualified buyers.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                  <th className="py-2.5 px-5">Lead</th>
                  <th className="py-2.5 px-3">Budget</th>
                  <th className="py-2.5 px-3">Match Reasons</th>
                  <th className="py-2.5 px-3">Shared</th>
                  <th className="py-2.5 px-3">Interest</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DA] text-xs">
                {connectedMatches.map((m) => {
                  const lead = db.leads.find((l) => l.id === m.leadId);
                  if (!lead) return null;
                  return (
                    <tr key={m.id} className="hover:bg-[#F1F0E8]/40">
                      <td className="py-3 px-5">
                        <button
                          type="button"
                          onClick={() => navigate({ page: 'lead-detail', id: lead.id })}
                          className="font-semibold text-[#064E3B] hover:underline cursor-pointer"
                        >
                          {lead.name}
                        </button>
                        <p className="text-[11px] text-[#77796F]">{lead.phone}</p>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                        {formatCurrency(lead.minBudget, currency)} –{' '}
                        {formatCurrency(lead.maxBudget, currency)}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-[#20251F] max-w-xs">
                        {m.matchReasons.slice(0, 2).join(' · ')}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-[11px]">
                        {m.isShared ? formatDate(m.sharedAt) : 'Not shared'}
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={m.buyerInterest}
                          onChange={(e) =>
                            updateDb(
                              (prev) =>
                                crmService.updateMatch(prev, m.id, {
                                  buyerInterest: e.target.value as any,
                                }),
                              'Interest updated'
                            )
                          }
                          className="h-7 px-2 text-[11px] border border-[#E5E4DA] rounded bg-[#FFFFFF]"
                        >
                          <option value="Pending">Pending</option>
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={m.outcome}
                          onChange={(e) =>
                            updateDb(
                              (prev) =>
                                crmService.updateMatch(prev, m.id, {
                                  outcome: e.target.value as any,
                                }),
                              'Match outcome updated'
                            )
                          }
                          className="h-7 px-2 text-[11px] border border-[#E5E4DA] rounded bg-[#FFFFFF]"
                        >
                          <option value="Open">Open</option>
                          <option value="Shortlisted">Shortlisted</option>
                          <option value="Site Visit Done">Site Visit Done</option>
                          <option value="Negotiating">Negotiating</option>
                          <option value="Deal Created">Deal Created</option>
                          <option value="Declined">Declined</option>
                        </select>
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setVisitLeadId(lead.id);
                            setVisitModalOpen(true);
                          }}
                          className="text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
                        >
                          Book Visit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom 3 Panels: Site Visits, Follow-ups, Deal History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Site Visits */}
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#20251F]">
              Site Visits ({propertyVisits.length})
            </h2>
            <button
              type="button"
              onClick={() => {
                setVisitLeadId(db.leads[0]?.id || '');
                setVisitModalOpen(true);
              }}
              className="text-xs font-medium text-[#064E3B] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              Schedule
            </button>
          </div>
          {propertyVisits.length === 0 ? (
            <p className="text-xs text-[#77796F] py-3">No site visits logged.</p>
          ) : (
            <div className="divide-y divide-[#E5E4DA]">
              {propertyVisits.map((v) => {
                const lead = db.leads.find((l) => l.id === v.leadId);
                return (
                  <div key={v.id} className="py-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#20251F]">
                        {lead?.name || 'Lead'}
                      </span>
                      <StatusTag status={v.status} />
                    </div>
                    <p className="text-[11px] font-mono text-[#77796F]">
                      {formatDate(v.scheduledDate)} · {v.scheduledTime}
                    </p>
                    {v.feedback && (
                      <p className="text-[11px] text-[#20251F]">{v.feedback}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Follow-up History */}
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#20251F]">
              Follow-up History ({propertyFollowUps.length})
            </h2>
            <button
              type="button"
              onClick={() => setFollowUpModalOpen(true)}
              className="text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
            >
              + Add Follow-up
            </button>
          </div>
          {propertyFollowUps.length === 0 ? (
            <p className="text-xs text-[#77796F] py-3">No follow-ups recorded.</p>
          ) : (
            <div className="divide-y divide-[#E5E4DA]">
              {propertyFollowUps.map((f) => (
                <div key={f.id} className="py-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#20251F] truncate">{f.title}</span>
                    <StatusTag status={f.status} />
                  </div>
                  <p className="text-[11px] font-mono text-[#77796F]">
                    {formatDate(f.date)} · {f.activityType}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Deal History */}
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#20251F]">
              Deal History ({propertyDeals.length})
            </h2>
            <button
              type="button"
              onClick={() => navigate({ page: 'deals' })}
              className="text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
            >
              Open Deals
            </button>
          </div>
          {propertyDeals.length === 0 ? (
            <p className="text-xs text-[#77796F] py-3">No deals created for this property.</p>
          ) : (
            <div className="divide-y divide-[#E5E4DA]">
              {propertyDeals.map((d) => {
                const buyer = db.leads.find((l) => l.id === d.leadId);
                return (
                  <div key={d.id} className="py-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-[#064E3B]">
                        {d.code} · {formatCurrency(d.agreedPrice, currency)}
                      </span>
                      <StatusTag status={d.status} />
                    </div>
                    <p className="text-[11px] text-[#77796F]">
                      Buyer: {buyer?.name || 'Lead'} · {formatDate(d.dealDate)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Find Matching Leads Modal */}
      <Modal
        open={matchModalOpen}
        onClose={() => setMatchModalOpen(false)}
        title="Find Matching Buyer Leads"
        subtitle={`Matching active requirements against ${property.title} (${formatCurrency(property.askingPrice, currency)})`}
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-4">
          {suggestedLeadMatches.length === 0 ? (
            <p className="text-xs text-[#77796F] py-6 text-center">
              All active leads are already connected or no active leads remain.
            </p>
          ) : (
            <div className="divide-y divide-[#E5E4DA] border border-[#E5E4DA] rounded-xl max-h-96 overflow-y-auto">
              {suggestedLeadMatches.map((match) => {
                const checked = selectedLeadIds.includes(match.lead.id);
                return (
                  <label
                    key={match.lead.id}
                    className={`p-4 flex items-start gap-3 cursor-pointer transition-colors ${
                      checked ? 'bg-[#E4EBE0]/50' : 'hover:bg-[#F1F0E8]/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedLeadIds((prev) => [...prev, match.lead.id]);
                        } else {
                          setSelectedLeadIds((prev) =>
                            prev.filter((id) => id !== match.lead.id)
                          );
                        }
                      }}
                      className="mt-1 w-4 h-4 accent-[#064E3B]"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#20251F]">
                          {match.lead.name} ({match.lead.code})
                        </span>
                        <span className="text-xs font-mono tabular-nums font-medium text-[#064E3B]">
                          Budget: {formatCurrency(match.lead.minBudget, currency)} –{' '}
                          {formatCurrency(match.lead.maxBudget, currency)}
                        </span>
                      </div>
                      <p className="text-xs text-[#77796F]">
                        {match.lead.requirementDescription}
                      </p>
                      <div className="pt-1 flex flex-wrap gap-1.5 text-[11px] text-[#064E3B]">
                        {match.reasons.map((r, i) => (
                          <span key={i} className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E4DA]">
            <button
              type="button"
              onClick={() => setMatchModalOpen(false)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedLeadIds.length === 0}
              onClick={handleConnectLeads}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] disabled:opacity-40 text-[#FFFFFF] cursor-pointer"
            >
              Connect & Mark Shared ({selectedLeadIds.length})
            </button>
          </div>
        </div>
      </Modal>

      {/* Upload Photo Modal */}
      <Modal
        open={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        title="Upload Property Photo"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <label className="block border border-dashed border-[#A8B9A2] rounded-xl p-6 text-center bg-[#F1F0E8]/40 hover:bg-[#E4EBE0]/40 cursor-pointer transition-colors">
            <span className="text-xs font-medium text-[#064E3B] block">
              Choose Image File from Device
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={handleUploadImageFile}
              className="hidden"
            />
          </label>
          <div className="text-center text-[11px] text-[#77796F]">or add photo caption & URL</div>
          <input
            type="text"
            value={newPhotoUrl}
            onChange={(e) => setNewPhotoUrl(e.target.value)}
            placeholder="Image path or URL"
            className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
          />
          <input
            type="text"
            value={newPhotoCaption}
            onChange={(e) => setNewPhotoCaption(e.target.value)}
            placeholder="Caption (e.g. East boundary view)"
            className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPhotoModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!newPhotoUrl.trim()) {
                  notify('Provide an image URL or upload a file', 'error');
                  return;
                }
                updateDb(
                  (prev) =>
                    crmService.addPropertyImage(
                      prev,
                      property.id,
                      newPhotoUrl.trim(),
                      newPhotoCaption.trim()
                    ),
                  'Photo added'
                );
                setNewPhotoUrl('');
                setNewPhotoCaption('');
                setPhotoModalOpen(false);
              }}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Add Photo
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Document Modal */}
      <Modal
        open={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        title="Attach Property Document"
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!docName.trim()) return;
            updateDb(
              (prev) =>
                crmService.addDocument(prev, {
                  entityType: 'Property',
                  entityId: property.id,
                  name: docName.trim(),
                  docType,
                  fileSize: '1.4 MB',
                }),
              'Document attached'
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
              placeholder="e.g. Encumbrance_Certificate_2026.pdf"
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Document Type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
            >
              <option value="Title Deed">Title Deed</option>
              <option value="Survey Sketch">Survey Sketch</option>
              <option value="Tax Receipt">Tax Receipt</option>
              <option value="Building Permit">Building Permit</option>
              <option value="Other">Other</option>
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
              Attach Document
            </button>
          </div>
        </form>
      </Modal>

      {/* Schedule Site Visit Modal */}
      <Modal
        open={visitModalOpen}
        onClose={() => setVisitModalOpen(false)}
        title="Schedule Property Site Visit"
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!visitLeadId) return;
            updateDb(
              (prev) =>
                crmService.addSiteVisit(prev, {
                  propertyId: property.id,
                  leadId: visitLeadId,
                  agentId: property.assignedAgentId,
                  scheduledDate: visitDate,
                  scheduledTime: visitTime,
                  status: 'Scheduled',
                  feedback: '',
                }),
              'Site visit scheduled'
            );
            setVisitModalOpen(false);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Buyer Lead *</label>
            <select
              required
              value={visitLeadId}
              onChange={(e) => setVisitLeadId(e.target.value)}
              className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
            >
              <option value="">Select lead...</option>
              {db.leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Date</label>
              <input
                type="date"
                required
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Time</label>
              <input
                type="time"
                required
                value={visitTime}
                onChange={(e) => setVisitTime(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setVisitModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Confirm Visit
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Follow-up Modal */}
      <Modal
        open={followUpModalOpen}
        onClose={() => setFollowUpModalOpen(false)}
        title="Schedule Property Follow-up"
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!fupTitle.trim() || !seller) return;
            updateDb(
              (prev) =>
                crmService.upsertFollowUp(prev, {
                  title: fupTitle,
                  relatedType: 'Seller',
                  relatedId: seller.id,
                  propertyId: property.id,
                  assignedAgentId: property.assignedAgentId,
                  date: fupDate,
                  time: '10:30',
                  activityType: fupType,
                  notes: fupNotes,
                }),
              'Follow-up scheduled'
            );
            setFupTitle('');
            setFupNotes('');
            setFollowUpModalOpen(false);
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
              placeholder="e.g. Confirm price revision with seller"
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
              <label className="block text-xs font-medium mb-1">Type</label>
              <select
                value={fupType}
                onChange={(e) => setFupType(e.target.value as any)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="Call">Call</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Meeting">Meeting</option>
                <option value="Site Visit">Site Visit</option>
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
              onClick={() => setFollowUpModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Save Follow-up
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
