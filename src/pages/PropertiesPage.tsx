import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Clock,
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
import { apiClient } from '../services/apiClient';
import { Property, PropertyCategory, PropertyStatus, PropertyType } from '../types/crm';
import {
  calculateDaysSince,
  formatCurrency,
  formatDate,
  formatDaysListed,
} from '../utils/formatters';
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  Pagination,
  PropertyThumbnail,
  StatusTag,
} from '../components/common/UIPrimitives';
import { PropertyPortfolioMap } from '../components/map/PropertyPortfolioMap';
import { LocationPickerMap } from '../components/map/LocationPickerMap';
import { getPropertyCoords, hasValidCoordinates } from '../utils/geo';

export const PropertiesPage: React.FC = () => {
  const { db, route, navigate, updateDb, visibleProperties, notify, refreshDb } = useCRM();
  const currency = db.settings.currencySymbol;

  const [viewMode, setViewMode] = useState<'table' | 'card' | 'map'>('table');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [districtFilter, setDistrictFilter] = useState<string>('All');
  const [panchayathFilter, setPanchayathFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>(route.filterStatus || 'All');
  const [agingFilter, setAgingFilter] = useState<string>(route.filterAging || 'All');
  const [agentFilter, setAgentFilter] = useState<string>('All');
  const [priceRange, setPriceRange] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'listedDate' | 'expectedPrice' | 'title'>('listedDate');
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

  useEffect(() => {
    if (route.filterAging) {
      setAgingFilter(route.filterAging);
      setPage(1);
    }
  }, [route.filterAging]);

  const uniqueDistricts = useMemo(() => {
    const districts = Array.from(
      new Set(visibleProperties.map((p) => p.district).filter(Boolean))
    );
    return districts.sort();
  }, [visibleProperties]);

  const uniquePanchayaths = useMemo(() => {
    const base =
      districtFilter === 'All'
        ? visibleProperties
        : visibleProperties.filter((p) => p.district === districtFilter);
    return Array.from(new Set(base.map((p) => p.panchayath).filter(Boolean))).sort();
  }, [visibleProperties, districtFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleProperties
      .filter((p) => {
        const expected = p.expectedPrice ?? p.askingPrice;
        const listed = p.listedDate || p.addedDate;
        const daysListed = calculateDaysSince(listed);
        const seller = db.sellers.find((s) => s.id === p.sellerId);

        if (q) {
          const match =
            p.title.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q) ||
            p.location.toLowerCase().includes(q) ||
            p.district.toLowerCase().includes(q) ||
            p.panchayath.toLowerCase().includes(q) ||
            p.locality.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            (seller?.name || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        if (typeFilter !== 'All' && p.type !== typeFilter) return false;
        if (categoryFilter !== 'All' && p.category !== categoryFilter) return false;
        if (districtFilter !== 'All' && p.district !== districtFilter) return false;
        if (panchayathFilter !== 'All' && p.panchayath !== panchayathFilter) return false;
        if (statusFilter !== 'All' && p.status !== statusFilter) return false;
        if (agentFilter !== 'All' && p.assignedAgentId !== agentFilter) return false;

        if (agingFilter === 'gt30' && daysListed <= 30) return false;
        if (agingFilter === 'gt60' && daysListed <= 60) return false;
        if (agingFilter === 'gt90' && daysListed <= 90) return false;
        if (agingFilter === 'no-recent-contact') {
          const contactDays = seller?.lastContactedDate || seller?.lastContactAt
            ? calculateDaysSince(seller.lastContactedDate || seller.lastContactAt)
            : 999;
          if (contactDays <= 14 || p.status === 'Sold' || p.status === 'Inactive') return false;
        }

        if (priceRange === 'under-30l' && expected >= 3000000) return false;
        if (priceRange === '30l-1cr' && (expected < 3000000 || expected > 10000000))
          return false;
        if (priceRange === 'over-1cr' && expected <= 10000000) return false;

        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'expectedPrice') {
          cmp = (a.expectedPrice ?? a.askingPrice) - (b.expectedPrice ?? b.askingPrice);
        } else if (sortBy === 'title') {
          cmp = a.title.localeCompare(b.title);
        } else {
          cmp = (a.listedDate || a.addedDate).localeCompare(b.listedDate || b.addedDate);
        }
        return sortAsc ? cmp : -cmp;
      });
  }, [
    visibleProperties,
    db.sellers,
    search,
    typeFilter,
    categoryFilter,
    districtFilter,
    panchayathFilter,
    statusFilter,
    agingFilter,
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
            Centralized property database with permanent TAK IDs, listing duration tracking, structured locations, and pricing history.
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
              placeholder="Search TAK ID, title, locality, panchayath, district, or seller..."
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
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
            >
              <option value="All">All Categories</option>
              {db.settings.propertyCategoryGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <select
              value={districtFilter}
              onChange={(e) => {
                setDistrictFilter(e.target.value);
                setPanchayathFilter('All');
                setPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
            >
              <option value="All">All Districts</option>
              {uniqueDistricts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              value={panchayathFilter}
              onChange={(e) => {
                setPanchayathFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
            >
              <option value="All">All Panchayaths</option>
              {uniquePanchayaths.map((pa) => (
                <option key={pa} value={pa}>
                  {pa}
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
              value={agingFilter}
              onChange={(e) => {
                setAgingFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
            >
              <option value="All">All Listing Ages</option>
              <option value="gt30">Listed &gt; 30 Days</option>
              <option value="gt60">Listed &gt; 60 Days</option>
              <option value="gt90">Listed &gt; 90 Days</option>
              <option value="no-recent-contact">No Recent Contact (&gt; 14d)</option>
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
                  <th className="py-3 px-3">Type &amp; Category</th>
                  <th className="py-3 px-3">Location</th>
                  <th className="py-3 px-3">Area</th>
                  <th className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() => handleSort('expectedPrice')}
                      className="inline-flex items-center gap-1 hover:text-[#20251F] cursor-pointer"
                    >
                      Expected / Market
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-3">Seller</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() => handleSort('listedDate')}
                      className="inline-flex items-center gap-1 hover:text-[#20251F] cursor-pointer"
                    >
                      Listed Duration
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DA] text-xs">
                {paged.map((prop) => {
                  const expected = prop.expectedPrice ?? prop.askingPrice;
                  const listed = prop.listedDate || prop.addedDate;
                  const daysListed = calculateDaysSince(listed);
                  return (
                    <tr
                      key={prop.id}
                      className="hover:bg-[#F1F0E8]/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono tabular-nums text-[11px] font-semibold text-[#064E3B] whitespace-nowrap">
                        {prop.code}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <PropertyThumbnail
                            src={getPrimaryImage(prop.id)}
                            alt={prop.title}
                            className="w-11 h-9 rounded-lg"
                          />
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                navigate({ page: 'property-detail', id: prop.id })
                              }
                              className="font-semibold text-[#20251F] hover:text-[#064E3B] text-left cursor-pointer max-w-[190px] truncate block"
                            >
                              {prop.title}
                            </button>
                            <span className="text-[11px] text-[#77796F]">
                              {getAgentName(prop.assignedAgentId)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <p className="font-medium text-[#20251F]">{prop.type}</p>
                        <p className="text-[11px] text-[#77796F]">{prop.category}</p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <p className="text-[#20251F]">
                          {prop.locality || prop.location}
                        </p>
                        <p className="text-[11px] text-[#77796F]">
                          {prop.panchayath ? `${prop.panchayath}, ` : ''}
                          {prop.district}
                        </p>
                        {!hasValidCoordinates(prop) && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-[#D9AC57]/20 text-[#7A5612] text-[10px] font-medium">
                            Location Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-[#20251F] whitespace-nowrap">
                        {prop.areaDisplay}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                        <p className="font-semibold text-[#064E3B]">
                          {formatCurrency(expected, currency)}
                        </p>
                        {prop.marketPrice ? (
                          <p className="text-[11px] text-[#77796F]">
                            Mkt: {formatCurrency(prop.marketPrice, currency)}
                          </p>
                        ) : null}
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
                          onChange={async (e) => {
                            const newStatus = e.target.value as PropertyStatus;
                            try {
                              await apiClient.updateProperty(prop.id, { status: newStatus });
                              updateDb(
                                (prev) =>
                                  crmService.updateProperty(prev, prop.id, {
                                    status: newStatus,
                                  }),
                                `Status changed to ${newStatus}`
                              );
                              await refreshDb();
                            } catch (err: any) {
                              notify(err.message || 'Failed to update property status', 'error');
                            }
                          }}
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
                      <td className="py-3 px-3 whitespace-nowrap">
                        <p
                          className={`text-[11px] font-medium ${
                            daysListed > 90
                              ? 'text-[#C96C60]'
                              : daysListed > 30
                              ? 'text-[#7A5612]'
                              : 'text-[#20251F]'
                          }`}
                        >
                          {formatDaysListed(listed)}
                        </p>
                        <p className="text-[10px] font-mono text-[#77796F]">
                          {formatDate(listed)}
                        </p>
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
                  );
                })}
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
            {paged.map((prop) => {
              const expected = prop.expectedPrice ?? prop.askingPrice;
              const listed = prop.listedDate || prop.addedDate;
              return (
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
                        <span className="font-mono font-semibold text-[#064E3B]">
                          {prop.code} · {prop.type} · {prop.category}
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
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#77796F]">
                        <span>
                          {prop.locality}, {prop.district} · {prop.areaDisplay}
                        </span>
                        {!hasValidCoordinates(prop) && (
                          <span className="px-1.5 py-0.5 rounded bg-[#D9AC57]/20 text-[#7A5612] text-[10px] font-medium">
                            Location Pending
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#77796F] flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#064E3B]" />
                        {formatDaysListed(listed)} ({formatDate(listed)})
                      </p>
                      <p className="text-xs text-[#77796F] line-clamp-2 leading-relaxed">
                        {prop.description}
                      </p>
                    </div>
                  </div>
                  <div className="px-5 py-3.5 border-t border-[#E5E4DA] flex items-center justify-between">
                    <div>
                      <p className="text-sm font-mono tabular-nums font-semibold text-[#064E3B]">
                        {formatCurrency(expected, currency)}
                      </p>
                      <p className="text-[11px] text-[#77796F]">
                        {prop.marketPrice
                          ? `Market: ${formatCurrency(prop.marketPrice, currency)} · `
                          : ''}
                        {getSellerName(prop.sellerId)}
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
              );
            })}
          </div>
          <Pagination
            totalItems={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      ) : (
        /* Interactive Leaflet + OpenStreetMap Property Portfolio Map */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-8">
            <PropertyPortfolioMap
              properties={filtered}
              images={db.propertyImages}
              currencySymbol={currency}
              selectedPropertyId={selectedMapProp?.id}
              onSelectProperty={(p) => setSelectedMapProp(p)}
              onOpenProfile={(p) => navigate({ page: 'property-detail', id: p.id })}
              onEditLocation={(p) => setEditingProperty(p)}
            />
          </div>

          <div className="lg:col-span-4 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 flex flex-col justify-between">
            {selectedMapProp || filtered[0] ? (
              (() => {
                const active =
                  filtered.find((p) => p.id === selectedMapProp?.id) || filtered[0];
                const coords = getPropertyCoords(active);
                return (
                  <div className="space-y-4">
                    <img
                      src={getPrimaryImage(active.id)}
                      alt={active.title}
                      className="w-full h-44 object-cover rounded-xl bg-[#E4EBE0]"
                    />
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-[#064E3B] font-semibold">
                          {active.code} · {active.type} · {active.category}
                        </span>
                        <StatusTag status={active.status} />
                      </div>
                      <h3 className="text-base font-semibold text-[#20251F]">
                        {active.title}
                      </h3>
                      <p className="text-xs text-[#77796F]">
                        {active.locality}, {active.panchayath}, {active.district} · {active.areaDisplay}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <p className="text-lg font-mono tabular-nums font-semibold text-[#064E3B]">
                          {formatCurrency(active.expectedPrice ?? active.askingPrice, currency)}
                        </p>
                        {coords ? (
                          <span className="text-[10px] font-mono text-[#77796F]">
                            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-[#D9AC57]/20 text-[#7A5612] text-[10px] font-medium">
                            Location Pending
                          </span>
                        )}
                      </div>
                      {active.isDemoData && (
                        <p className="text-[11px] text-[#7A5612] bg-[#F1F0E8] px-2.5 py-1 rounded-md">
                          Demonstration property coordinates
                        </p>
                      )}
                      <p className="text-xs text-[#77796F] line-clamp-4 leading-relaxed pt-1">
                        {active.description}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() =>
                          navigate({ page: 'property-detail', id: active.id })
                        }
                        className="w-full h-10 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] transition-colors cursor-pointer"
                      >
                        Open Property Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProperty(active)}
                        className="w-full h-9 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/50 text-xs font-medium text-[#20251F] transition-colors cursor-pointer"
                      >
                        {coords ? 'Adjust Map Pin / Details' : 'Set Map Coordinates'}
                      </button>
                    </div>
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
          subtitle={`${editingProperty.code} · ${formatDaysListed(editingProperty.listedDate || editingProperty.addedDate)} (Listed date locked)`}
          maxWidthClass="max-w-2xl"
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
        onConfirm={async () => {
          if (!deletingProperty) return;
          try {
            await apiClient.deleteProperty(deletingProperty.id);
            updateDb(
              (prev) => crmService.deleteProperty(prev, deletingProperty.id),
              'Property record removed'
            );
            await refreshDb();
          } catch (err: any) {
            notify(err.message || 'Failed to delete property', 'error');
          } finally {
            setDeletingProperty(null);
          }
        }}
      />
    </div>
  );
};

export const EditPropertyForm: React.FC<{ property: Property; onClose: () => void }> = ({
  property,
  onClose,
}) => {
  const { db, updateDb, notify, refreshDb } = useCRM();
  const [title, setTitle] = useState(property.title);
  const [type, setType] = useState<PropertyType>(property.type);
  const [category, setCategory] = useState<PropertyCategory>(property.category);
  const [district, setDistrict] = useState(property.district);
  const [panchayath, setPanchayath] = useState(property.panchayath);
  const [locality, setLocality] = useState(property.locality);
  const [fullAddress, setFullAddress] = useState(property.fullAddress || '');
  const [googleMapsUrl, setGoogleMapsUrl] = useState(property.googleMapsUrl || '');
  const [areaValue, setAreaValue] = useState(String(property.areaValue));
  const [roadConnectivity, setRoadConnectivity] = useState(property.roadConnectivity);
  const [expectedPrice, setExpectedPrice] = useState(
    String(property.expectedPrice ?? property.askingPrice)
  );
  const [marketPrice, setMarketPrice] = useState(
    property.marketPrice ? String(property.marketPrice) : ''
  );
  const [priceNote, setPriceNote] = useState('');
  const [status, setStatus] = useState<PropertyStatus>(property.status);
  const [assignedAgentId, setAssignedAgentId] = useState(property.assignedAgentId);
  const [description, setDescription] = useState(property.description);
  const [internalNotes, setInternalNotes] = useState(property.internalNotes);
  const [isManaged, setIsManaged] = useState(property.isManaged);

  // Geo coordinates
  const initialCoords = getPropertyCoords(property);
  const [latitude, setLatitude] = useState<number | null>(initialCoords?.lat ?? null);
  const [longitude, setLongitude] = useState<number | null>(initialCoords?.lng ?? null);
  const [locationAccuracy, setLocationAccuracy] = useState<string | undefined>(
    property.location_accuracy
  );

  // Optional site details
  const [distanceToHighway, setDistanceToHighway] = useState(property.distanceToHighway || '');
  const [nearbyLandmarks, setNearbyLandmarks] = useState(property.nearbyLandmarks || '');
  const [waterAvailability, setWaterAvailability] = useState(property.waterAvailability || '');
  const [terrain, setTerrain] = useState(property.terrain || '');
  const [frontage, setFrontage] = useState(property.frontage || '');
  const [electricity, setElectricity] = useState(property.electricity || '');
  const [boundaryDetails, setBoundaryDetails] = useState(property.boundaryDetails || '');
  const [otherFeatures, setOtherFeatures] = useState(property.otherFeatures || '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.updateProperty(property.id, {
        title,
        type,
        category,
        district,
        panchayath,
        locality,
        full_address: fullAddress,
        google_maps_url: googleMapsUrl,
        latitude,
        longitude,
        location_accuracy: locationAccuracy,
        area_value: Number(areaValue) || property.areaValue,
        road_connectivity: roadConnectivity,
        expected_price: Number(expectedPrice) || property.expectedPrice || property.askingPrice,
        market_price: marketPrice ? Number(marketPrice) : undefined,
        price_note: priceNote.trim() || undefined,
        status,
        assigned_agent_id: assignedAgentId,
        description,
        internal_notes: internalNotes,
        is_managed: isManaged,
        distance_to_highway: distanceToHighway,
        nearby_landmarks: nearbyLandmarks,
        water_availability: waterAvailability,
        terrain,
        frontage,
        electricity,
        boundary_details: boundaryDetails,
        other_features: otherFeatures,
      });
      updateDb(
        (prev) =>
          crmService.updateProperty(prev, property.id, {
            title,
            type,
            category,
            district,
            panchayath,
            locality,
            fullAddress,
            googleMapsUrl,
            latitude,
            longitude,
            location_accuracy: locationAccuracy,
            areaValue: Number(areaValue) || property.areaValue,
            roadConnectivity,
            expectedPrice: Number(expectedPrice) || property.expectedPrice || property.askingPrice,
            marketPrice: marketPrice ? Number(marketPrice) : undefined,
            priceNote: priceNote.trim() || undefined,
            status,
            assignedAgentId,
            description,
            internalNotes,
            isManaged,
            distanceToHighway,
            nearbyLandmarks,
            waterAvailability,
            terrain,
            frontage,
            electricity,
            boundaryDetails,
            otherFeatures,
          }),
        'Property details updated'
      );
      await refreshDb();
      onClose();
    } catch (err: any) {
      notify(err.message || 'Failed to update property', 'error');
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-[#20251F] mb-1">Title *</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">Property Type *</label>
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
          <label className="block text-xs font-medium text-[#20251F] mb-1">Category *</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PropertyCategory)}
            className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
          >
            {db.settings.propertyCategoryGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">District *</label>
          <input
            type="text"
            required
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">
            Panchayath / Municipality *
          </label>
          <input
            type="text"
            required
            value={panchayath}
            onChange={(e) => setPanchayath(e.target.value)}
            className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">Locality / Place *</label>
          <input
            type="text"
            required
            value={locality}
            onChange={(e) => setLocality(e.target.value)}
            className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">Google Maps URL</label>
          <input
            type="url"
            value={googleMapsUrl}
            onChange={(e) => setGoogleMapsUrl(e.target.value)}
            className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-[#20251F] mb-1">Full Address</label>
          <input
            type="text"
            value={fullAddress}
            onChange={(e) => setFullAddress(e.target.value)}
            className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div className="sm:col-span-2">
          <LocationPickerMap
            latitude={latitude}
            longitude={longitude}
            locationAccuracy={locationAccuracy}
            addressHint={[locality, panchayath, district].filter(Boolean).join(', ')}
            heightClass="h-52"
            onChange={(next) => {
              setLatitude(next.latitude);
              setLongitude(next.longitude);
              setLocationAccuracy(next.locationAccuracy);
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">
            Area ({property.areaUnit}) *
          </label>
          <input
            type="number"
            step="any"
            required
            value={areaValue}
            onChange={(e) => setAreaValue(e.target.value)}
            className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">
            Road Connectivity *
          </label>
          <input
            type="text"
            required
            value={roadConnectivity}
            onChange={(e) => setRoadConnectivity(e.target.value)}
            className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">
            Expected Price ({db.settings.currencySymbol}) *
          </label>
          <input
            type="number"
            required
            value={expectedPrice}
            onChange={(e) => setExpectedPrice(e.target.value)}
            className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#20251F] mb-1">
            Market Price ({db.settings.currencySymbol})
          </label>
          <input
            type="number"
            value={marketPrice}
            onChange={(e) => setMarketPrice(e.target.value)}
            className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-[#20251F] mb-1">
            Price Update Note (recorded if pricing changed)
          </label>
          <input
            type="text"
            value={priceNote}
            onChange={(e) => setPriceNote(e.target.value)}
            placeholder="e.g. Seller agreed to revised expectation after buyer feedback"
            className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
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

        {/* Optional Site Specs */}
        <div className="sm:col-span-2 pt-2 border-t border-[#E5E4DA]">
          <p className="text-[11px] font-semibold text-[#77796F] mb-2">
            Optional Site & Utility Specifications
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={distanceToHighway}
              onChange={(e) => setDistanceToHighway(e.target.value)}
              placeholder="Distance to Highway"
              className="h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
            <input
              type="text"
              value={nearbyLandmarks}
              onChange={(e) => setNearbyLandmarks(e.target.value)}
              placeholder="Nearby Landmarks"
              className="h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
            <input
              type="text"
              value={waterAvailability}
              onChange={(e) => setWaterAvailability(e.target.value)}
              placeholder="Well / Water Availability"
              className="h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
            <input
              type="text"
              value={terrain}
              onChange={(e) => setTerrain(e.target.value)}
              placeholder="Terrain"
              className="h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
            <input
              type="text"
              value={frontage}
              onChange={(e) => setFrontage(e.target.value)}
              placeholder="Frontage"
              className="h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
            <input
              type="text"
              value={electricity}
              onChange={(e) => setElectricity(e.target.value)}
              placeholder="Electricity"
              className="h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
            <input
              type="text"
              value={boundaryDetails}
              onChange={(e) => setBoundaryDetails(e.target.value)}
              placeholder="Boundary Details"
              className="h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
            <input
              type="text"
              value={otherFeatures}
              onChange={(e) => setOtherFeatures(e.target.value)}
              placeholder="Other Features"
              className="h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
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
            Property Description *
          </label>
          <textarea
            rows={3}
            required
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
