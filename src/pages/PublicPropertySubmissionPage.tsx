import React, { useState } from 'react';
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
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
            Property Photos & Documents
          </label>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            className="w-full text-sm text-[#5E655B] file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[#325343]/10 file:text-[#325343] hover:file:bg-[#325343]/20 cursor-pointer"
          />
          <p className="text-xs text-[#8E948B] mt-1">
            Max 5 MiB per file. Supported formats: JPEG, PNG, WebP, PDF.
          </p>
        </div>

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
