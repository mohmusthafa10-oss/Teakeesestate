import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ExternalLink,
  FileVideo,
  Globe,
  GlobeLock,
  History,
  ImagePlus,
  PhoneCall,
  Search,
  Star,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCRM } from '../context/CRMContext';
import {
  AdminPropertyDTO,
  apiClient,
  MediaDTO,
  PropertyFollowUpDTO,
  TeamMemberDTO,
} from '../services/apiClient';
import { ConfirmDialog, Modal } from '../components/common/UIPrimitives';
import { formatCurrency, formatDate } from '../utils/formatters';

interface PortfolioPublishingPageProps {
  onNavigatePath?: (path: string) => void;
}

export const PortfolioPublishingPage: React.FC<PortfolioPublishingPageProps> = ({
  onNavigatePath,
}) => {
  const { crmUser } = useAuth();
  const { notify } = useCRM();
  const isAdmin = crmUser?.role === 'ADMIN';

  const [properties, setProperties] = useState<AdminPropertyDTO[]>([]);
  const [agents, setAgents] = useState<TeamMemberDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [publishFilter, setPublishFilter] = useState<'ALL' | 'PUBLISHED' | 'UNPUBLISHED'>('ALL');

  // Confirm publish/unpublish
  const [confirmTarget, setConfirmTarget] = useState<{
    prop: AdminPropertyDTO;
    publish: boolean;
  } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Assignment modal
  const [assignModalProp, setAssignModalProp] = useState<AdminPropertyDTO | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [assignNotes, setAssignNotes] = useState('');
  const [historyData, setHistoryData] = useState<{
    assignments: Array<{
      id: number;
      agentName: string;
      previousAgentName: string | null;
      assignedByName: string;
      assignmentStatus: string;
      notes: string;
      assignedAt: string;
    }>;
    publicationHistory: Array<{
      id: number;
      actorName: string;
      action: string;
      notes: string;
      createdAt: string;
    }>;
  } | null>(null);

  // Media / Agent Detail modal
  const [activeProp, setActiveProp] = useState<AdminPropertyDTO | null>(null);
  const [activeMedia, setActiveMedia] = useState<MediaDTO[]>([]);
  const [activeFollowUps, setActiveFollowUps] = useState<PropertyFollowUpDTO[]>([]);
  const [agentStatus, setAgentStatus] = useState('Available');
  const [agentNotes, setAgentNotes] = useState('');
  const [fupTitle, setFupTitle] = useState('');
  const [fupType, setFupType] = useState('Call');
  const [fupDate, setFupDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fupTime, setFupTime] = useState('10:30');
  const [fupNotes, setFupNotes] = useState('');
  const [uploadingPct, setUploadingPct] = useState<number | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const [propRes, userRes] = await Promise.all([
          apiClient.getAdminProperties(),
          apiClient.getAdminUsers(),
        ]);
        setProperties(propRes.items);
        setAgents(
          userRes.items.filter(
            (u) => u.active && (u.role === 'AGENT' || u.role === 'ADMIN')
          )
        );
      } else {
        const propRes = await apiClient.getAgentProperties();
        setProperties(propRes.items);
      }
    } catch (err: any) {
      notify(err?.message || 'Unable to load portfolio properties.', 'error');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, notify]);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  const openPropertyWorkspace = async (prop: AdminPropertyDTO) => {
    setActiveProp(prop);
    setActiveMedia(prop.media || []);
    setAgentStatus(prop.status);
    setAgentNotes(prop.internalNotes || '');
    if (!isAdmin) {
      try {
        const detail = await apiClient.getAgentPropertyDetail(prop.id);
        setActiveMedia(detail.media);
        setActiveFollowUps(detail.followUps);
      } catch {
        // fallback to list media
      }
    }
  };

  const handleConfirmPublish = async () => {
    if (!confirmTarget) return;
    const { prop, publish } = confirmTarget;
    setBusyId(prop.id);
    setConfirmTarget(null);
    try {
      if (publish) {
        await apiClient.publishProperty(prop.id, 'Published via CRM Portfolio');
        notify(`${prop.code} is now live on the public website.`, 'success');
      } else {
        await apiClient.unpublishProperty(prop.id, 'Unpublished via CRM Portfolio');
        notify(`${prop.code} removed from public website.`, 'info');
      }
      await loadPortfolio();
    } catch (err: any) {
      notify(err?.message || 'Publishing update failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const openAssignModal = async (prop: AdminPropertyDTO) => {
    setAssignModalProp(prop);
    setSelectedAgentId(prop.assignedAgentId ? String(prop.assignedAgentId) : '');
    setAssignNotes('');
    setHistoryData(null);
    try {
      const h = await apiClient.getPropertyHistory(prop.id);
      setHistoryData(h);
    } catch {
      // ignore
    }
  };

  const handleAssignAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalProp || !selectedAgentId) return;
    setBusyId(assignModalProp.id);
    try {
      await apiClient.assignPropertyAgent(
        assignModalProp.id,
        Number(selectedAgentId),
        assignNotes.trim() || undefined
      );
      notify(`Salesperson assigned to ${assignModalProp.code}.`, 'success');
      setAssignModalProp(null);
      await loadPortfolio();
    } catch (err: any) {
      notify(err?.message || 'Unable to assign property.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleUploadMedia = async (files: FileList | null) => {
    if (!activeProp || !files || files.length === 0) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    setUploadingPct(10);
    try {
      const res = await apiClient.uploadPropertyMedia(activeProp.id, fd, setUploadingPct);
      const nextMedia = [...activeMedia, ...res.items];
      setActiveMedia(nextMedia);
      notify(`Uploaded ${res.items.length} media file(s) to ${activeProp.code}.`, 'success');
      await loadPortfolio();
    } catch (err: any) {
      notify(err?.message || 'Media upload failed.', 'error');
    } finally {
      setUploadingPct(null);
    }
  };

  const handleSetCover = async (mediaId: number) => {
    if (!activeProp) return;
    try {
      const res = await apiClient.reorderPropertyMedia(activeProp.id, {
        coverMediaId: mediaId,
      });
      setActiveMedia(res.items);
      notify('Cover image updated.', 'success');
      await loadPortfolio();
    } catch (err: any) {
      notify(err?.message || 'Unable to set cover image.', 'error');
    }
  };

  const handleMoveMedia = async (index: number, delta: number) => {
    if (!activeProp) return;
    const target = index + delta;
    if (target < 0 || target >= activeMedia.length) return;
    const copy = [...activeMedia];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    setActiveMedia(copy);
    try {
      const res = await apiClient.reorderPropertyMedia(activeProp.id, {
        orderedMediaIds: copy.map((m) => m.id),
      });
      setActiveMedia(res.items);
    } catch {
      // revert silently
    }
  };

  const handleDeleteMedia = async (mediaId: number) => {
    try {
      await apiClient.deleteMedia(mediaId);
      setActiveMedia((prev) => prev.filter((m) => m.id !== mediaId));
      notify('Media item deleted.', 'info');
      await loadPortfolio();
    } catch (err: any) {
      notify(err?.message || 'Unable to delete media item.', 'error');
    }
  };

  const handleSaveAgentUpdate = async () => {
    if (!activeProp) return;
    try {
      await apiClient.updateAgentProperty(activeProp.id, {
        status: agentStatus,
        internalNotes: agentNotes,
      });
      notify(`${activeProp.code} details updated.`, 'success');
      await loadPortfolio();
    } catch (err: any) {
      notify(err?.message || 'Unable to update property.', 'error');
    }
  };

  const handleCreateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProp || !fupTitle.trim()) return;
    try {
      const res = await apiClient.createAgentFollowUp(activeProp.id, {
        title: fupTitle.trim(),
        activityType: fupType,
        scheduledDate: fupDate,
        scheduledTime: fupTime,
        notes: fupNotes.trim(),
      });
      setActiveFollowUps((prev) => [res.followUp, ...prev]);
      setFupTitle('');
      setFupNotes('');
      notify('Follow-up activity scheduled.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Unable to schedule follow-up.', 'error');
    }
  };

  const handleToggleFollowUp = async (f: PropertyFollowUpDTO) => {
    const nextStatus = f.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try {
      const res = await apiClient.updateAgentFollowUp(f.id, { status: nextStatus });
      setActiveFollowUps((prev) =>
        prev.map((item) => (item.id === f.id ? res.followUp : item))
      );
    } catch {
      // ignore
    }
  };

  const filtered = properties.filter((p) => {
    if (publishFilter === 'PUBLISHED' && !p.isPublished) return false;
    if (publishFilter === 'UNPUBLISHED' && p.isPublished) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.location.toLowerCase().includes(q) ||
      p.sellerName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            {isAdmin ? 'Publishing, Assignments & Media Manager' : 'My Assigned Properties'}
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            {isAdmin
              ? 'Control explicit public website visibility, assign salespeople, review audit timelines, and curate property photos & videos.'
              : 'Manage properties assigned to you, upload site photos/videos, view seller contacts, and log follow-up tasks.'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search TAK ID, title, location, or seller..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-[#F1F0E8]/60 border border-[#E5E4DA] rounded-lg focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
          />
        </div>
        {isAdmin && (
          <select
            value={publishFilter}
            onChange={(e) => setPublishFilter(e.target.value as any)}
            className="h-9 px-3 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
          >
            <option value="ALL">All Visibility States</option>
            <option value="PUBLISHED">Published Publicly</option>
            <option value="UNPUBLISHED">Unpublished (Internal Only)</option>
          </select>
        )}
      </div>

      {/* Portfolio Grid */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[#77796F]">
          Loading PostgreSQL portfolio...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl py-12 px-6 text-center text-xs text-[#77796F]">
          {isAdmin
            ? 'No properties match your filters.'
            : 'No properties are currently assigned to your account.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="relative aspect-[16/9] bg-[#E4EBE0]">
                  {p.coverImageUrl ? (
                    <img
                      src={p.coverImageUrl}
                      alt={p.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#064E3B]/40">
                      <Building2 className="w-10 h-10" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-[#151D18]/85 text-[#FFFFFF] text-[11px] font-mono">
                      {p.code}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                        p.isPublished
                          ? 'bg-[#E4EBE0] text-[#064E3B] border-[#A8B9A2]'
                          : 'bg-[#FFFFFF]/95 text-[#77796F] border-[#E5E4DA]'
                      }`}
                    >
                      {p.isPublished ? 'PUBLISHED' : 'UNPUBLISHED'}
                    </span>
                  </div>
                </div>

                <div className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#20251F] line-clamp-1">
                      {p.title}
                    </h3>
                    <span className="text-xs font-mono font-semibold text-[#064E3B] shrink-0">
                      {formatCurrency(p.expectedPrice, '₹')}
                    </span>
                  </div>
                  <p className="text-xs text-[#77796F] truncate">{p.location}</p>
                  <div className="pt-2 border-t border-[#E5E4DA] text-[11px] text-[#77796F] space-y-1">
                    <div className="flex justify-between">
                      <span>Seller:</span>
                      <span className="text-[#20251F] font-medium">
                        {p.sellerName} ({p.sellerPhone})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Assigned Advisor:</span>
                      <span className="text-[#20251F] font-medium">
                        {p.assignedAgentName || crmUser?.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Media Files:</span>
                      <span className="font-mono text-[#20251F]">
                        {p.media.filter((m) => m.mediaCategory === 'PHOTO').length} photos ·{' '}
                        {p.media.filter((m) => m.mediaCategory === 'VIDEO').length} videos
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="px-4 py-3 bg-[#F1F0E8]/50 border-t border-[#E5E4DA] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void openPropertyWorkspace(p)}
                    className="h-8 px-2.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/60 text-[11px] font-medium text-[#20251F] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <ImagePlus className="w-3.5 h-3.5 text-[#064E3B]" />
                    {isAdmin ? 'Media' : 'Workspace'}
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => void openAssignModal(p)}
                      className="h-8 px-2.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/60 text-[11px] font-medium text-[#20251F] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-[#064E3B]" />
                      Assign
                    </button>
                  )}

                  {p.isPublished && onNavigatePath && (
                    <button
                      type="button"
                      onClick={() => onNavigatePath(`/properties/${p.code}`)}
                      className="h-8 px-2 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-[11px] text-[#064E3B] inline-flex items-center gap-1 cursor-pointer"
                      title="View Public Listing"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() =>
                      setConfirmTarget({ prop: p, publish: !p.isPublished })
                    }
                    className={`h-8 px-3 rounded-lg text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      p.isPublished
                        ? 'border border-[#C96C60]/40 bg-[#FFFFFF] text-[#9E3E33] hover:bg-[#C96C60]/10'
                        : 'bg-[#064E3B] hover:bg-[#176B50] text-[#FFFFFF]'
                    }`}
                  >
                    {p.isPublished ? (
                      <>
                        <GlobeLock className="w-3.5 h-3.5" />
                        Unpublish
                      </>
                    ) : (
                      <>
                        <Globe className="w-3.5 h-3.5" />
                        Publish
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm Publish / Unpublish */}
      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={
          confirmTarget?.publish
            ? `Publish ${confirmTarget.prop.code} Publicly?`
            : `Unpublish ${confirmTarget?.prop.code}?`
        }
        message={
          confirmTarget?.publish
            ? `Publishing "${confirmTarget.prop.title}" will make sanitized property details, photos, and videos visible on the public website. Seller phone numbers and internal notes remain strictly hidden.`
            : `Unpublishing "${confirmTarget?.prop.title}" removes it from the public website immediately without deleting any CRM records or media.`
        }
        confirmLabel={confirmTarget?.publish ? 'Publish Live' : 'Unpublish'}
        danger={!confirmTarget?.publish}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => void handleConfirmPublish()}
      />

      {/* Admin Assignment & History Modal */}
      <Modal
        open={Boolean(assignModalProp)}
        onClose={() => setAssignModalProp(null)}
        title={`Assign Salesperson — ${assignModalProp?.code}`}
        subtitle={assignModalProp?.title}
        maxWidthClass="max-w-lg"
      >
        {assignModalProp && (
          <div className="space-y-5">
            <form onSubmit={handleAssignAgent} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Salesperson / Advisor *
                </label>
                <select
                  required
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                >
                  <option value="">Select active advisor...</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role} · {a.designation})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Assignment Notes (Optional)
                </label>
                <input
                  type="text"
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="Inspection priority or territory note..."
                  className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="h-9 px-4 rounded-lg bg-[#064E3B] text-[#FFFFFF] text-xs font-medium cursor-pointer"
                >
                  Save Assignment
                </button>
              </div>
            </form>

            {historyData && (
              <div className="space-y-3 pt-3 border-t border-[#E5E4DA]">
                <h4 className="text-xs font-semibold text-[#20251F] inline-flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#064E3B]" />
                  Assignment & Publication Log
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
                  {historyData.assignments.map((a) => (
                    <div
                      key={`a-${a.id}`}
                      className="p-2.5 rounded-lg bg-[#F1F0E8]/60 border border-[#E5E4DA]"
                    >
                      <p className="font-medium text-[#20251F]">
                        Assigned to {a.agentName} ({a.assignmentStatus})
                      </p>
                      <p className="text-[11px] text-[#77796F]">
                        By {a.assignedByName} on {formatDate(a.assignedAt)}
                        {a.notes ? ` — ${a.notes}` : ''}
                      </p>
                    </div>
                  ))}
                  {historyData.publicationHistory.map((p) => (
                    <div
                      key={`p-${p.id}`}
                      className="p-2.5 rounded-lg bg-[#E4EBE0]/40 border border-[#E5E4DA]"
                    >
                      <p className="font-medium text-[#064E3B]">
                        {p.action} by {p.actorName}
                      </p>
                      <p className="text-[11px] text-[#77796F]">
                        {formatDate(p.createdAt)} {p.notes ? `— ${p.notes}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Media Manager & Agent Scoped Workspace Modal */}
      <Modal
        open={Boolean(activeProp)}
        onClose={() => setActiveProp(null)}
        title={`${activeProp?.code} — ${activeProp?.title}`}
        subtitle={activeProp?.location}
        maxWidthClass="max-w-3xl"
      >
        {activeProp && (
          <div className="space-y-6">
            {/* Media Upload & Reorder */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#77796F]">
                  Property Media ({activeMedia.length})
                </h3>
                <div>
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    className="h-8 px-3 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-[#FFFFFF] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    Add Photos / Videos
                  </button>
                  <input
                    ref={mediaInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={(e) => {
                      void handleUploadMedia(e.target.files);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </div>
              </div>

              {uploadingPct !== null && (
                <div className="h-1.5 rounded-full bg-[#E4EBE0] overflow-hidden">
                  <div
                    className="h-full bg-[#064E3B]"
                    style={{ width: `${uploadingPct}%` }}
                  />
                </div>
              )}

              {activeMedia.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-[#E5E4DA] text-center text-xs text-[#77796F]">
                  No media attached yet. Upload photos or walkthrough videos above.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {activeMedia.map((m, idx) => (
                    <div
                      key={m.id}
                      className="rounded-xl border border-[#E5E4DA] overflow-hidden bg-[#FFFFFF]"
                    >
                      {m.mediaCategory === 'PHOTO' ? (
                        <img
                          src={m.thumbnailUrl || m.url}
                          alt={m.originalFilename || 'Property photo'}
                          referrerPolicy="no-referrer"
                          className="w-full h-28 object-cover"
                        />
                      ) : (
                        <div className="w-full h-28 bg-[#151D18] text-[#E4EBE0] flex flex-col items-center justify-center">
                          <FileVideo className="w-6 h-6" />
                          <span className="text-[10px] font-mono mt-1">VIDEO</span>
                        </div>
                      )}
                      <div className="p-2 flex items-center justify-between gap-1 border-t border-[#E5E4DA] text-[11px]">
                        <div className="flex items-center gap-1">
                          {m.mediaCategory === 'PHOTO' && (
                            <button
                              type="button"
                              onClick={() => void handleSetCover(m.id)}
                              title="Set as Cover Photo"
                              className={`p-1 rounded cursor-pointer ${
                                m.isCover
                                  ? 'bg-[#064E3B] text-[#FFFFFF]'
                                  : 'hover:bg-[#F1F0E8] text-[#77796F]'
                              }`}
                            >
                              <Star className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => void handleMoveMedia(idx, -1)}
                            className="p-1 rounded hover:bg-[#F1F0E8] disabled:opacity-30 cursor-pointer"
                            title="Move earlier"
                          >
                            <ArrowLeft className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === activeMedia.length - 1}
                            onClick={() => void handleMoveMedia(idx, 1)}
                            className="p-1 rounded hover:bg-[#F1F0E8] disabled:opacity-30 cursor-pointer"
                            title="Move later"
                          >
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteMedia(m.id)}
                          className="p-1 rounded text-[#C96C60] hover:bg-[#C96C60]/10 cursor-pointer"
                          title="Delete media"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Agent Workspace Controls (Seller Contact, Status, Follow-ups) */}
            {!isAdmin && (
              <>
                <div className="p-4 rounded-xl bg-[#F1F0E8]/60 border border-[#E5E4DA] space-y-3 text-xs">
                  <p className="font-semibold text-[#20251F] inline-flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-[#064E3B]" />
                    Seller Contact & Field Update
                  </p>
                  <p>
                    <strong>{activeProp.sellerName}</strong> ·{' '}
                    <span className="font-mono text-[#064E3B]">
                      {activeProp.sellerPhone}
                    </span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium mb-1">
                        Availability Status
                      </label>
                      <select
                        value={agentStatus}
                        onChange={(e) => setAgentStatus(e.target.value)}
                        className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                      >
                        <option value="Available">Available</option>
                        <option value="Under Negotiation">Under Negotiation</option>
                        <option value="Reserved">Reserved</option>
                        <option value="Rented">Rented</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium mb-1">
                        Field Inspection Notes
                      </label>
                      <input
                        type="text"
                        value={agentNotes}
                        onChange={(e) => setAgentNotes(e.target.value)}
                        className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleSaveAgentUpdate()}
                      className="h-8 px-4 rounded-lg bg-[#064E3B] text-[#FFFFFF] text-xs font-medium cursor-pointer"
                    >
                      Save Update
                    </button>
                  </div>
                </div>

                {/* Agent Follow-ups */}
                <div className="space-y-3 pt-2 border-t border-[#E5E4DA]">
                  <h4 className="text-xs font-semibold text-[#20251F] inline-flex items-center gap-1.5">
                    <CalendarCheck2 className="w-3.5 h-3.5 text-[#064E3B]" />
                    Follow-ups & Site Visits
                  </h4>
                  <form
                    onSubmit={handleCreateFollowUp}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2"
                  >
                    <input
                      type="text"
                      required
                      value={fupTitle}
                      onChange={(e) => setFupTitle(e.target.value)}
                      placeholder="Follow-up title (e.g. Site inspection with buyer)"
                      className="sm:col-span-5 h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                    />
                    <select
                      value={fupType}
                      onChange={(e) => setFupType(e.target.value)}
                      className="sm:col-span-2 h-9 px-2 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                    >
                      <option value="Call">Call</option>
                      <option value="Site Visit">Site Visit</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Meeting">Meeting</option>
                    </select>
                    <input
                      type="date"
                      value={fupDate}
                      onChange={(e) => setFupDate(e.target.value)}
                      className="sm:col-span-3 h-9 px-2 text-xs font-mono border border-[#E5E4DA] rounded-lg"
                    />
                    <button
                      type="submit"
                      className="sm:col-span-2 h-9 rounded-lg bg-[#151D18] text-[#FFFFFF] text-xs font-medium cursor-pointer"
                    >
                      Schedule
                    </button>
                  </form>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {activeFollowUps.map((f) => (
                      <div
                        key={f.id}
                        className="p-2.5 rounded-lg border border-[#E5E4DA] flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p
                            className={`font-medium ${
                              f.status === 'COMPLETED'
                                ? 'line-through text-[#77796F]'
                                : 'text-[#20251F]'
                            }`}
                          >
                            {f.title}
                          </p>
                          <p className="text-[11px] text-[#77796F]">
                            {f.activityType} · {f.scheduledDate} {f.scheduledTime}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleToggleFollowUp(f)}
                          className={`h-7 px-2.5 rounded border text-[11px] inline-flex items-center gap-1 cursor-pointer ${
                            f.status === 'COMPLETED'
                              ? 'bg-[#E4EBE0] text-[#064E3B] border-[#A8B9A2]'
                              : 'bg-[#FFFFFF] text-[#20251F] border-[#E5E4DA]'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {f.status === 'COMPLETED' ? 'Done' : 'Complete'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
