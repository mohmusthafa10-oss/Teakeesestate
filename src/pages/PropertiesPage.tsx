import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Eye,
  LayoutGrid,
  Map as MapIcon,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Table as TableIcon,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService } from '../services/crmService';
import { Property, PropertyStatus, PropertyType } from '../types/crm';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  Pagination,
  PropertyThumbnail,
  StatusTag,
} from '../components/common/UIPrimitives';

export const PropertiesPage: React.FC = () => {
  const { db, route, navigate, updateDb, visibleProperties } = useCRM();
  const currency = db.settings.currencySymbol;

  const [viewMode, setViewMode] = useState<'table' | 'card' | 'map'>('table');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [locationFilter, setLocationFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>(route.filterStatus || 'All');
  const [agentFilter, setAgentFilter] = useState<string>('All');
  const [priceRange, setPriceRange] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'addedDate' | 'askingPrice' | 'title'>('addedDate');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [deletingProperty, setDeletingProperty] = useState<Property | null>(null);
  const [selectedMapProp, setSelectedMapProp] = useState<Property | null>(null);

  useEffect(() => {
    if (route.filterStatus) {
      setStatusFilter(route.filterStatus);
      setPage(1);
    }
  }, [route.filterStatus]);

  const uniqueLocations = useMemo(() => {
    const locs = Array.from(
      new Set(visibleProperties.map((p) => p.location.split(',')[0].trim()))
    );
    return locs.sort();
  }, [visibleProperties]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleProperties
      .filter((p) => {
        if (q) {
          const seller = db.sellers.find((s) => s.id === p.sellerId)?.name || '';
          const match =
            p.title.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q) ||
            p.location.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            seller.toLowerCase().includes(q);
          if (!match) return false;
        }
        if (typeFilter !== 'All' && p.type !== typeFilter) return false;
        if (
          locationFilter !== 'All' &&
          !p.location.toLowerCase().includes(locationFilter.toLowerCase())
        )
          return false;
        if (statusFilter !== 'All' && p.status !== statusFilter) return false;
        if (agentFilter !== 'All' && p.assignedAgentId !== agentFilter) return false;

        if (priceRange === 'under-30l' && p.askingPrice >= 3000000) return false;
        if (
          priceRange === '30l-1cr' &&
          (p.askingPrice < 3000000 || p.askingPrice > 10000000)
        )
          return false;
        if (priceRange === 'over-1cr' && p.askingPrice <= 10000000) return false;

        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'askingPrice') cmp = a.askingPrice - b.askingPrice;
        else if (sortBy === 'title') cmp = a.title.localeCompare(b.title);
        else cmp = a.addedDate.localeCompare(b.addedDate);
        return sortAsc ? cmp : -cmp;
      });
  }, [
    visibleProperties,
    db.sellers,
    search,
    typeFilter,
    locationFilter,
    statusFilter,
    agentFilter,
    priceRange,
    sortBy,
    sortAsc,
  ]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page]
  );

  const getPrimaryImage = (propertyId: string) =>
    db.propertyImages.find((i) => i.propertyId === propertyId && i.isPrimary)?.url ||
    db.propertyImages.find((i) => i.propertyId === propertyId)?.url;

  const getSellerName = (sellerId: string) =>
    db.sellers.find((s) => s.id === sellerId)?.name || 'Unknown';

  const getAgentName = (userId: string) =>
    db.users.find((u) => u.id === userId)?.name || 'Unassigned';

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortAsc(!sortAsc);
    else {
      setSortBy(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            Properties Inventory
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Centralized property database connected to sellers, buyer matches, deals, and managed stays.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              navigate({
                page: 'register-property',
                preselectedSellerId: db.sellers[0]?.id,
              })
            }
            className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/50 text-xs font-medium text-[#20251F] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#064E3B]" />
            Add Property to Existing Seller
          </button>
          <button
            type="button"
            onClick={() => navigate({ page: 'register-property' })}
            className="h-9 px-3.5 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Seller + Property
          </button>
        </div>
      </div>

      {/* Filters & View Switcher */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search title, ID, location, seller, or keywords..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-[#F1F0E8]/60 border border-[#E5E4DA] rounded-lg focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
            >
              <option value="All">All Types</option>
              {db.settings.propertyCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={locationFilter}
              onChange={(e) => {
                setLocationFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
            >
              <option value="All">All Locations</option>
              {uniqueLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>

            <select
              value={priceRange}
              onChange={(e) => {
                setPriceRange(e.target.value);
                setPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
            >
              <option value="All">Any Price</option>
              <option value="under-30l">Under ₹30 Lakh</option>
              <option value="30l-1cr">₹30 Lakh – ₹1 Cr</option>
              <option value="over-1cr">Above ₹1 Cr</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
            >
              <option value="All">All Statuses</option>
              <option value="Available">Available</option>
              <option value="Under Negotiation">Under Negotiation</option>
              <option value="Reserved">Reserved</option>
              <option value="Sold">Sold</option>
              <option value="Rented">Rented</option>
              <option value="Inactive">Inactive</option>
            </select>

            <select
              value={agentFilter}
              onChange={(e) => {
                setAgentFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
            >
              <option value="All">All Agents</option>
              {db.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            <div className="inline-flex p-0.5 bg-[#F1F0E8] border border-[#E5E4DA] rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`h-8 px-2.5 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-[#FFFFFF] text-[#064E3B] shadow-xs'
                    : 'text-[#77796F]'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`h-8 px-2.5 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer ${
                  viewMode === 'card'
                    ? 'bg-[#FFFFFF] text-[#064E3B] shadow-xs'
                    : 'text-[#77796F]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`h-8 px-2.5 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer ${
                  viewMode === 'map'
                    ? 'bg-[#FFFFFF] text-[#064E3B] shadow-xs'
                    : 'text-[#77796F]'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                Map
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No matching properties"
          description="Try clearing a filter or register a new seller and property listing."
          actionLabel="Add Seller + Property"
          onAction={() => navigate({ page: 'register-property' })}
        />
      ) : viewMode === 'table' ? (
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() => handleSort('title')}
                      className="inline-flex items-center gap-1 hover:text-[#20251F] cursor-pointer"
                    >
                      Property Title
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Location</th>
                  <th className="py-3 px-3">Area</th>
                  <th className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() => handleSort('askingPrice')}
                      className="inline-flex items-center gap-1 hover:text-[#20251F] cursor-pointer"
                    >
                      Asking Price
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-3">Seller</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Agent</th>
                  <th className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() => handleSort('addedDate')}
                      className="inline-flex items-center gap-1 hover:text-[#20251F] cursor-pointer"
                    >
                      Added
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DA] text-xs">
                {paged.map((prop) => (
                  <tr
                    key={prop.id}
                    className="hover:bg-[#F1F0E8]/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono tabular-nums text-[11px] text-[#77796F] whitespace-nowrap">
                      {prop.code}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <PropertyThumbnail
                          src={getPrimaryImage(prop.id)}
                          alt={prop.title}
                          className="w-11 h-9 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            navigate({ page: 'property-detail', id: prop.id })
                          }
                          className="font-semibold text-[#20251F] hover:text-[#064E3B] text-left cursor-pointer max-w-[200px] truncate"
                        >
                          {prop.title}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[#20251F] whitespace-nowrap">
                      {prop.type}
                    </td>
                    <td className="py-3 px-3 text-[#77796F] whitespace-nowrap">
                      {prop.location}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-[#20251F] whitespace-nowrap">
                      {prop.areaDisplay}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums font-semibold text-[#064E3B] whitespace-nowrap">
                      {formatCurrency(prop.askingPrice, currency)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          navigate({ page: 'seller-detail', id: prop.sellerId })
                        }
                        className="text-[#064E3B] hover:underline font-medium cursor-pointer"
                      >
                        {getSellerName(prop.sellerId)}
                      </button>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={prop.status}
                        onChange={(e) =>
                          updateDb(
                            (prev) =>
                              crmService.updateProperty(prev, prop.id, {
                                status: e.target.value as PropertyStatus,
                              }),
                            `Status changed to ${e.target.value}`
                          )
                        }
                        aria-label={`Change status for ${prop.title}`}
                        className="h-7 px-2 text-[11px] font-medium bg-[#F1F0E8]/70 border border-[#E5E4DA] rounded-md cursor-pointer"
                      >
                        <option value="Available">Available</option>
                        <option value="Under Negotiation">Under Negotiation</option>
                        <option value="Reserved">Reserved</option>
                        <option value="Sold">Sold</option>
                        <option value="Rented">Rented</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </td>
                    <td className="py-3 px-3 text-[#77796F] whitespace-nowrap">
                      {getAgentName(prop.assignedAgentId)}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-[11px] text-[#77796F] whitespace-nowrap">
                      {formatDate(prop.addedDate)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            navigate({ page: 'property-detail', id: prop.id })
                          }
                          title="View Property & Find Matching Leads"
                          className="p-1.5 rounded-md hover:bg-[#E4EBE0] text-[#064E3B] cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingProperty(prop)}
                          title="Edit Property"
                          className="p-1.5 rounded-md hover:bg-[#F1F0E8] text-[#20251F] cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingProperty(prop)}
                          title="Delete Property"
                          className="p-1.5 rounded-md hover:bg-[#C96C60]/15 text-[#C96C60] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            totalItems={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      ) : viewMode === 'card' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paged.map((prop) => (
              <div
                key={prop.id}
                className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden flex flex-col justify-between hover:border-[#064E3B]/50 transition-colors"
              >
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ page: 'property-detail', id: prop.id })
                    }
                    className="w-full h-48 overflow-hidden block bg-[#E4EBE0] cursor-pointer"
                  >
                    <img
                      src={getPrimaryImage(prop.id)}
                      alt={prop.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-300"
                    />
                  </button>
                  <div className="p-5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#77796F]">
                      <span>
                        {prop.code} · {prop.type}
                      </span>
                      <StatusTag status={prop.status} />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ page: 'property-detail', id: prop.id })
                      }
                      className="text-base font-semibold text-[#20251F] hover:text-[#064E3B] text-left block cursor-pointer"
                    >
                      {prop.title}
                    </button>
                    <p className="text-xs text-[#77796F]">
                      {prop.location} · {prop.areaDisplay}
                    </p>
                    <p className="text-xs text-[#77796F] line-clamp-2 leading-relaxed">
                      {prop.description}
                    </p>
                  </div>
                </div>
                <div className="px-5 py-3.5 border-t border-[#E5E4DA] flex items-center justify-between">
                  <div>
                    <p className="text-sm font-mono tabular-nums font-semibold text-[#064E3B]">
                      {formatCurrency(prop.askingPrice, currency)}
                    </p>
                    <p className="text-[11px] text-[#77796F]">
                      Seller: {getSellerName(prop.sellerId)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ page: 'property-detail', id: prop.id })
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#E4EBE0] hover:bg-[#064E3B] text-[#064E3B] hover:text-[#FFFFFF] text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Match & Open
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Pagination
            totalItems={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      ) : (
        /* Interactive Geo-Coordinate Portfolio Map View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 bg-[#151D18] rounded-2xl border border-[#243028] p-5 relative overflow-hidden min-h-[440px]">
            <div className="flex items-center justify-between text-xs text-[#A8B9A2] mb-4">
              <span>Regional Property Distribution Map ({filtered.length} properties)</span>
              <span className="font-mono text-[11px]">Click pin to inspect listing</span>
            </div>
            {/* Stylized topographic coordinate grid */}
            <div className="relative h-[360px] rounded-xl bg-[#1A241E] border border-[#29382F] overflow-hidden">
              <svg
                className="absolute inset-0 w-full h-full opacity-20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <pattern
                    id="mapGrid"
                    width="48"
                    height="48"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 48 0 L 0 0 0 48"
                      fill="none"
                      stroke="#A8B9A2"
                      strokeWidth="0.6"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#mapGrid)" />
              </svg>

              {filtered.map((prop) => {
                // Normalize lat/lng into container percentage cleanly
                const latNorm = Math.min(
                  88,
                  Math.max(12, ((12.5 - prop.coordinates.lat) / 0.45) * 100)
                );
                const lngNorm = Math.min(
                  88,
                  Math.max(12, ((prop.coordinates.lng - 75.0) / 0.4) * 100)
                );
                const selected = selectedMapProp?.id === prop.id;
                return (
                  <button
                    key={prop.id}
                    type="button"
                    onClick={() => setSelectedMapProp(prop)}
                    style={{ top: `${latNorm}%`, left: `${lngNorm}%` }}
                    className={`-translate-x-1/2 -translate-y-1/2 absolute px-2.5 py-1 rounded-lg text-[11px] font-mono tabular-nums font-semibold border transition-transform cursor-pointer ${
                      selected
                        ? 'bg-[#FFFFFF] text-[#064E3B] border-[#064E3B] scale-110 z-20 shadow-lg'
                        : prop.status === 'Available'
                        ? 'bg-[#064E3B] text-[#FFFFFF] border-[#A8B9A2]/60 hover:scale-105 z-10'
                        : 'bg-[#2B3730] text-[#E4EBE0] border-[#4A5C51] hover:scale-105 z-10'
                    }`}
                  >
                    {formatCurrency(prop.askingPrice, currency)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-4 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 flex flex-col justify-between">
            {selectedMapProp || filtered[0] ? (
              (() => {
                const active = selectedMapProp || filtered[0];
                return (
                  <div className="space-y-4">
                    <img
                      src={getPrimaryImage(active.id)}
                      alt={active.title}
                      className="w-full h-44 object-cover rounded-xl bg-[#E4EBE0]"
                    />
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono text-[#77796F]">
                          {active.code}
                        </span>
                        <StatusTag status={active.status} />
                      </div>
                      <h3 className="text-base font-semibold text-[#20251F]">
                        {active.title}
                      </h3>
                      <p className="text-xs text-[#77796F]">
                        {active.location} · {active.areaDisplay}
                      </p>
                      <p className="text-lg font-mono tabular-nums font-semibold text-[#064E3B]">
                        {formatCurrency(active.askingPrice, currency)}
                      </p>
                      <p className="text-xs text-[#77796F] line-clamp-4 leading-relaxed pt-1">
                        {active.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ page: 'property-detail', id: active.id })
                      }
                      className="w-full h-10 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] transition-colors cursor-pointer"
                    >
                      Open Property Profile
                    </button>
                  </div>
                );
              })()
            ) : null}
          </div>
        </div>
      )}

      {/* Edit Property Modal */}
      {editingProperty && (
        <Modal
          open={Boolean(editingProperty)}
          onClose={() => setEditingProperty(null)}
          title={`Edit ${editingProperty.title}`}
          subtitle={editingProperty.code}
        >
          <EditPropertyForm
            property={editingProperty}
            onClose={() => setEditingProperty(null)}
          />
        </Modal>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={Boolean(deletingProperty)}
        title="Delete Property Record"
        message={`Are you sure you want to remove "${deletingProperty?.title}"? Linked follow-ups and matches for this property will also be removed.`}
        confirmLabel="Delete Property"
        onCancel={() => setDeletingProperty(null)}
        onConfirm={() => {
          if (!deletingProperty) return;
          updateDb(
            (prev) => crmService.deleteProperty(prev, deletingProperty.id),
            'Property record removed'
          );
          setDeletingProperty(null);
        }}
      />
    </div>
  );
};

const EditPropertyForm: React.FC<{ property: Property; onClose: () => void }> = ({
  property,
  onClose,
}) => {
  const { db, updateDb } = useCRM();
  const [title, setTitle] = useState(property.title);
  const [type, setType] = useState<PropertyType>(property.type);
  const [location, setLocation] = useState(property.location);
  const [areaValue, setAreaValue] = useState(String(property.areaValue));
  const [askingPrice, setAskingPrice] = useState(String(property.askingPrice));
  const [status, setStatus] = useState<PropertyStatus>(property.status);
  const [assignedAgentId, setAssignedAgentId] = useState(property.assignedAgentId);
  const [description, setDescription] = useState(property.description);
  const [internalNotes, setInternalNotes] = useState(property.internalNotes);
  const [isManaged, setIsManaged] = useState(property.isManaged);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = updateDb(
      (prev) =>
        crmService.updateProperty(prev, property.id, {
          title,
          type,
          location,
          areaValue: Number(areaValue) || property.areaValue,
          askingPrice: Number(askingPrice) || property.askingPrice,
          status,
          assignedAgentId,
          description,
          internalNotes,
          isManaged,
        }),
      'Property details updated'
    );
    if (ok) onClose();
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-[#20251F] mb-1">Title</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PropertyType)}
            className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
          >
            {db.settings.propertyCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">Location</label>
          <input
            type="text"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">
            Area ({property.areaUnit})
          </label>
          <input
            type="number"
            step="any"
            value={areaValue}
            onChange={(e) => setAreaValue(e.target.value)}
            className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">
            Asking Price ({db.settings.currencySymbol})
          </label>
          <input
            type="number"
            value={askingPrice}
            onChange={(e) => setAskingPrice(e.target.value)}
            className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PropertyStatus)}
            className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
          >
            <option value="Available">Available</option>
            <option value="Under Negotiation">Under Negotiation</option>
            <option value="Reserved">Reserved</option>
            <option value="Sold">Sold</option>
            <option value="Rented">Rented</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">
            Assigned Agent
          </label>
          <select
            value={assignedAgentId}
            onChange={(e) => setAssignedAgentId(e.target.value)}
            className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
          >
            {db.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 flex items-center gap-2">
          <input
            id="edit-managed"
            type="checkbox"
            checked={isManaged}
            onChange={(e) => setIsManaged(e.target.checked)}
            className="w-4 h-4 accent-[#064E3B]"
          />
          <label htmlFor="edit-managed" className="text-xs text-[#20251F]">
            Agency Managed / Operating Property
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-[#20251F] mb-1">
            Full Property Description
          </label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-[#20251F] mb-1">
            Internal Notes
          </label>
          <textarea
            rows={2}
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E4DA]">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-medium rounded-lg border border-[#E5E4DA] cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
        >
          Save Changes
        </button>
      </div>
    </form>
  );
};
