import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  BedDouble,
  Building2,
  CheckCircle2,
  Clock,
  MapPin,
  Maximize2,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { PublicNavbar } from '../components/public/PublicNavbar';
import { apiClient, PublicPropertyDTO } from '../services/apiClient';
import { formatCurrency } from '../utils/formatters';

interface PublicLandingPageProps {
  onNavigatePath: (path: string) => void;
}

const PROPERTY_TYPES = ['All', 'Land', 'House', 'Villa', 'Apartment', 'Shop', 'Resort'];

export const PublicLandingPage: React.FC<PublicLandingPageProps> = ({
  onNavigatePath,
}) => {
  const [items, setItems] = useState<PublicPropertyDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [propertyType, setPropertyType] = useState('All');
  const [location, setLocation] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [showPriceFilters, setShowPriceFilters] = useState(false);

  const loadProperties = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.getPublicProperties({
          page: targetPage,
          limit: 9,
          search,
          propertyType,
          location,
          minPrice,
          maxPrice,
        });
        setItems(res.items);
        setTotal(res.total);
        setPage(res.page);
        setTotalPages(res.totalPages);
      } catch (err: any) {
        setError(err?.message || 'Unable to load published properties right now.');
      } finally {
        setLoading(false);
      }
    },
    [search, propertyType, location, minPrice, maxPrice]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProperties(1);
    }, 200);
    return () => clearTimeout(timer);
  }, [loadProperties]);

  return (
    <div className="min-h-screen bg-[#F1F0E8] text-[#20251F] flex flex-col">
      <PublicNavbar currentPath="/" onNavigatePath={onNavigatePath} />

      {/* Editorial Hero */}
      <section className="bg-[#151D18] text-[#FFFFFF] border-b border-[#2F3E34]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <p className="text-xs font-mono uppercase tracking-[0.16em] text-[#A8B9A2]">
              Teakees Verified Portfolio
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-semibold tracking-tight leading-[1.12]">
              Verified land, coastal homes, and estates across Kerala.
            </h1>
            <p className="text-sm sm:text-[15px] text-[#D7DBD2] max-w-2xl leading-relaxed">
              Every listing published here is reviewed by our advisory desk for title clarity, road connectivity, and seller readiness. Looking to sell a property? Submit directly in two minutes — no account required.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigatePath('/submit-property')}
                className="h-11 px-5 rounded-xl bg-[#064E3B] hover:bg-[#176B50] text-[#FFFFFF] text-sm font-medium inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Submit Your Property
              </button>
              <a
                href="#published-listings"
                className="h-11 px-5 rounded-xl border border-[#2F3E34] bg-[#FFFFFF]/5 hover:bg-[#FFFFFF]/10 text-[#FFFFFF] text-sm font-medium inline-flex items-center gap-2 transition-colors"
              >
                Browse Published Listings
                <ArrowRight className="w-4 h-4 text-[#A8B9A2]" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5">
            <div className="p-4 rounded-2xl bg-[#FFFFFF]/5 border border-[#2F3E34] flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#064E3B] text-[#E4EBE0] flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#FFFFFF]">
                  48-Hour Seller Verification
                </h2>
                <p className="text-xs text-[#A8B9A2] mt-1 leading-relaxed">
                  Property owners receive a callback within 48 hours of submitting details, photos, or walkthrough videos.
                </p>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[#FFFFFF]/5 border border-[#2F3E34] flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#064E3B] text-[#E4EBE0] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#FFFFFF]">
                  Admin-Approved Publishing Only
                </h2>
                <p className="text-xs text-[#A8B9A2] mt-1 leading-relaxed">
                  Seller contact numbers stay private in our CRM. Only approved and published listings appear on this showcase.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Published Properties Search & Grid */}
      <main id="published-listings" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[#20251F]">
              Published Properties
            </h2>
            <p className="text-xs text-[#77796F] mt-1">
              {loading
                ? 'Loading verified listings...'
                : `${total} approved & published ${total === 1 ? 'listing' : 'listings'} available`}
            </p>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            <div className="md:col-span-5 relative">
              <Search className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, locality, TAK code, features..."
                className="w-full h-10 pl-9 pr-3 text-xs bg-[#F1F0E8]/60 border border-[#E5E4DA] rounded-lg focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
              />
            </div>

            <div className="md:col-span-3">
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Filter by location / district..."
                className="w-full h-10 px-3 text-xs bg-[#F1F0E8]/60 border border-[#E5E4DA] rounded-lg focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
              />
            </div>

            <div className="md:col-span-2">
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="w-full h-10 px-3 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === 'All' ? 'All Types' : t}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <button
                type="button"
                onClick={() => setShowPriceFilters((v) => !v)}
                className={`w-full h-10 px-3 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  showPriceFilters || minPrice || maxPrice
                    ? 'border-[#064E3B] bg-[#E4EBE0]/60 text-[#064E3B]'
                    : 'border-[#E5E4DA] bg-[#FFFFFF] text-[#20251F] hover:bg-[#F1F0E8]'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Price Range
              </button>
            </div>
          </div>

          {showPriceFilters && (
            <div className="pt-3 border-t border-[#E5E4DA] grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-medium text-[#77796F] mb-1">
                  Minimum Price (INR)
                </label>
                <input
                  type="number"
                  min={0}
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="e.g. 2000000"
                  className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#77796F] mb-1">
                  Maximum Price (INR)
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="e.g. 15000000"
                  className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setLocation('');
                    setPropertyType('All');
                    setMinPrice('');
                    setMaxPrice('');
                  }}
                  className="h-9 px-3 rounded-lg border border-[#E5E4DA] text-xs font-medium text-[#77796F] hover:text-[#20251F] cursor-pointer"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-[#C96C60]/10 border border-[#C96C60]/30 text-xs text-[#9E3E33]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden animate-pulse"
              >
                <div className="aspect-[16/10] bg-[#E4EBE0]/60" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-[#E5E4DA] rounded w-3/4" />
                  <div className="h-3 bg-[#F1F0E8] rounded w-1/2" />
                  <div className="h-5 bg-[#E4EBE0] rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl py-14 px-6 text-center space-y-3">
            <div className="w-11 h-11 rounded-xl bg-[#E4EBE0] text-[#064E3B] flex items-center justify-center mx-auto">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-[#20251F]">
              No published properties match your filters
            </h3>
            <p className="text-xs text-[#77796F] max-w-md mx-auto">
              Try clearing search filters, or submit your property directly for verification and advisory placement.
            </p>
            <button
              type="button"
              onClick={() => onNavigatePath('/submit-property')}
              className="mt-2 h-9 px-4 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-[#FFFFFF] text-xs font-medium cursor-pointer"
            >
              Submit a Property
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((p) => (
              <article
                key={p.id}
                onClick={() => onNavigatePath(`/properties/${p.code || p.id}`)}
                className="group bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden hover:border-[#064E3B]/50 hover:shadow-md transition-all cursor-pointer flex flex-col"
              >
                <div className="relative aspect-[16/10] bg-[#E4EBE0] overflow-hidden">
                  {p.coverImageUrl ? (
                    <img
                      src={p.coverImageUrl}
                      alt={p.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#064E3B]/50">
                      <Building2 className="w-10 h-10" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-md bg-[#151D18]/85 text-[#FFFFFF] text-[11px] font-mono">
                      {p.code}
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-[#FFFFFF]/95 text-[#064E3B] text-[11px] font-medium border border-[#E5E4DA]">
                      {p.type}
                    </span>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-[#20251F] group-hover:text-[#064E3B] transition-colors line-clamp-2">
                        {p.title}
                      </h3>
                    </div>
                    <p className="text-xs text-[#77796F] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#064E3B] shrink-0" />
                      <span className="truncate">{p.location}</span>
                    </p>
                    <p className="text-xs text-[#20251F]/80 line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[#E5E4DA] flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-[#77796F]">Guide Price</p>
                      <p className="text-base font-semibold font-mono tabular-nums text-[#064E3B]">
                        {p.expectedPrice
                          ? formatCurrency(p.expectedPrice, '₹')
                          : 'Price on Request'}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-[#77796F] space-y-0.5">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Maximize2 className="w-3 h-3" />
                        {p.areaDisplay}
                      </span>
                      {p.bedrooms ? (
                        <span className="flex items-center gap-1 justify-end">
                          <BedDouble className="w-3 h-3" />
                          {p.bedrooms} Beds
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => void loadProperties(page - 1)}
              className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] text-xs font-medium disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <span className="px-3 text-xs font-mono text-[#77796F]">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => void loadProperties(page + 1)}
              className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] text-xs font-medium disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}

        {/* Seller CTA Band */}
        <section className="mt-10 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#064E3B]">
              <CheckCircle2 className="w-4 h-4" />
              Direct Seller Intake
            </span>
            <h2 className="text-xl font-semibold text-[#20251F]">
              Planning to sell land, a residence, or commercial property?
            </h2>
            <p className="text-xs sm:text-sm text-[#77796F] leading-relaxed">
              Share basic property details and photos or video right from your phone. Our advisory team reviews every submission and contacts you within 48 hours.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigatePath('/submit-property')}
            className="h-11 px-6 rounded-xl bg-[#064E3B] hover:bg-[#176B50] text-[#FFFFFF] text-sm font-medium inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            Submit Property Details
            <ArrowRight className="w-4 h-4" />
          </button>
        </section>
      </main>

      <footer className="border-t border-[#E5E4DA] bg-[#FFFFFF] py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#77796F]">
          <p>© {new Date().getFullYear()} Teakees Real Estate Advisory</p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onNavigatePath('/submit-property')}
              className="hover:text-[#064E3B] cursor-pointer"
            >
              Seller Submission
            </button>
            <button
              type="button"
              onClick={() => onNavigatePath('/crm')}
              className="hover:text-[#064E3B] cursor-pointer"
            >
              Team Workspace
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
