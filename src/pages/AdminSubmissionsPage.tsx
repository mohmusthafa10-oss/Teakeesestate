import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileVideo,
  History,
  MessageSquare,
  Pencil,
  PhoneCall,
  Search,
  Sparkles,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  apiClient,
  MediaDTO,
  SubmissionHistoryDTO,
  SubmissionRecordDTO,
  SubmissionSummaryStats,
  TeamMemberDTO,
} from '../services/apiClient';
import { useCRM } from '../context/CRMContext';
import { Modal } from '../components/common/UIPrimitives';
import { formatCurrency, formatDate } from '../utils/formatters';

function getSubmissionTone(status: string): string {
  switch (status) {
    case 'APPROVED':
    case 'CONVERTED_TO_PROPERTY':
      return 'bg-[#E4EBE0] text-[#064E3B] border-[#A8B9A2]';
    case 'REJECTED':
      return 'bg-[#C96C60]/15 text-[#9E3E33] border-[#C96C60]/40';
    case 'UNDER_REVIEW':
      return 'bg-[#D9AC57]/20 text-[#7A5612] border-[#D9AC57]/50';
    default:
      return 'bg-[#F1F0E8] text-[#20251F] border-[#E5E4DA]';
  }
}

function formatDeadlineCountdown(sub: SubmissionRecordDTO): {
  label: string;
  tone: string;
} {
  if (sub.contactStatus === 'CONTACTED') {
    return {
      label: `Contacted ${sub.firstContactAt ? formatDate(sub.firstContactAt) : ''}`,
      tone: 'bg-[#E4EBE0] text-[#064E3B] border-[#A8B9A2]',
    };
  }
  const diffMs = new Date(sub.contactDeadlineAt).getTime() - Date.now();
  const hours = Math.round(Math.abs(diffMs) / 3600_000);
  if (diffMs < 0 || sub.isContactOverdue) {
    return {
      label: `Overdue ${hours}h`,
      tone: 'bg-[#C96C60]/15 text-[#9E3E33] border-[#C96C60]/40 font-semibold',
    };
  }
  return {
    label: `Due in ${hours}h`,
    tone: 'bg-[#D9AC57]/20 text-[#7A5612] border-[#D9AC57]/40',
  };
}

export const AdminSubmissionsPage: React.FC = () => {
  const { notify } = useCRM();

  const [summary, setSummary] = useState<SubmissionSummaryStats>({
    total: 0,
    pendingReview: 0,
    underReview: 0,
    approved: 0,
    rejected: 0,
    converted: 0,
    overdueContact: 0,
  });
  const [items, setItems] = useState<SubmissionRecordDTO[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamMemberDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [contactFilter, setContactFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Detail modal state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedSub, setSelectedSub] = useState<SubmissionRecordDTO | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaDTO[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<SubmissionHistoryDTO[]>([]);

  // Inline edit / workflow action states
  const [editMode, setEditMode] = useState(false);
  const [editTitleFields, setEditTitleFields] = useState({
    sellerName: '',
    mobileNumber: '',
    sellerEmail: '',
    propertyType: '',
    location: '',
    shortDescription: '',
    expectedPrice: '',
    propertySize: '',
    internalNotes: '',
    assignedAgentId: '',
  });
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [infoNotes, setInfoNotes] = useState('');
  const [showInfoBox, setShowInfoBox] = useState(false);
  const [contactMethod, setContactMethod] = useState('Call');
  const [contactNotes, setContactNotes] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, usersRes] = await Promise.all([
        apiClient.getAdminSubmissions({
          status: statusFilter,
          contactStatus: contactFilter,
          search,
          limit: 50,
        }),
        apiClient.getAdminUsers(),
      ]);
      setSummary(subRes.summary);
      setItems(subRes.items);
      setTeamUsers(usersRes.items.filter((u) => u.active && u.role !== 'TELECALLER'));
    } catch (err: any) {
      notify(err?.message || 'Unable to load property submissions.', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, contactFilter, search, notify]);

  useEffect(() => {
    const t = setTimeout(() => void loadData(), 150);
    return () => clearTimeout(t);
  }, [loadData]);

  const openDetail = async (subId: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setEditMode(false);
    setShowRejectBox(false);
    setShowInfoBox(false);
    setRejectReason('');
    setInfoNotes('');
    setContactNotes('');
    try {
      const res = await apiClient.getAdminSubmissionDetail(subId);
      setSelectedSub(res.submission);
      setSelectedMedia(res.media);
      setSelectedHistory(res.history);
      setEditTitleFields({
        sellerName: res.submission.sellerName,
        mobileNumber: res.submission.mobileNumber,
        sellerEmail: res.submission.sellerEmail || '',
        propertyType: res.submission.propertyType,
        location: res.submission.location,
        shortDescription: res.submission.shortDescription,
        expectedPrice: res.submission.expectedPrice ? String(res.submission.expectedPrice) : '',
        propertySize: res.submission.propertySize || '',
        internalNotes: res.submission.internalNotes || '',
        assignedAgentId: res.submission.assignedAgentId
          ? String(res.submission.assignedAgentId)
          : '',
      });
    } catch (err: any) {
      notify(err?.message || 'Unable to load submission detail.', 'error');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedSub) return;
    setActionBusy(true);
    try {
      await apiClient.updateAdminSubmission(selectedSub.id, {
        sellerName: editTitleFields.sellerName,
        mobileNumber: editTitleFields.mobileNumber,
        sellerEmail: editTitleFields.sellerEmail,
        propertyType: editTitleFields.propertyType,
        location: editTitleFields.location,
        shortDescription: editTitleFields.shortDescription,
        expectedPrice: editTitleFields.expectedPrice
          ? Number(editTitleFields.expectedPrice)
          : null,
        propertySize: editTitleFields.propertySize || null,
        internalNotes: editTitleFields.internalNotes,
        assignedAgentId: editTitleFields.assignedAgentId
          ? Number(editTitleFields.assignedAgentId)
          : null,
      });
      notify('Submission details updated.', 'success');
      setEditMode(false);
      await openDetail(selectedSub.id);
      await loadData();
    } catch (err: any) {
      notify(err?.message || 'Failed to update submission.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleLogContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub || contactNotes.trim().length < 2) return;
    setActionBusy(true);
    try {
      await apiClient.logSubmissionContact(selectedSub.id, contactMethod, contactNotes.trim());
      notify('Seller contact logged — 48h follow-up SLA completed.', 'success');
      setContactNotes('');
      await openDetail(selectedSub.id);
      await loadData();
    } catch (err: any) {
      notify(err?.message || 'Unable to log seller contact.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedSub) return;
    setActionBusy(true);
    try {
      await apiClient.approveSubmission(selectedSub.id);
      notify(`Submission ${selectedSub.referenceNumber} approved.`, 'success');
      await openDetail(selectedSub.id);
      await loadData();
    } catch (err: any) {
      notify(err?.message || 'Approval failed.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSub) return;
    if (rejectReason.trim().length < 3) {
      notify('Please enter a rejection reason.', 'error');
      return;
    }
    setActionBusy(true);
    try {
      await apiClient.rejectSubmission(selectedSub.id, rejectReason.trim());
      notify(`Submission ${selectedSub.referenceNumber} marked rejected.`, 'info');
      setShowRejectBox(false);
      await openDetail(selectedSub.id);
      await loadData();
    } catch (err: any) {
      notify(err?.message || 'Rejection failed.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRequestInfo = async () => {
    if (!selectedSub) return;
    if (infoNotes.trim().length < 3) {
      notify('Please specify what information is needed.', 'error');
      return;
    }
    setActionBusy(true);
    try {
      await apiClient.requestSubmissionInfo(selectedSub.id, infoNotes.trim());
      notify('Submission moved to Under Review with correction notes.', 'info');
      setShowInfoBox(false);
      await openDetail(selectedSub.id);
      await loadData();
    } catch (err: any) {
      notify(err?.message || 'Request failed.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleConvert = async () => {
    if (!selectedSub) return;
    setActionBusy(true);
    try {
      const res = await apiClient.convertSubmissionToProperty(selectedSub.id, {
        assignedAgentId: editTitleFields.assignedAgentId
          ? Number(editTitleFields.assignedAgentId)
          : selectedSub.assignedAgentId,
      });
      notify(
        `Converted to CRM Property ${res.property.code} (unpublished draft).`,
        'success'
      );
      await openDetail(selectedSub.id);
      await loadData();
    } catch (err: any) {
      notify(err?.message || 'Conversion failed.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const photos = selectedMedia.filter((m) => m.mediaCategory === 'PHOTO');
  const videos = selectedMedia.filter((m) => m.mediaCategory === 'VIDEO');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            Property Submissions & 48h SLA Queue
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Review incoming seller & telecaller submissions, inspect uploaded photos/videos, log 48-hour seller contact, and convert approved listings into unpublished CRM properties.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Total', value: summary.total, tone: 'text-[#20251F]' },
          { label: 'Pending Review', value: summary.pendingReview, tone: 'text-[#20251F]' },
          { label: 'Under Review', value: summary.underReview, tone: 'text-[#7A5612]' },
          { label: 'Approved', value: summary.approved, tone: 'text-[#064E3B]' },
          { label: 'Converted', value: summary.converted, tone: 'text-[#064E3B]' },
          { label: 'Rejected', value: summary.rejected, tone: 'text-[#77796F]' },
          {
            label: 'Overdue 48h',
            value: summary.overdueContact,
            tone: summary.overdueContact > 0 ? 'text-[#9E3E33]' : 'text-[#064E3B]',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-3.5"
          >
            <p className="text-[11px] text-[#77796F]">{card.label}</p>
            <p className={`text-xl font-semibold font-mono tabular-nums mt-1 ${card.tone}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference ID, seller name, phone, or location..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-[#F1F0E8]/60 border border-[#E5E4DA] rounded-lg focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
          >
            <option value="ALL">All Review Statuses</option>
            <option value="PENDING_REVIEW">Pending Review</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="APPROVED">Approved</option>
            <option value="CONVERTED_TO_PROPERTY">Converted to Property</option>
            <option value="REJECTED">Rejected</option>
          </select>

          <select
            value={contactFilter}
            onChange={(e) => setContactFilter(e.target.value)}
            className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
          >
            <option value="ALL">All 48h SLA States</option>
            <option value="OVERDUE">Contact Overdue (&gt;48h)</option>
            <option value="DUE">Contact Due (Within 48h)</option>
            <option value="COMPLETED">Contact Completed</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                <th className="py-3 px-4">Reference & Source</th>
                <th className="py-3 px-3">Seller & Mobile</th>
                <th className="py-3 px-3">Property & Location</th>
                <th className="py-3 px-3">Media</th>
                <th className="py-3 px-3">Review Status</th>
                <th className="py-3 px-3">48h Contact SLA</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E4DA] text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#77796F]">
                    Loading submissions...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#77796F]">
                    No property submissions match the selected filters.
                  </td>
                </tr>
              ) : (
                items.map((sub) => {
                  const sla = formatDeadlineCountdown(sub);
                  return (
                    <tr key={sub.id} className="hover:bg-[#F1F0E8]/40">
                      <td className="py-3 px-4">
                        <p className="font-mono font-semibold text-[#064E3B]">
                          {sub.referenceNumber}
                        </p>
                        <p className="text-[11px] text-[#77796F]">
                          {sub.source} · {formatDate(sub.submittedAt)}
                        </p>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-[#20251F]">{sub.sellerName}</p>
                        <p className="text-[11px] font-mono text-[#77796F]">
                          {sub.mobileNumber}
                        </p>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-medium text-[#20251F]">
                          {sub.propertyType}
                          {sub.expectedPrice
                            ? ` · ${formatCurrency(sub.expectedPrice, '₹')}`
                            : ''}
                        </p>
                        <p className="text-[11px] text-[#77796F] truncate max-w-[230px]">
                          {sub.location}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-[11px] font-mono text-[#77796F]">
                        {sub.photoCount || 0}P / {sub.videoCount || 0}V
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-medium ${getSubmissionTone(
                            sub.status
                          )}`}
                        >
                          {sub.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${sla.tone}`}
                        >
                          <Clock className="w-3 h-3" />
                          {sla.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => void openDetail(sub.id)}
                          className="h-8 px-3 rounded-lg bg-[#E4EBE0] hover:bg-[#064E3B] text-[#064E3B] hover:text-[#FFFFFF] text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submission Review Detail Modal */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={
          selectedSub
            ? `Submission ${selectedSub.referenceNumber}`
            : 'Submission Review'
        }
        subtitle={
          selectedSub
            ? `Submitted ${formatDate(selectedSub.submittedAt)} via ${selectedSub.source}`
            : undefined
        }
        maxWidthClass="max-w-4xl"
      >
        {detailLoading || !selectedSub ? (
          <div className="py-12 text-center text-xs text-[#77796F]">
            Loading submission details & media...
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status & SLA Banner */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[#F1F0E8]/80 border border-[#E5E4DA]">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded border text-xs font-semibold ${getSubmissionTone(
                    selectedSub.status
                  )}`}
                >
                  {selectedSub.status.replace(/_/g, ' ')}
                </span>
                {(() => {
                  const sla = formatDeadlineCountdown(selectedSub);
                  return (
                    <span className={`px-2.5 py-1 rounded border text-xs ${sla.tone}`}>
                      {sla.label}
                    </span>
                  );
                })()}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditMode((v) => !v)}
                  className="h-8 px-3 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5 text-[#064E3B]" />
                  {editMode ? 'Cancel Edit' : 'Edit Details'}
                </button>
              </div>
            </div>

            {selectedSub.rejectionReason && (
              <div className="p-3.5 rounded-xl bg-[#C96C60]/10 border border-[#C96C60]/30 text-xs text-[#9E3E33]">
                <strong>Rejection Reason:</strong> {selectedSub.rejectionReason}
              </div>
            )}

            {selectedSub.correctionNotes && (
              <div className="p-3.5 rounded-xl bg-[#D9AC57]/15 border border-[#D9AC57]/40 text-xs text-[#7A5612]">
                <strong>Information Requested:</strong> {selectedSub.correctionNotes}
              </div>
            )}

            {/* Seller & Property Fields (Read or Edit) */}
            {editMode ? (
              <div className="p-4 rounded-xl border border-[#E5E4DA] space-y-3 bg-[#F1F0E8]/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium mb-1">Seller Name</label>
                    <input
                      type="text"
                      value={editTitleFields.sellerName}
                      onChange={(e) =>
                        setEditTitleFields({ ...editTitleFields, sellerName: e.target.value })
                      }
                      className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1">Mobile Number</label>
                    <input
                      type="text"
                      value={editTitleFields.mobileNumber}
                      onChange={(e) =>
                        setEditTitleFields({ ...editTitleFields, mobileNumber: e.target.value })
                      }
                      className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1">Property Type</label>
                    <input
                      type="text"
                      value={editTitleFields.propertyType}
                      onChange={(e) =>
                        setEditTitleFields({ ...editTitleFields, propertyType: e.target.value })
                      }
                      className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1">Location</label>
                    <input
                      type="text"
                      value={editTitleFields.location}
                      onChange={(e) =>
                        setEditTitleFields({ ...editTitleFields, location: e.target.value })
                      }
                      className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1">Expected Price (₹)</label>
                    <input
                      type="number"
                      value={editTitleFields.expectedPrice}
                      onChange={(e) =>
                        setEditTitleFields({ ...editTitleFields, expectedPrice: e.target.value })
                      }
                      className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1">Property Size</label>
                    <input
                      type="text"
                      value={editTitleFields.propertySize}
                      onChange={(e) =>
                        setEditTitleFields({ ...editTitleFields, propertySize: e.target.value })
                      }
                      className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1">Seller Email</label>
                    <input
                      type="email"
                      value={editTitleFields.sellerEmail}
                      onChange={(e) =>
                        setEditTitleFields({ ...editTitleFields, sellerEmail: e.target.value })
                      }
                      className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Assign Salesperson</label>
                  <select
                    value={editTitleFields.assignedAgentId}
                    onChange={(e) =>
                      setEditTitleFields({
                        ...editTitleFields,
                        assignedAgentId: e.target.value,
                      })
                    }
                    className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                  >
                    <option value="">Unassigned</option>
                    {teamUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={editTitleFields.shortDescription}
                    onChange={(e) =>
                      setEditTitleFields({
                        ...editTitleFields,
                        shortDescription: e.target.value,
                      })
                    }
                    className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Internal Admin Notes</label>
                  <input
                    type="text"
                    value={editTitleFields.internalNotes}
                    onChange={(e) =>
                      setEditTitleFields({ ...editTitleFields, internalNotes: e.target.value })
                    }
                    className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleSaveEdit()}
                    className="h-9 px-4 rounded-lg bg-[#064E3B] text-[#FFFFFF] text-xs font-medium cursor-pointer"
                  >
                    Save Corrections
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl border border-[#E5E4DA] space-y-2">
                  <p className="font-semibold text-[#20251F]">Seller Information</p>
                  <p>
                    <span className="text-[#77796F]">Name:</span>{' '}
                    <strong>{selectedSub.sellerName}</strong>
                  </p>
                  <p>
                    <span className="text-[#77796F]">Mobile:</span>{' '}
                    <span className="font-mono font-semibold text-[#064E3B]">
                      {selectedSub.mobileNumber}
                    </span>
                  </p>
                  {selectedSub.sellerEmail && (
                    <p>
                      <span className="text-[#77796F]">Email:</span>{' '}
                      <span>{selectedSub.sellerEmail}</span>
                    </p>
                  )}
                  <p>
                    <span className="text-[#77796F]">Assigned Agent:</span>{' '}
                    {selectedSub.assignedAgentName || 'Unassigned'}
                  </p>
                  {selectedSub.additionalNotes && (
                    <p className="text-[#77796F] pt-1 border-t border-[#E5E4DA]">
                      Seller Notes: {selectedSub.additionalNotes}
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-xl border border-[#E5E4DA] space-y-2">
                  <p className="font-semibold text-[#20251F]">Property Details</p>
                  <p>
                    <span className="text-[#77796F]">Type:</span> {selectedSub.propertyType} ·{' '}
                    <span className="text-[#77796F]">Size:</span>{' '}
                    {selectedSub.propertySize || 'Not specified'}
                  </p>
                  <p>
                    <span className="text-[#77796F]">Location:</span> {selectedSub.location}
                  </p>
                  <p>
                    <span className="text-[#77796F]">Expected Price:</span>{' '}
                    <span className="font-mono font-semibold text-[#064E3B]">
                      {selectedSub.expectedPrice
                        ? formatCurrency(selectedSub.expectedPrice, '₹')
                        : 'Not specified'}
                    </span>
                  </p>
                  <p className="text-[#20251F]/85 pt-1 border-t border-[#E5E4DA] leading-relaxed">
                    {selectedSub.shortDescription}
                  </p>
                </div>
              </div>
            )}

            {/* Uploaded Photos & Videos */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#77796F]">
                Submitted Media ({photos.length} Photos, {videos.length} Videos)
              </h3>
              {selectedMedia.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-[#E5E4DA] text-xs text-[#77796F] text-center">
                  No photos or videos attached to this submission.
                </div>
              ) : (
                <div className="space-y-4">
                  {photos.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {photos.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-xl border border-[#E5E4DA] overflow-hidden bg-[#FFFFFF]"
                        >
                          <a href={m.url} target="_blank" rel="noreferrer">
                            <img
                              src={m.thumbnailUrl || m.url}
                              alt={m.originalFilename || 'Property photo'}
                              referrerPolicy="no-referrer"
                              className="w-full h-28 object-cover"
                            />
                          </a>
                          <div className="px-2.5 py-1.5 flex items-center justify-between text-[10px] text-[#77796F] border-t border-[#E5E4DA]">
                            <span className="truncate">{m.fileType}</span>
                            <a
                              href={`${m.url}${m.url.includes('?') ? '&' : '?'}download=1`}
                              className="text-[#064E3B] hover:underline inline-flex items-center gap-0.5 shrink-0"
                            >
                              <Download className="w-3 h-3" />
                              Save
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {videos.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {videos.map((v) => (
                        <div
                          key={v.id}
                          className="rounded-xl border border-[#E5E4DA] overflow-hidden bg-[#151D18]"
                        >
                          <video controls preload="metadata" className="w-full max-h-56">
                            <source src={v.url} type={v.mimeType} />
                          </video>
                          <div className="px-3 py-1.5 bg-[#FFFFFF] flex items-center justify-between text-[11px]">
                            <span className="inline-flex items-center gap-1 text-[#20251F] truncate">
                              <FileVideo className="w-3.5 h-3.5 text-[#064E3B]" />
                              {v.originalFilename || 'Walkthrough video'}
                            </span>
                            <a
                              href={`${v.url}${v.url.includes('?') ? '&' : '?'}download=1`}
                              className="text-[#064E3B] hover:underline inline-flex items-center gap-1 shrink-0"
                            >
                              <Download className="w-3 h-3" />
                              Download
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 48h Seller Contact Logger */}
            <form
              onSubmit={handleLogContact}
              className="p-4 rounded-xl border border-[#E5E4DA] bg-[#F1F0E8]/50 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#20251F] inline-flex items-center gap-1.5">
                  <PhoneCall className="w-3.5 h-3.5 text-[#064E3B]" />
                  Log Seller Contact (48h SLA Follow-up)
                </h3>
                <span className="text-[11px] text-[#77796F]">
                  Deadline: {formatDate(selectedSub.contactDeadlineAt)}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={contactMethod}
                  onChange={(e) => setContactMethod(e.target.value)}
                  className="h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                >
                  <option value="Call">Phone Call</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Meeting">In-person Meeting</option>
                </select>
                <input
                  type="text"
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  placeholder="Record summary of seller call & verification..."
                  className="flex-1 h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                />
                <button
                  type="submit"
                  disabled={actionBusy || contactNotes.trim().length < 2}
                  className="h-9 px-4 rounded-lg bg-[#151D18] hover:bg-[#064E3B] disabled:opacity-50 text-[#FFFFFF] text-xs font-medium cursor-pointer shrink-0"
                >
                  Mark Contacted
                </button>
              </div>
            </form>

            {/* Approval / Rejection / Conversion Workflow Bar */}
            {selectedSub.status !== 'CONVERTED_TO_PROPERTY' && (
              <div className="p-4 rounded-xl border border-[#E5E4DA] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedSub.status !== 'APPROVED' && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleApprove()}
                        className="h-9 px-4 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-[#FFFFFF] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve Submission
                      </button>
                    )}

                    {selectedSub.status === 'APPROVED' && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleConvert()}
                        className="h-9 px-4 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-[#FFFFFF] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        Convert to CRM Property (Unpublished)
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => {
                        setShowInfoBox((v) => !v);
                        setShowRejectBox(false);
                      }}
                      className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#D9AC57]" />
                      Request Info
                    </button>

                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => {
                        setShowRejectBox((v) => !v);
                        setShowInfoBox(false);
                      }}
                      className="h-9 px-3.5 rounded-lg border border-[#C96C60]/40 bg-[#FFFFFF] hover:bg-[#C96C60]/10 text-xs font-medium text-[#9E3E33] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </div>
                </div>

                {showInfoBox && (
                  <div className="pt-2 flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={infoNotes}
                      onChange={(e) => setInfoNotes(e.target.value)}
                      placeholder="Specify missing documents, clearer photos, or measurements needed..."
                      className="flex-1 h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                    />
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleRequestInfo()}
                      className="h-9 px-4 rounded-lg bg-[#D9AC57] text-[#151D18] text-xs font-semibold cursor-pointer"
                    >
                      Save & Move to Under Review
                    </button>
                  </div>
                )}

                {showRejectBox && (
                  <div className="pt-2 flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Mandatory rejection reason (e.g. duplicate listing, invalid contact, out of coverage)..."
                      className="flex-1 h-9 px-3 text-xs border border-[#C96C60]/50 rounded-lg"
                    />
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleReject()}
                      className="h-9 px-4 rounded-lg bg-[#C96C60] text-[#FFFFFF] text-xs font-semibold cursor-pointer"
                    >
                      Confirm Reject
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Submission History Timeline */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#77796F] inline-flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                Submission Review Timeline
              </h3>
              <div className="border border-[#E5E4DA] rounded-xl divide-y divide-[#E5E4DA] max-h-48 overflow-y-auto">
                {selectedHistory.map((h) => (
                  <div key={h.id} className="px-3.5 py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div>
                      <p className="font-medium text-[#20251F]">
                        {h.action.replace(/_/g, ' ')}{' '}
                        <span className="text-[#77796F] font-normal">by {h.actorName}</span>
                      </p>
                      {h.notes && <p className="text-[11px] text-[#77796F] mt-0.5">{h.notes}</p>}
                    </div>
                    <span className="text-[11px] font-mono text-[#77796F] shrink-0">
                      {formatDate(h.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
