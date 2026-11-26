import React, { useEffect, useRef, useState } from 'react';
import { Camera, Video, X } from 'lucide-react';
import { apiClient } from '../services/apiClient';

export const PublicPropertySubmissionPage: React.FC = () => {
  const [sellerName, setSellerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [propertyType, setPropertyType] = useState('House');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [expectedPrice, setExpectedPrice] = useState('');
  const [size, setSize] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ reference: string; message: string } | null>(null);

  // Camera capture states
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const openCamera = async (mode: 'photo' | 'video') => {
    setCameraError(null);
    setCameraMode(mode);
    setCameraOpen(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: mode === 'video',
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      setCameraError(err.message || 'Unable to access camera. Please check permissions.');
    }
  };

  const closeCamera = () => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraError(null);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        if (files.length >= 10) {
          setError('Maximum 10 files allowed.');
          closeCamera();
          return;
        }
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setFiles((prev) => [...prev, file]);
      }
      closeCamera();
    }, 'image/jpeg', 0.9);
  };

  const startVideoRecording = () => {
    if (!mediaStreamRef.current) return;
    recordedChunksRef.current = [];
    try {
      const mimeType = MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(mediaStreamRef.current, options);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        const finalType = recorder.mimeType || 'video/mp4';
        const ext = finalType.includes('webm') ? 'webm' : 'mp4';
        const blob = new Blob(recordedChunksRef.current, { type: finalType });
        if (files.length >= 10) {
          setError('Maximum 10 files allowed.');
        } else {
          const file = new File([blob], `video_${Date.now()}.${ext}`, { type: finalType });
          setFiles((prev) => [...prev, file]);
        }
        closeCamera();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      setCameraError('Recording failed: ' + err.message);
    }
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (files.length + newFiles.length > 10) {
        setError('Maximum 10 media files allowed in total.');
        return;
      }
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sellerName.trim() || !mobile.trim() || !location.trim() || !description.trim()) {
      setError('Please fill in all required fields (Name, Mobile, Location, and Description).');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('seller_name', sellerName);
      formData.append('mobile', mobile);
      formData.append('property_type', propertyType);
      formData.append('location', location);
      formData.append('description', description);
      if (expectedPrice) formData.append('expected_price', expectedPrice);
      if (size) formData.append('size', size);
      if (bedrooms) formData.append('bedrooms', bedrooms);
      if (bathrooms) formData.append('bathrooms', bathrooms);
      if (notes) formData.append('notes', notes);

      files.forEach((file) => {
        formData.append('files', file);
      });

      const res = await apiClient.submitPublicProperty(formData);
      setSuccessData({
        reference: res.reference,
        message: res.message || 'Thank you for submitting your property! Our team will contact you within 48 hours.',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to submit property. Please check your inputs and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSellerName('');
    setMobile('');
    setPropertyType('House');
    setLocation('');
    setDescription('');
    setExpectedPrice('');
    setSize('');
    setBedrooms('');
    setBathrooms('');
    setNotes('');
    setFiles([]);
    setSuccessData(null);
    setError(null);
  };

  if (successData) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-2xl shadow-sm border border-[#E4E3D8] text-center">
        <div className="w-16 h-16 bg-[#325343]/10 text-[#325343] rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-[#20251F] mb-2">Property Submission Received!</h2>
        <p className="text-[#5E655B] mb-6">{successData.message}</p>
        <div className="bg-[#F1F0E8] p-4 rounded-xl mb-6 inline-block">
          <span className="text-xs uppercase tracking-wider text-[#5E655B] block mb-1">Submission Reference</span>
          <span className="text-xl font-mono font-bold text-[#325343]">{successData.reference}</span>
        </div>
        <div>
          <button
            onClick={resetForm}
            className="px-6 py-2.5 bg-[#325343] text-white font-medium rounded-xl hover:bg-[#253f33] transition"
          >
            Submit Another Property
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto my-8 p-6 sm:p-10 bg-white rounded-2xl shadow-sm border border-[#E4E3D8]">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#20251F]">List Your Property with Teakees</h1>
        <p className="text-[#5E655B] mt-2">
          Submit your property details below. Our expert team will review, verify, and assist in connecting with qualified buyers.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-2">
              Your Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
              placeholder="e.g. George Varghese"
              className="w-full px-4 py-2.5 rounded-xl border border-[#D5D4C7] bg-[#FAF9F5] focus:outline-none focus:ring-2 focus:ring-[#325343]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-2">
              Mobile / WhatsApp Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full px-4 py-2.5 rounded-xl border border-[#D5D4C7] bg-[#FAF9F5] focus:outline-none focus:ring-2 focus:ring-[#325343]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-2">
              Property Type <span className="text-red-500">*</span>
            </label>
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#D5D4C7] bg-[#FAF9F5] focus:outline-none focus:ring-2 focus:ring-[#325343]"
            >
              <option value="House">House / Villa</option>
              <option value="Land">Land / Plot</option>
              <option value="Commercial">Commercial Property</option>
              <option value="Plantation">Coffee / Tea Plantation</option>
              <option value="Resort">Resort / Homestay</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-2">
              Location / Town <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Kalpetta, Wayanad"
              className="w-full px-4 py-2.5 rounded-xl border border-[#D5D4C7] bg-[#FAF9F5] focus:outline-none focus:ring-2 focus:ring-[#325343]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-2">
              Expected Price (₹)
            </label>
            <input
              type="number"
              value={expectedPrice}
              onChange={(e) => setExpectedPrice(e.target.value)}
              placeholder="e.g. 7500000"
              className="w-full px-4 py-2.5 rounded-xl border border-[#D5D4C7] bg-[#FAF9F5] focus:outline-none focus:ring-2 focus:ring-[#325343]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-2">
              Plot / Built-up Size
            </label>
            <input
              type="number"
              step="any"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="e.g. 15 (Cents)"
              className="w-full px-4 py-2.5 rounded-xl border border-[#D5D4C7] bg-[#FAF9F5] focus:outline-none focus:ring-2 focus:ring-[#325343]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-2">
              Bedrooms / Baths (if House)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={bedrooms}
                onChange={(e) => setBedrooms(e.target.value)}
                placeholder="BHK"
                className="w-1/2 px-3 py-2.5 rounded-xl border border-[#D5D4C7] bg-[#FAF9F5] focus:outline-none focus:ring-2 focus:ring-[#325343]"
              />
              <input
                type="number"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                placeholder="Baths"
                className="w-1/2 px-3 py-2.5 rounded-xl border border-[#D5D4C7] bg-[#FAF9F5] focus:outline-none focus:ring-2 focus:ring-[#325343]"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-2">
            Property Description & Key Highlights <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mention road connectivity, water availability, nearby landmarks, plantation details..."
            className="w-full px-4 py-2.5 rounded-xl border border-[#D5D4C7] bg-[#FAF9F5] focus:outline-none focus:ring-2 focus:ring-[#325343]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-2">
            Property Media (Photos & Videos)
          </label>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#325343]/10 text-[#325343] hover:bg-[#325343]/20 rounded-xl text-xs font-semibold cursor-pointer transition">
              <span>Choose Files</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={() => openCamera('photo')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#FAF9F5] border border-[#D5D4C7] text-[#20251F] hover:bg-[#F1F0E8] rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-[#325343]" />
              Take Photo
            </button>
            <button
              type="button"
              onClick={() => openCamera('video')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#FAF9F5] border border-[#D5D4C7] text-[#20251F] hover:bg-[#F1F0E8] rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Video className="w-3.5 h-3.5 text-[#325343]" />
              Record Video
            </button>
          </div>
          <p className="text-xs text-[#8E948B]">
            Max 10 files. Photos up to 5 MiB (JPEG, PNG, WebP), Videos up to 15 MiB (MP4, MOV, WebM).
          </p>

          {/* Attached Files List */}
          {files.length > 0 && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {files.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="relative rounded-xl border border-[#D5D4C7] bg-[#FAF9F5] overflow-hidden p-2 flex flex-col justify-between"
                >
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition z-10 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="h-20 w-full flex items-center justify-center overflow-hidden rounded-lg bg-gray-100 mb-1">
                    {file.type.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-xs text-[#5E655B]">
                        <Video className="w-6 h-6 text-[#325343] mb-1" />
                        <span>Video</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] text-[#20251F] font-medium truncate block" title={file.name}>
                    {file.name}
                  </span>
                  <span className="text-[10px] text-[#8E948B]">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Camera Modal */}
        {cameraOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
              <div className="flex justify-between items-center pb-2 border-b border-[#E4E3D8]">
                <h3 className="text-sm font-bold text-[#20251F]">
                  {cameraMode === 'photo' ? 'Capture Property Photo' : 'Record Short Video Tour'}
                </h3>
                <button
                  type="button"
                  onClick={closeCamera}
                  className="text-gray-400 hover:text-gray-700 text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              {cameraError ? (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs">
                  {cameraError}
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-black h-64">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {isRecording && (
                    <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 text-white text-xs px-2.5 py-1 rounded-full animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-white" />
                      Recording...
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCamera}
                  className="px-4 py-2 border border-[#D5D4C7] rounded-xl text-xs font-semibold text-[#5E655B] hover:bg-gray-50"
                >
                  Cancel
                </button>
                {cameraMode === 'photo' ? (
                  <button
                    type="button"
                    onClick={capturePhoto}
                    disabled={!!cameraError}
                    className="px-5 py-2 bg-[#325343] text-white rounded-xl text-xs font-semibold hover:bg-[#253f33] disabled:opacity-50"
                  >
                    Take Photo
                  </button>
                ) : isRecording ? (
                  <button
                    type="button"
                    onClick={stopVideoRecording}
                    className="px-5 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700"
                  >
                    Stop & Attach
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startVideoRecording}
                    disabled={!!cameraError}
                    className="px-5 py-2 bg-[#325343] text-white rounded-xl text-xs font-semibold hover:bg-[#253f33] disabled:opacity-50"
                  >
                    Start Recording
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-2">
            Internal / Confidential Notes (Optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any specific instructions or preferences for our team..."
            className="w-full px-4 py-2.5 rounded-xl border border-[#D5D4C7] bg-[#FAF9F5] focus:outline-none focus:ring-2 focus:ring-[#325343]"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-6 bg-[#325343] text-white font-semibold rounded-xl hover:bg-[#253f33] disabled:opacity-50 transition shadow-sm"
        >
          {isSubmitting ? 'Submitting Property...' : 'Submit Property for Verification'}
        </button>
      </form>
    </div>
  );
};
