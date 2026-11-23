import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileVideo,
  Headphones,
  ImagePlus,
  Loader2,
  LogOut,
  Trash2,
  UploadCloud,
  Video,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiClient, TelecallerSubmissionDTO } from '../services/apiClient';
import { DEFAULT_LOGO_URL } from '../services/crmService';
import { formatCurrency, formatDate } from '../utils/formatters';

interface TelecallerWorkspacePageProps {
  onNavigatePath: (path: string) => void;
}

interface QueuedMedia {
  id: string;
  file: File;
  category: 'PHOTO' | 'VIDEO';
  previewUrl: string | null;
}

const PROPERTY_TYPES = ['Land', 'House', 'Villa', 'Apartment', 'Shop', 'Resort'];

function statusBadgeStyle(status: string): string {
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

export const TelecallerWorkspacePage: React.FC<TelecallerWorkspacePageProps> = ({
  onNavigatePath,
}) => {
  const { crmUser, signOutUser } = useAuth();

  const [sellerName, setSellerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [propertyType, setPropertyType] = useState('House');
  const [location, setLocation] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [expectedPrice, setExpectedPrice] = useState('');
  const [propertySize, setPropertySize] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [mediaQueue, setMediaQueue] = useState<QueuedMedia[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [submissions, setSubmissions] = useState<TelecallerSubmissionDTO[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);

  const loadMySubmissions = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await apiClient.getTelecallerSubmissions();
      setSubmissions(res.items);
    } catch {
      // ignore transient
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadMySubmissions();
  }, [loadMySubmissions]);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    setFormError(null);
    const next: QueuedMedia[] = [];
    Array.from(fileList).forEach((file) => {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);
      const isPhoto =
        file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
      if (!isVideo && !isPhoto) {
        setFormError(`${file.name}: unsupported format.`);
        return;
      }
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        category: isVideo ? 'VIDEO' : 'PHOTO',
        previewUrl: isPhoto ? URL.createObjectURL(file) : null,
      });
    });
    if (next.length > 0) setMediaQueue((prev) => [...prev, ...next]);
  };

  const removeQueued = (id: string) => {
    setMediaQueue((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((m) => m.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const fd = new FormData();
    fd.append('sellerName', sellerName.trim());
    fd.append('mobileNumber', mobileNumber.trim());
    fd.append('propertyType', propertyType);
    fd.append('location', location.trim());
    fd.append('shortDescription', shortDescription.trim());
    if (expectedPrice.trim()) fd.append('expectedPrice', expectedPrice.trim());
    if (propertySize.trim()) fd.append('propertySize', propertySize.trim());
    if (bedrooms.trim()) fd.append('bedrooms', bedrooms.trim());
    if (bathrooms.trim()) fd.append('bathrooms', bathrooms.trim());
    if (additionalNotes.trim()) fd.append('additionalNotes', additionalNotes.trim());

    mediaQueue.forEach((m) => {
      fd.append(m.category === 'PHOTO' ? 'photos' : 'videos', m.file);
    });

    setSubmitting(true);
    setUploadProgress(5);
    try {
      const res = await apiClient.submitTelecallerProperty(fd, setUploadProgress);
      setFormSuccess(
        `Submitted ${res.referenceNumber} (${res.photoCount} photos, ${res.videoCount} videos) for Admin review.`
      );
      setSellerName('');
      setMobileNumber('');
      setLocation('');
      setShortDescription('');
      setExpectedPrice('');
      setPropertySize('');
      setBedrooms('');
      setBathrooms('');
      setAdditionalNotes('');
      mediaQueue.forEach((m) => {
        if (m.previewUrl) URL.revokeObjectURL(m.previewUrl);
      });
      setMediaQueue([]);
      await loadMySubmissions();
    } catch (err: any) {
      setFormError(err?.message || 'Unable to submit property listing.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F0E8] text-[#20251F] flex flex-col">
      {/* Focused Telecaller Header (NO full CRM navigation) */}
      <header className="h-16 bg-[#FFFFFF] border-b border-[#E5E4DA] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={DEFAULT_LOGO_URL}
              alt="Teakees"
              className="w-9 h-9 rounded-full object-cover border border-[#E5E4DA]"
            />
            <div>
              <span className="text-sm font-semibold text-[#20251F] block">
                Teakees Telecaller Intake Desk
              </span>
              <span className="text-[11px] text-[#77796F] inline-flex items-center gap-1">
                <Headphones className="w-3 h-3 text-[#064E3B]" />
                {crmUser?.name} · {crmUser?.role}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigatePath('/')}
              className="h-9 px-3 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium text-[#20251F] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#064E3B]" />
              <span className="hidden sm:inline">Public Listings</span>
            </button>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="h-9 px-3 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#C96C60]/10 text-xs font-medium text-[#20251F] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-[#C96C60]" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Property Submission Intake Form */}
        <section className="lg:col-span-7 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-5">
          <div className="pb-3 border-b border-[#E5E4DA]">
            <h1 className="text-lg font-semibold text-[#20251F]">
              Submit Seller Property Listing
            </h1>
            <p className="text-xs text-[#77796F] mt-0.5">
              Enter called-in or field seller property details and attach photos or videos for Admin approval.
            </p>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-[#C96C60]/10 border border-[#C96C60]/30 text-xs text-[#9E3E33] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="p-3 rounded-xl bg-[#E4EBE0] border border-[#A8B9A2] text-xs text-[#064E3B] flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium mb-1">Seller Name *</label>
                <input
                  type="text"
                  required
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                  className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Mobile Number *</label>
                <input
                  type="tel"
                  required
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Property Type *</label>
                <select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value)}
                  className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg bg-[#FFFFFF]"
                >
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Property Location *</label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Locality, Panchayath, District"
                  className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Short Property Description *
              </label>
              <textarea
                rows={3}
                required
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                className="w-full p-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#77796F] mb-1">
                  Expected Price (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={expectedPrice}
                  onChange={(e) => setExpectedPrice(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono border border-[#E5E4DA] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#77796F] mb-1">
                  Size / Area
                </label>
                <input
                  type="text"
                  value={propertySize}
                  onChange={(e) => setPropertySize(e.target.value)}
                  placeholder="12 Cents"
                  className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#77796F] mb-1">
                  Bedrooms
                </label>
                <input
                  type="number"
                  min={0}
                  value={bedrooms}
                  onChange={(e) => setBedrooms(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono border border-[#E5E4DA] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#77796F] mb-1">
                  Bathrooms
                </label>
                <input
                  type="number"
                  min={0}
                  value={bathrooms}
                  onChange={(e) => setBathrooms(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono border border-[#E5E4DA] rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#77796F] mb-1">
                Telecaller Notes (Optional)
              </label>
              <input
                type="text"
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Seller callback preference or call verification notes..."
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>

            <div className="pt-2 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="h-9 px-3 rounded-lg bg-[#E4EBE0]/60 hover:bg-[#E4EBE0] border border-[#064E3B]/30 text-xs font-medium text-[#064E3B] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  Add Photos / Videos
                </button>
                <button
                  type="button"
                  onClick={() => cameraPhotoRef.current?.click()}
                  className="h-9 px-3 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-[#064E3B]" />
                  Camera Photo
                </button>
                <button
                  type="button"
                  onClick={() => cameraVideoRef.current?.click()}
                  className="h-9 px-3 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Video className="w-3.5 h-3.5 text-[#064E3B]" />
                  Camera Video
                </button>
              </div>

              <input
                ref={galleryInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <input
                ref={cameraPhotoRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <input
                ref={cameraVideoRef}
                type="file"
                accept="video/*"
                capture="environment"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
                className="hidden"
              />

              {mediaQueue.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {mediaQueue.map((m) => (
                    <div
                      key={m.id}
                      className="relative rounded-lg border border-[#E5E4DA] overflow-hidden bg-[#F1F0E8]/40"
                    >
                      {m.category === 'PHOTO' && m.previewUrl ? (
                        <img
                          src={m.previewUrl}
                          alt={m.file.name}
                          className="w-full h-16 object-cover"
                        />
                      ) : (
                        <div className="w-full h-16 bg-[#151D18] text-[#E4EBE0] flex items-center justify-center">
                          <FileVideo className="w-5 h-5" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeQueued(m.id)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#151D18]/80 text-[#FFFFFF] flex items-center justify-center cursor-pointer"
                        aria-label="Remove media"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {submitting && (
              <div className="h-1.5 rounded-full bg-[#E4EBE0] overflow-hidden">
                <div
                  className="h-full bg-[#064E3B] transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-[#E5E4DA]">
              <button
                type="submit"
                disabled={submitting}
                className="h-10 px-5 rounded-xl bg-[#064E3B] hover:bg-[#176B50] disabled:opacity-60 text-[#FFFFFF] text-xs font-medium inline-flex items-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="w-3.5 h-3.5" />
                )}
                {submitting ? 'Submitting...' : 'Submit for Admin Approval'}
              </button>
            </div>
          </form>
        </section>

        {/* Right: Own Submitted Properties List */}
        <section className="lg:col-span-5 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-4">
          <div className="pb-3 border-b border-[#E5E4DA] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#20251F]">
                My Submitted Properties
              </h2>
              <p className="text-[11px] text-[#77796F]">
                Showing only listings submitted from your telecaller desk.
              </p>
            </div>
            <span className="text-xs font-mono text-[#064E3B] font-semibold">
              {submissions.length}
            </span>
          </div>

          {loadingList ? (
            <div className="py-10 text-center text-xs text-[#77796F]">
              Loading your submissions...
            </div>
          ) : submissions.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#77796F]">
              No submissions recorded yet from your desk.
            </div>
          ) : (
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {submissions.map((s) => (
                <div
                  key={s.id}
                  className="p-3.5 rounded-xl border border-[#E5E4DA] bg-[#F1F0E8]/40 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-mono font-semibold text-[#064E3B]">
                        {s.referenceNumber}
                      </span>
                      <p className="text-xs font-semibold text-[#20251F]">
                        {s.propertyType} · {s.location}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded border ${statusBadgeStyle(
                        s.status
                      )}`}
                    >
                      {s.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#77796F]">
                    <span>
                      {s.sellerName} ({s.mobileNumber})
                    </span>
                    {s.expectedPrice ? (
                      <span className="font-mono font-medium text-[#20251F]">
                        {formatCurrency(s.expectedPrice, '₹')}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[#77796F] pt-1 border-t border-[#E5E4DA]/70">
                    <span>Submitted {formatDate(s.submittedAt)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Contact: {s.contactStatus}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
