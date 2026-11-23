import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  Calendar,
  Compass,
  MapPin,
  Maximize2,
  PhoneCall,
  Plus,
  Video,
} from 'lucide-react';
import { PublicNavbar } from '../components/public/PublicNavbar';
import { apiClient, PublicPropertyDTO } from '../services/apiClient';
import { formatCurrency, formatDate } from '../utils/formatters';

interface PublicPropertyDetailPageProps {
  idOrCode: string;
  onNavigatePath: (path: string) => void;
}

export const PublicPropertyDetailPage: React.FC<PublicPropertyDetailPageProps> = ({
  idOrCode,
  onNavigatePath,
}) => {
  const [property, setProperty] = useState<PublicPropertyDTO | null>(null);
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    setSelectedPhotoIdx(0);

    apiClient
      .getPublicPropertyDetail(idOrCode)
      .then((data) => {
        if (!active) return;
        setProperty(data);
      })
      .catch(() => {
        if (!active) return;
        setNotFound(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [idOrCode]);

  const activePhoto = property?.photos[selectedPhotoIdx] || property?.photos[0] || null;

  return (
    <div className="min-h-screen bg-[#F1F0E8] text-[#20251F] flex flex-col">
      <PublicNavbar currentPath={`/properties/${idOrCode}`} onNavigatePath={onNavigatePath} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <button
          type="button"
          onClick={() => onNavigatePath('/')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Published Properties
        </button>

        {loading ? (
          <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-8 animate-pulse space-y-5">
            <div className="h-72 bg-[#E4EBE0]/60 rounded-xl" />
            <div className="h-6 bg-[#E5E4DA] rounded w-1/2" />
            <div className="h-4 bg-[#F1F0E8] rounded w-1/3" />
          </div>
        ) : notFound || !property ? (
          <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl py-16 px-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-[#E4EBE0] text-[#064E3B] flex items-center justify-center mx-auto">
              <Building2 className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-semibold text-[#20251F]">
              Property Not Available Publicly
            </h1>
            <p className="text-xs text-[#77796F] max-w-md mx-auto">
              This property may have been unpublished, reserved, or is currently under private advisory review.
            </p>
            <button
              type="button"
              onClick={() => onNavigatePath('/')}
              className="mt-2 h-9 px-4 rounded-lg bg-[#064E3B] text-[#FFFFFF] text-xs font-medium cursor-pointer"
            >
              Browse Available Listings
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Gallery, Video, Description */}
            <div className="lg:col-span-8 space-y-6">
              {/* Primary Image Viewer */}
              <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
                <div className="aspect-[16/10] bg-[#E4EBE0] relative">
                  {activePhoto ? (
                    <img
                      src={activePhoto.url}
                      alt={property.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#064E3B]/50">
                      <Building2 className="w-14 h-14" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-[#151D18]/85 text-[#FFFFFF] text-xs font-mono">
                      {property.code}
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-[#FFFFFF]/95 text-[#064E3B] text-xs font-medium border border-[#E5E4DA]">
                      {property.status}
                    </span>
                  </div>
                </div>

                {property.photos.length > 1 && (
                  <div className="p-3 border-t border-[#E5E4DA] flex gap-2.5 overflow-x-auto">
                    {property.photos.map((photo, idx) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setSelectedPhotoIdx(idx)}
                        className={`w-20 h-14 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer ${
                          idx === selectedPhotoIdx
                            ? 'border-[#064E3B]'
                            : 'border-[#E5E4DA] opacity-75 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={photo.thumbnailUrl || photo.url}
                          alt={`Property view ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Property Details & Narrative */}
              <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-5">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#77796F]">
                    <span className="font-medium text-[#064E3B]">{property.type}</span>
                    <span>·</span>
                    <span>{property.category}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Listed {formatDate(property.listedDate)}
                    </span>
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
                    {property.title}
                  </h1>
                  <p className="text-sm text-[#77796F] flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#064E3B] shrink-0" />
                    {property.location}
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-[#F1F0E8]/70 border border-[#E5E4DA]">
                    <p className="text-[11px] text-[#77796F]">Area / Size</p>
                    <p className="text-xs font-semibold text-[#20251F] mt-1 flex items-center gap-1.5">
                      <Maximize2 className="w-3.5 h-3.5 text-[#064E3B]" />
                      {property.areaDisplay}
                    </p>
                  </div>
                  {property.bedrooms !== null && (
                    <div className="p-3 rounded-xl bg-[#F1F0E8]/70 border border-[#E5E4DA]">
                      <p className="text-[11px] text-[#77796F]">Bedrooms</p>
                      <p className="text-xs font-semibold text-[#20251F] mt-1 flex items-center gap-1.5">
                        <BedDouble className="w-3.5 h-3.5 text-[#064E3B]" />
                        {property.bedrooms}
                      </p>
                    </div>
                  )}
                  {property.bathrooms !== null && (
                    <div className="p-3 rounded-xl bg-[#F1F0E8]/70 border border-[#E5E4DA]">
                      <p className="text-[11px] text-[#77796F]">Bathrooms</p>
                      <p className="text-xs font-semibold text-[#20251F] mt-1 flex items-center gap-1.5">
                        <Bath className="w-3.5 h-3.5 text-[#064E3B]" />
                        {property.bathrooms}
                      </p>
                    </div>
                  )}
                  <div className="p-3 rounded-xl bg-[#F1F0E8]/70 border border-[#E5E4DA]">
                    <p className="text-[11px] text-[#77796F]">Road Access</p>
                    <p className="text-xs font-semibold text-[#20251F] mt-1 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-[#064E3B] shrink-0" />
                      <span className="truncate">{property.roadConnectivity}</span>
                    </p>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <h2 className="text-sm font-semibold text-[#20251F]">
                    Property Overview
                  </h2>
                  <p className="text-sm text-[#20251F]/85 leading-relaxed whitespace-pre-line">
                    {property.description}
                  </p>
                </div>
              </div>

              {/* Property Video Walkthroughs */}
              {property.videos.length > 0 && (
                <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-[#064E3B]" />
                    <h2 className="text-sm font-semibold text-[#20251F]">
                      Property Video Walkthroughs
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {property.videos.map((v) => (
                      <video
                        key={v.id}
                        controls
                        preload="metadata"
                        className="w-full rounded-xl border border-[#E5E4DA] bg-[#151D18] max-h-[420px]"
                      >
                        <source src={v.url} type={v.mimeType} />
                        Your browser does not support video playback.
                      </video>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Price & Sanitized Agency Advisory Desk */}
            <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-22">
              <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-4">
                <div>
                  <p className="text-xs text-[#77796F]">Guide Selling Price</p>
                  <p className="text-2xl font-semibold font-mono tabular-nums text-[#064E3B] mt-1">
                    {property.expectedPrice
                      ? formatCurrency(property.expectedPrice, '₹')
                      : 'Price on Request'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#F1F0E8]/80 border border-[#E5E4DA] space-y-2 text-xs">
                  <p className="font-semibold text-[#20251F]">Location Summary</p>
                  {property.district && (
                    <div className="flex justify-between">
                      <span className="text-[#77796F]">District</span>
                      <span className="font-medium text-[#20251F]">{property.district}</span>
                    </div>
                  )}
                  {property.panchayath && (
                    <div className="flex justify-between">
                      <span className="text-[#77796F]">Panchayath / Mun.</span>
                      <span className="font-medium text-[#20251F]">{property.panchayath}</span>
                    </div>
                  )}
                  {property.locality && (
                    <div className="flex justify-between">
                      <span className="text-[#77796F]">Locality</span>
                      <span className="font-medium text-[#20251F]">{property.locality}</span>
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-[#151D18] text-[#FFFFFF] space-y-3">
                  <p className="text-xs font-semibold text-[#E4EBE0]">
                    Teakees Advisory Inquiry
                  </p>
                  <p className="text-xs text-[#D7DBD2] leading-relaxed">
                    Schedule a site inspection or request verified title documents referencing code{' '}
                    <span className="font-mono font-semibold text-[#FFFFFF]">{property.code}</span>.
                  </p>
                  <div className="flex items-center gap-2 text-xs font-mono text-[#E4EBE0] pt-1">
                    <PhoneCall className="w-3.5 h-3.5 text-[#A8B9A2]" />
                    <span>+91 98470 11220</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-3">
                <p className="text-xs font-semibold text-[#20251F]">
                  Own a similar property to sell?
                </p>
                <p className="text-xs text-[#77796F] leading-relaxed">
                  Submit property details and media in 2 minutes. No account required.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigatePath('/submit-property')}
                  className="w-full h-9 rounded-lg border border-[#064E3B] text-[#064E3B] hover:bg-[#E4EBE0]/50 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Submit Your Property
                </button>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};
