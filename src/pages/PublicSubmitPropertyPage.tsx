import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileVideo,
  ImagePlus,
  Loader2,
  Trash2,
  UploadCloud,
  Video,
} from 'lucide-react';
import { PublicNavbar } from '../components/public/PublicNavbar';
import { apiClient, PublicSubmissionReceipt } from '../services/apiClient';

interface PublicSubmitPropertyPageProps {
  onNavigatePath: (path: string) => void;
}

interface QueuedMedia {
  id: string;
  file: File;
  category: 'PHOTO' | 'VIDEO';
  previewUrl: string | null;
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_PHOTOS = 12;
const MAX_VIDEOS = 3;

const PROPERTY_TYPE_OPTIONS = ['Land', 'House', 'Villa', 'Apartment', 'Shop', 'Resort'];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PublicSubmitPropertyPage: React.FC<PublicSubmitPropertyPageProps> = ({
  onNavigatePath,
}) => {
  const [sellerName, setSellerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [propertyType, setPropertyType] = useState('House');
  const [location, setLocation] = useState('');
  const [shortDescription, setShortDescription] = useState('');

  // Optional fields
  const [expectedPrice, setExpectedPrice] = useState('');
  const [propertySize, setPropertySize] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [mediaQueue, setMediaQueue] = useState<QueuedMedia[]>([]);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [receipt, setReceipt] = useState<PublicSubmissionReceipt | null>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);

  const photoCount = useMemo(
    () => mediaQueue.filter((m) => m.category === 'PHOTO').length,
    [mediaQueue]
  );
  const videoCount = useMemo(
    () => mediaQueue.filter((m) => m.category === 'VIDEO').length,
    [mediaQueue]
  );

  const addSelectedFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setMediaWarning(null);
    const warnings: string[] = [];
    const additions: QueuedMedia[] = [];

    let nextPhotos = photoCount;
    let nextVideos = videoCount;

    Array.from(fileList).forEach((file) => {
      const lower = file.name.toLowerCase();
      const isVideo =
        file.type.startsWith('video/') ||
        /\.(mp4|mov|webm)$/i.test(lower);
      const isPhoto =
        file.type.startsWith('image/') ||
        /\.(jpe?g|png|webp|heic|heif)$/i.test(lower);

      if (!isPhoto && !isVideo) {
        warnings.push(`${file.name}: Unsupported file type. Use JPG, PNG, WebP, HEIC, MP4, MOV, or WebM.`);
        return;
      }

      if (isPhoto) {
        if (file.size > MAX_PHOTO_BYTES) {
          warnings.push(`${file.name}: Exceeds 10 MB photo size limit.`);
          return;
        }
        if (nextPhotos >= MAX_PHOTOS) {
          warnings.push(`Maximum ${MAX_PHOTOS} photos allowed.`);
          return;
        }
        nextPhotos += 1;
        additions.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          category: 'PHOTO',
          previewUrl: URL.createObjectURL(file),
        });
      } else {
        if (file.size > MAX_VIDEO_BYTES) {
          warnings.push(`${file.name}: Exceeds 100 MB video size limit.`);
          return;
        }
        if (nextVideos >= MAX_VIDEOS) {
          warnings.push(`Maximum ${MAX_VIDEOS} videos allowed.`);
          return;
        }
        nextVideos += 1;
        additions.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          category: 'VIDEO',
          previewUrl: URL.createObjectURL(file),
        });
      }
    });

    if (warnings.length > 0) setMediaWarning(warnings.join(' '));
    if (additions.length > 0) {
      setMediaQueue((prev) => [...prev, ...additions]);
    }
  };

  const removeMediaItem = (id: string) => {
    setMediaQueue((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((m) => m.id !== id);
    });
  };

  const resetForm = () => {
    mediaQueue.forEach((m) => {
      if (m.previewUrl) URL.revokeObjectURL(m.previewUrl);
    });
    setSellerName('');
    setMobileNumber('');
    setSellerEmail('');
    setPropertyType('House');
    setLocation('');
    setShortDescription('');
    setExpectedPrice('');
    setPropertySize('');
    setBedrooms('');
    setBathrooms('');
    setAdditionalNotes('');
    setMediaQueue([]);
    setMediaWarning(null);
    setSubmitError(null);
    setUploadProgress(0);
    setReceipt(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (sellerName.trim().length < 2) {
      setSubmitError('Please enter your name.');
      return;
    }
    if (mobileNumber.trim().length < 7) {
      setSubmitError('Please enter a valid mobile number.');
      return;
    }
    if (!location.trim()) {
      setSubmitError('Please enter the property location.');
      return;
    }
    if (shortDescription.trim().length < 5) {
      setSubmitError('Please add a short property description.');
      return;
    }

    const formData = new FormData();
    formData.append('sellerName', sellerName.trim());
    formData.append('mobileNumber', mobileNumber.trim());
    if (sellerEmail.trim()) formData.append('sellerEmail', sellerEmail.trim());
    formData.append('propertyType', propertyType);
    formData.append('location', location.trim());
    formData.append('shortDescription', shortDescription.trim());

    if (expectedPrice.trim()) formData.append('expectedPrice', expectedPrice.trim());
    if (propertySize.trim()) formData.append('propertySize', propertySize.trim());
    if (bedrooms.trim()) formData.append('bedrooms', bedrooms.trim());
    if (bathrooms.trim()) formData.append('bathrooms', bathrooms.trim());
    if (additionalNotes.trim()) formData.append('additionalNotes', additionalNotes.trim());

    mediaQueue.forEach((item) => {
      formData.append(item.category === 'PHOTO' ? 'photos' : 'videos', item.file);
    });

    setSubmitting(true);
    setUploadProgress(5);
    try {
      const res = await apiClient.submitPublicProperty(formData, (pct) => {
        setUploadProgress(pct);
      });
      setReceipt(res);
    } catch (err: any) {
      setSubmitError(err?.message || 'Unable to submit your property. Please check your entries.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F0E8] text-[#20251F] flex flex-col">
      <PublicNavbar currentPath="/submit-property" onNavigatePath={onNavigatePath} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {receipt ? (
          <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 sm:p-10 space-y-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#E4EBE0] text-[#064E3B] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-mono uppercase tracking-wider text-[#064E3B]">
                Submission Received
              </p>
              <h1 className="text-2xl font-semibold text-[#20251F]">
                Property Submitted Successfully
              </h1>
              <p className="text-sm text-[#20251F]/85 max-w-xl mx-auto leading-relaxed">
                Thank you for submitting your property to Teakees Estate. Our team will review your details and contact you within 48 hours.
              </p>
            </div>

            <div className="max-w-md mx-auto bg-[#F1F0E8]/80 border border-[#E5E4DA] rounded-xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#77796F]">Reference Number</span>
                <span className="font-mono font-semibold text-[#064E3B] text-sm">
                  {receipt.referenceNumber}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#77796F]">Media Attached</span>
                <span className="font-medium text-[#20251F]">
                  {receipt.photoCount} photo(s), {receipt.videoCount} video(s)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#77796F]">Follow-up Window</span>
                <span className="font-medium text-[#20251F]">Within 48 hours</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="w-full sm:w-auto h-10 px-5 rounded-xl border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium text-[#20251F] cursor-pointer"
              >
                Submit Another Property
              </button>
              <button
                type="button"
                onClick={() => onNavigatePath('/')}
                className="w-full sm:w-auto h-10 px-5 rounded-xl bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] cursor-pointer"
              >
                Explore Published Listings
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-mono uppercase tracking-wider text-[#064E3B]">
                No Account Required
              </p>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#20251F]">
                Submit Your Property
              </h1>
              <p className="text-xs sm:text-sm text-[#77796F] leading-relaxed">
                Share the essential details below along with photos or walkthrough videos. Our property advisory team will review and reach out within 48 hours.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 sm:p-7 space-y-6"
            >
              {submitError && (
                <div className="p-3.5 rounded-xl bg-[#C96C60]/10 border border-[#C96C60]/30 text-xs text-[#9E3E33] flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Required Information */}
              <div className="space-y-4">
                <div className="pb-2 border-b border-[#E5E4DA]">
                  <h2 className="text-sm font-semibold text-[#20251F]">
                    Required Information
                  </h2>
                  <p className="text-[11px] text-[#77796F]">
                    Just 5 quick details to get your property into review.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#20251F] mb-1">
                      Seller Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#20251F] mb-1">
                      Mobile Number *
                    </label>
                    <input
                      type="tel"
                      required
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="+91 98470 00000"
                      className="w-full h-10 px-3 text-sm font-mono bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#20251F] mb-1">
                      Property Type *
                    </label>
                    <select
                      required
                      value={propertyType}
                      onChange={(e) => setPropertyType(e.target.value)}
                      className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                    >
                      {PROPERTY_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#20251F] mb-1">
                      Property Location *
                    </label>
                    <input
                      type="text"
                      required
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Locality, Panchayath / Town, District"
                      className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#20251F] mb-1">
                    Short Property Description *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    placeholder="Briefly describe the plot, home, road access, frontage, or key highlights..."
                    className="w-full p-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                  />
                </div>
              </div>

              {/* Optional Details */}
              <div className="space-y-4">
                <div className="pb-2 border-b border-[#E5E4DA]">
                  <h2 className="text-sm font-semibold text-[#20251F]">
                    Optional Property Details
                  </h2>
                  <p className="text-[11px] text-[#77796F]">
                    Share any additional specifications you already have handy.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-[#77796F] mb-1">
                      Expected Price (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={expectedPrice}
                      onChange={(e) => setExpectedPrice(e.target.value)}
                      placeholder="Optional"
                      className="w-full h-10 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#77796F] mb-1">
                      Property Size
                    </label>
                    <input
                      type="text"
                      value={propertySize}
                      onChange={(e) => setPropertySize(e.target.value)}
                      placeholder="e.g. 12 Cents / 2,400 Sq.ft"
                      className="w-full h-10 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#77796F] mb-1">
                      Bedrooms
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={bedrooms}
                      onChange={(e) => setBedrooms(e.target.value)}
                      placeholder="Optional"
                      className="w-full h-10 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#77796F] mb-1">
                      Bathrooms
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={bathrooms}
                      onChange={(e) => setBathrooms(e.target.value)}
                      placeholder="Optional"
                      className="w-full h-10 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-[#77796F] mb-1">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      value={sellerEmail}
                      onChange={(e) => setSellerEmail(e.target.value)}
                      placeholder="owner@example.com"
                      className="w-full h-10 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#77796F] mb-1">
                      Additional Notes (Optional)
                    </label>
                    <input
                      type="text"
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      placeholder="Best time to call, landmarks, or ownership notes..."
                      className="w-full h-10 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Property Photos & Video Capture */}
              <div className="space-y-4">
                <div className="pb-2 border-b border-[#E5E4DA] flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-[#20251F]">
                      Property Photos & Walkthrough Videos (Optional)
                    </h2>
                    <p className="text-[11px] text-[#77796F]">
                      Photos: JPG, PNG, WebP, HEIC (max 10 MB each, up to {MAX_PHOTOS}). Videos: MP4, MOV, WebM (max 100 MB each, up to {MAX_VIDEOS}).
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-[#77796F]">
                    {photoCount}/{MAX_PHOTOS} photos · {videoCount}/{MAX_VIDEOS} videos
                  </span>
                </div>

                {/* Upload & Direct Mobile Camera Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="h-11 px-3 rounded-xl border border-dashed border-[#064E3B]/50 bg-[#E4EBE0]/40 hover:bg-[#E4EBE0] text-xs font-medium text-[#064E3B] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <ImagePlus className="w-4 h-4" />
                    Choose Photos / Videos
                  </button>

                  <button
                    type="button"
                    onClick={() => cameraPhotoRef.current?.click()}
                    className="h-11 px-3 rounded-xl border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium text-[#20251F] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-[#064E3B]" />
                    Take Photo (Camera)
                  </button>

                  <button
                    type="button"
                    onClick={() => cameraVideoRef.current?.click()}
                    className="h-11 px-3 rounded-xl border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium text-[#20251F] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Video className="w-4 h-4 text-[#064E3B]" />
                    Record Video (Camera)
                  </button>
                </div>

                <input
                  ref={galleryInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
                  onChange={(e) => {
                    addSelectedFiles(e.target.files);
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
                    addSelectedFiles(e.target.files);
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
                    addSelectedFiles(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                {mediaWarning && (
                  <div className="p-3 rounded-xl bg-[#D9AC57]/15 border border-[#D9AC57]/40 text-xs text-[#7A5612]">
                    {mediaWarning}
                  </div>
                )}

                {mediaQueue.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {mediaQueue.map((item) => (
                      <div
                        key={item.id}
                        className="relative rounded-xl border border-[#E5E4DA] bg-[#F1F0E8]/50 overflow-hidden group"
                      >
                        {item.category === 'PHOTO' && item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt={item.file.name}
                            className="w-full h-24 object-cover"
                          />
                        ) : item.previewUrl ? (
                          <video
                            src={item.previewUrl}
                            controls
                            muted
                            preload="metadata"
                            className="w-full h-24 object-cover bg-[#151D18]"
                          />
                        ) : (
                          <div className="w-full h-24 bg-[#151D18] text-[#E4EBE0] flex flex-col items-center justify-center p-2 text-center">
                            <FileVideo className="w-6 h-6 mb-1" />
                            <span className="text-[10px] font-mono">VIDEO</span>
                          </div>
                        )}
                        <div className="p-2 text-[11px] bg-[#FFFFFF] border-t border-[#E5E4DA]">
                          <p className="truncate font-medium text-[#20251F]">
                            {item.file.name}
                          </p>
                          <p className="text-[10px] font-mono text-[#77796F]">
                            {formatBytes(item.file.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMediaItem(item.id)}
                          aria-label={`Remove ${item.file.name}`}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[#151D18]/80 text-[#FFFFFF] hover:bg-[#C96C60] flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {submitting && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[#064E3B] font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Uploading submission & verifying media...
                    </span>
                    <span className="font-mono">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#E4EBE0] overflow-hidden">
                    <div
                      className="h-full bg-[#064E3B] transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-[#E5E4DA]">
                <p className="text-[11px] text-[#77796F]">
                  Your phone number is strictly confidential and never published publicly.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-11 px-6 rounded-xl bg-[#064E3B] hover:bg-[#176B50] disabled:opacity-60 text-[#FFFFFF] text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
                >
                  <UploadCloud className="w-4 h-4" />
                  {submitting ? 'Submitting...' : 'Submit Property for Review'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};
