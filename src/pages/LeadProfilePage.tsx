import React, { useMemo, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  Handshake,
  Phone,
  Share2,
  Sparkles,
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService } from '../services/crmService';
import { LeadStatus } from '../types/crm';
import { findMatchingPropertiesForLead } from '../utils/matching';
import { formatCurrency, formatDate, getTodayISO } from '../utils/formatters';
import {
  Breadcrumbs,
  EmptyState,
  Modal,
  PropertyThumbnail,
  StatusTag,
} from '../components/common/UIPrimitives';

const MAIN_PIPELINE: LeadStatus[] = [
  'New',
  'Contacted',
  'Qualified',
  'Property Shared',
  'Site Visit',
  'Negotiation',
  'Converted',
];

export const LeadProfilePage: React.FC = () => {
  const { db, route, navigate, updateDb } = useCRM();
  const currency = db.settings.currencySymbol;
  const lead = db.leads.find((l) => l.id === route.id);

  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [selectedPropIds, setSelectedPropIds] = useState<string[]>([]);
  const [markSharedOnConnect, setMarkSharedOnConnect] = useState(true);

  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [visitPropId, setVisitPropId] = useState('');
  const [visitDate, setVisitDate] = useState(getTodayISO());
  const [visitTime, setVisitTime] = useState('10:30');

  const [fupModalOpen, setFupModalOpen] = useState(false);
  const [fupTitle, setFupTitle] = useState('');
  const [fupDate, setFupDate] = useState(getTodayISO());
  const [fupType, setFupType] = useState<'Call' | 'WhatsApp' | 'Meeting'>('Call');
  const [fupNotes, setFupNotes] = useState('');

  const matches = useMemo(
    () => (lead ? db.propertyMatches.filter((m) => m.leadId === lead.id) : []),
    [db.propertyMatches, lead]
  );

  const suggestedMatches = useMemo(() => {
    if (!lead) return [];
    const connectedIds = new Set(matches.map((m) => m.propertyId));
    return findMatchingPropertiesForLead(lead, db.properties, currency).filter(
      (m) => !connectedIds.has(m.property.id)
    );
  }, [lead, db.properties, matches, currency]);

  const followUps = useMemo(
    () =>
      lead
        ? db.followUps.filter(
            (f) => f.relatedType === 'Lead' && f.relatedId === lead.id
          )
        : [],
    [db.followUps, lead]
  );

  const siteVisits = useMemo(
    () => (lead ? db.siteVisits.filter((v) => v.leadId === lead.id) : []),
    [db.siteVisits, lead]
  );

  if (!lead) {
    return (
      <EmptyState
        title="Lead not found"
        description="The requested buyer lead could not be found."
        actionLabel="Back to Leads"
        onAction={() => navigate({ page: 'leads' })}
      />
    );
  }

  const agent = db.users.find((u) => u.id === lead.assignedAgentId);

  const getPrimaryImage = (propertyId: string) =>
    db.propertyImages.find((i) => i.propertyId === propertyId && i.isPrimary)?.url ||
    db.propertyImages.find((i) => i.propertyId === propertyId)?.url;

  const handleConnectProperties = () => {
    if (selectedPropIds.length === 0) return;
    const payload = selectedPropIds
      .map((propId) => suggestedMatches.find((s) => s.property.id === propId))
      .filter(Boolean)
      .map((m) => ({
        leadId: lead.id,
        propertyId: m!.property.id,
        matchScore: m!.score,
        matchReasons: m!.reasons,
        markShared: markSharedOnConnect,
      }));
    updateDb(
      (prev) => crmService.connectMatches(prev, payload),
      `Matched ${payload.length} property option(s) for ${lead.name}`
    );
    setSelectedPropIds([]);
    setMatchModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Breadcrumbs
          items={[
            { label: 'Leads', onClick: () => navigate({ page: 'leads' }) },
            { label: lead.code },
            { label: lead.name },
          ]}
        />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#77796F]">
              <span className="font-mono">{lead.code}</span>
              <span aria-hidden="true">·</span>
              <span>Agent: {agent?.name || 'Unassigned'}</span>
              <StatusTag status={lead.status} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#20251F] mt-1">
              {lead.name}
            </h1>
            <p className="text-xs text-[#77796F] flex items-center gap-2 mt-1 font-mono">
              <Phone className="w-3.5 h-3.5 text-[#064E3B]" />
              {lead.phone} · WhatsApp: {lead.whatsapp}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={lead.status}
              onChange={(e) =>
                updateDb(
                  (prev) =>
                    crmService.upsertLead(prev, {
                      id: lead.id,
                      name: lead.name,
                      phone: lead.phone,
                      status: e.target.value as LeadStatus,
                    }),
                  `Lead moved to ${e.target.value}`
                )
              }
              className="h-9 px-3 text-xs font-medium bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg cursor-pointer"
            >
              {db.settings.leadStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMatchModalOpen(true)}
              className="h-9 px-3.5 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Find Matching Properties
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'deals' })}
              className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium text-[#20251F] flex items-center gap-1.5 cursor-pointer"
            >
              <Handshake className="w-3.5 h-3.5 text-[#064E3B]" />
              Create Deal
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline Stepper */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-4 overflow-x-auto">
        <div className="flex items-center justify-between min-w-[680px] gap-2">
          {MAIN_PIPELINE.map((stage, idx) => {
            const currentIdx = MAIN_PIPELINE.indexOf(lead.status);
            const active = lead.status === stage;
            const passed = currentIdx >= idx;
            return (
              <button
                key={stage}
                type="button"
                onClick={() =>
                  updateDb(
                    (prev) =>
                      crmService.upsertLead(prev, {
                        id: lead.id,
                        name: lead.name,
                        phone: lead.phone,
                        status: stage,
                      }),
                    `Pipeline stage set to ${stage}`
                  )
                }
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium text-center border transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#064E3B] text-[#FFFFFF] border-[#064E3B]'
                    : passed
                    ? 'bg-[#E4EBE0] text-[#064E3B] border-[#A8B9A2]/60'
                    : 'bg-[#F1F0E8]/50 text-[#77796F] border-[#E5E4DA] hover:text-[#20251F]'
                }`}
              >
                {idx + 1}. {stage}
              </button>
            );
          })}
        </div>
      </div>

      {/* Requirement & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 bg-[#151D18] text-[#FFFFFF] rounded-2xl p-6 space-y-4">
          <h2 className="text-xs font-semibold text-[#A8B9A2]">Buyer Criteria</h2>
          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[#A8B9A2]">Budget Range</span>
              <p className="text-lg font-mono tabular-nums font-semibold mt-0.5">
                {lead.maxBudget > 0
                  ? `${formatCurrency(lead.minBudget, currency)} – ${formatCurrency(
                      lead.maxBudget,
                      currency
                    )}`
                  : 'Flexible'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#243028]">
              <div>
                <span className="text-[#A8B9A2]">Preferred Location</span>
                <p className="font-medium mt-0.5">{lead.preferredLocation || 'Any'}</p>
              </div>
              <div>
                <span className="text-[#A8B9A2]">Property Type</span>
                <p className="font-medium mt-0.5">{lead.propertyType}</p>
              </div>
            </div>
            <div className="pt-2 border-t border-[#243028]">
              <span className="text-[#A8B9A2]">Next Follow-up</span>
              <p className="font-mono mt-0.5">
                {lead.nextFollowUpDate ? formatDate(lead.nextFollowUpDate) : 'Not scheduled'}
              </p>
            </div>
            {lead.conversionDetails && (
              <div className="pt-2 border-t border-[#243028]">
                <span className="text-[#70A76B]">Conversion Details</span>
                <p className="mt-0.5 text-[#E4EBE0]">{lead.conversionDetails}</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-8 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[#20251F]">
              Full Requirement Description
            </h2>
            <p className="text-sm text-[#20251F] mt-2 leading-relaxed whitespace-pre-line">
              {lead.requirementDescription || 'No detailed requirements recorded.'}
            </p>
          </div>
          {lead.notes && (
            <div className="pt-4 border-t border-[#E5E4DA]">
              <h3 className="text-xs font-semibold text-[#77796F]">Advisor Notes</h3>
              <p className="text-xs text-[#20251F] mt-1 leading-relaxed">{lead.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Matching & Shared Properties (Many-to-Many) */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5E4DA] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#20251F]">
              Matched & Shared Properties ({matches.length})
            </h2>
            <p className="text-[11px] text-[#77796F]">
              Track shared listings, buyer interest, site visits, and match outcomes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMatchModalOpen(true)}
            className="h-8 px-3 rounded-lg bg-[#E4EBE0] hover:bg-[#064E3B] text-[#064E3B] hover:text-[#FFFFFF] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Find Matching Properties
          </button>
        </div>

        {matches.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#77796F]">
            No properties connected to this buyer yet. Click "Find Matching Properties" to evaluate inventory.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                  <th className="py-2.5 px-5">Property</th>
                  <th className="py-2.5 px-3">Price</th>
                  <th className="py-2.5 px-3">Why It Matches</th>
                  <th className="py-2.5 px-3">Shared Status</th>
                  <th className="py-2.5 px-3">Interest</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DA] text-xs">
                {matches.map((m) => {
                  const prop = db.properties.find((p) => p.id === m.propertyId);
                  if (!prop) return null;
                  const img = db.propertyImages.find((i) => i.propertyId === prop.id)?.url;
                  return (
                    <tr key={m.id} className="hover:bg-[#F1F0E8]/40">
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2.5">
                          <PropertyThumbnail
                            src={img}
                            alt={prop.title}
                            className="w-11 h-9 rounded-lg"
                          />
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                navigate({ page: 'property-detail', id: prop.id })
                              }
                              className="font-semibold text-[#064E3B] hover:underline text-left cursor-pointer"
                            >
                              {prop.title}
                            </button>
                            <p className="text-[11px] text-[#77796F]">
                              {prop.location} · {prop.areaDisplay}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums font-semibold text-[#064E3B] whitespace-nowrap">
                        {formatCurrency(prop.askingPrice, currency)}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-[#20251F] max-w-xs">
                        {m.matchReasons.slice(0, 2).join(' · ')}
                      </td>
                      <td className="py-3 px-3">
                        {m.isShared ? (
                          <span className="text-[11px] font-medium text-[#064E3B]">
                            Shared {formatDate(m.sharedAt)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              updateDb(
                                (prev) =>
                                  crmService.updateMatch(prev, m.id, {
                                    isShared: true,
                                  }),
                                'Marked property as shared with buyer'
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#E4EBE0] text-[#064E3B] text-[11px] font-medium cursor-pointer"
                          >
                            <Share2 className="w-3 h-3" />
                            Mark Shared
                          </button>
                        )}
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
                              'Outcome updated'
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
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setVisitPropId(prop.id);
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

      {/* Site Visits & Follow-up History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#20251F]">
              Site Visits ({siteVisits.length})
            </h2>
            <button
              type="button"
              onClick={() => {
                setVisitPropId(
                  matches[0]?.propertyId || db.properties[0]?.id || ''
                );
                setVisitModalOpen(true);
              }}
              className="text-xs font-medium text-[#064E3B] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              Schedule Visit
            </button>
          </div>
          {siteVisits.length === 0 ? (
            <p className="text-xs text-[#77796F] py-3">No site visits booked yet.</p>
          ) : (
            <div className="divide-y divide-[#E5E4DA]">
              {siteVisits.map((v) => {
                const prop = db.properties.find((p) => p.id === v.propertyId);
                return (
                  <div key={v.id} className="py-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#20251F]">
                        {prop?.title || 'Property'}
                      </span>
                      <StatusTag status={v.status} />
                    </div>
                    <p className="text-[11px] font-mono text-[#77796F]">
                      {formatDate(v.scheduledDate)} · {v.scheduledTime}
                    </p>
                    {v.feedback && <p className="text-[#20251F]">{v.feedback}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
            <p className="text-xs text-[#77796F] py-3">No follow-ups logged yet.</p>
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
      </div>

      {/* Find Matching Properties Modal */}
      <Modal
        open={matchModalOpen}
        onClose={() => setMatchModalOpen(false)}
        title="Find Matching Properties"
        subtitle={`Evaluating available inventory against ${lead.name}'s requirement (${lead.preferredLocation || 'Any location'}, ${formatCurrency(lead.maxBudget, currency)} max)`}
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-4">
          {suggestedMatches.length === 0 ? (
            <p className="text-xs text-[#77796F] py-6 text-center">
              All active properties are already connected to this lead.
            </p>
          ) : (
            <div className="divide-y divide-[#E5E4DA] border border-[#E5E4DA] rounded-xl max-h-96 overflow-y-auto">
              {suggestedMatches.map((match) => {
                const checked = selectedPropIds.includes(match.property.id);
                return (
                  <label
                    key={match.property.id}
                    className={`p-4 flex items-start gap-3 cursor-pointer transition-colors ${
                      checked ? 'bg-[#E4EBE0]/50' : 'hover:bg-[#F1F0E8]/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPropIds((prev) => [...prev, match.property.id]);
                        } else {
                          setSelectedPropIds((prev) =>
                            prev.filter((id) => id !== match.property.id)
                          );
                        }
                      }}
                      className="mt-1 w-4 h-4 accent-[#064E3B]"
                    />
                    <PropertyThumbnail
                      src={getPrimaryImage(match.property.id)}
                      alt={match.property.title}
                      className="w-14 h-12 rounded-lg"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#20251F]">
                          {match.property.title}
                        </span>
                        <span className="text-xs font-mono tabular-nums font-semibold text-[#064E3B]">
                          {formatCurrency(match.property.askingPrice, currency)}
                        </span>
                      </div>
                      <p className="text-xs text-[#77796F]">
                        {match.property.type} · {match.property.location} ·{' '}
                        {match.property.areaDisplay}
                      </p>
                      <div className="pt-1 flex flex-wrap gap-2 text-[11px] text-[#064E3B]">
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

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E5E4DA]">
            <label className="flex items-center gap-2 text-xs text-[#20251F] cursor-pointer">
              <input
                type="checkbox"
                checked={markSharedOnConnect}
                onChange={(e) => setMarkSharedOnConnect(e.target.checked)}
                className="w-4 h-4 accent-[#064E3B]"
              />
              Mark selected properties as Shared with Buyer immediately
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMatchModalOpen(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-[#E5E4DA] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedPropIds.length === 0}
                onClick={handleConnectProperties}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] disabled:opacity-40 text-[#FFFFFF] cursor-pointer"
              >
                Connect Properties ({selectedPropIds.length})
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Schedule Visit Modal */}
      <Modal
        open={visitModalOpen}
        onClose={() => setVisitModalOpen(false)}
        title="Schedule Site Visit"
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!visitPropId) return;
            updateDb(
              (prev) =>
                crmService.addSiteVisit(prev, {
                  propertyId: visitPropId,
                  leadId: lead.id,
                  agentId: lead.assignedAgentId,
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
            <label className="block text-xs font-medium mb-1">Property *</label>
            <select
              required
              value={visitPropId}
              onChange={(e) => setVisitPropId(e.target.value)}
              className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
            >
              <option value="">Select property...</option>
              {db.properties
                .filter((p) => p.status !== 'Sold')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.location})
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

      {/* Add Follow-up Modal */}
      <Modal
        open={fupModalOpen}
        onClose={() => setFupModalOpen(false)}
        title={`Schedule Follow-up — ${lead.name}`}
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
                  relatedType: 'Lead',
                  relatedId: lead.id,
                  propertyId: matches[0]?.propertyId,
                  assignedAgentId: lead.assignedAgentId,
                  date: fupDate,
                  time: '10:30',
                  activityType: fupType,
                  notes: fupNotes,
                }),
              'Follow-up scheduled'
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
              placeholder="e.g. Call after sharing property photos"
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
              <label className="block text-xs font-medium mb-1">Activity Type</label>
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
    </div>
  );
};
