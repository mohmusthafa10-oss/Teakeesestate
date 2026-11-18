import React, { useMemo, useState } from 'react';
import { CalendarPlus, Eye, Search } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService } from '../services/crmService';
import { PropertyStatus, RunningCategory } from '../types/crm';
import { formatCurrency, formatDateTime, getTodayISO } from '../utils/formatters';
import {
  EmptyState,
  Modal,
  PropertyThumbnail,
  StatusTag,
} from '../components/common/UIPrimitives';

const CATEGORIES: ('All Running' | RunningCategory)[] = [
  'All Running',
  'Active Listing',
  'Under Negotiation',
  'Reserved',
  'Managed / Operating',
  'Rented / Occupied',
  'Inactive',
];

export const RunningPropertiesPage: React.FC = () => {
  const { db, navigate, updateDb, visibleProperties } = useCRM();
  const currency = db.settings.currencySymbol;

  const [categoryTab, setCategoryTab] = useState<'All Running' | RunningCategory>(
    'All Running'
  );
  const [groupFilter, setGroupFilter] = useState<'all' | 'listings' | 'managed'>('all');
  const [search, setSearch] = useState('');
  const [nextActionModal, setNextActionModal] = useState<{
    propertyId: string;
    sellerId: string;
    agentId: string;
    title: string;
  } | null>(null);
  const [actionTitle, setActionTitle] = useState('');
  const [actionDate, setActionDate] = useState(getTodayISO());

  const activeListingsCount = useMemo(
    () =>
      visibleProperties.filter(
        (p) =>
          !p.isManaged &&
          ['Active Listing', 'Under Negotiation', 'Reserved'].includes(p.runningCategory)
      ).length,
    [visibleProperties]
  );

  const managedCount = useMemo(
    () => visibleProperties.filter((p) => p.isManaged).length,
    [visibleProperties]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleProperties.filter((p) => {
      if (categoryTab === 'All Running') {
        if (p.runningCategory === 'Inactive') return false;
      } else if (p.runningCategory !== categoryTab) {
        return false;
      }

      if (groupFilter === 'listings' && p.isManaged) return false;
      if (groupFilter === 'managed' && !p.isManaged) return false;

      if (q) {
        const seller = db.sellers.find((s) => s.id === p.sellerId)?.name || '';
        const hit =
          p.title.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          seller.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [visibleProperties, db.sellers, categoryTab, groupFilter, search]);

  const getPrimaryImage = (propertyId: string) =>
    db.propertyImages.find((i) => i.propertyId === propertyId && i.isPrimary)?.url ||
    db.propertyImages.find((i) => i.propertyId === propertyId)?.url;

  const getLastActivity = (propertyId: string) => {
    const log = db.activityLogs.find((a) => a.entityId === propertyId);
    return log ? `${log.action} · ${formatDateTime(log.timestamp)}` : 'No recent log';
  };

  const getNextAction = (propertyId: string) => {
    const fup = db.followUps
      .filter((f) => f.propertyId === propertyId && f.status === 'Pending')
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    return fup ? `${fup.title} (${fup.date})` : 'No action scheduled';
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            Running Properties
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Live tracking over central property records — separating active brokerage listings from managed stays & rentals.
          </p>
        </div>
      </div>

      {/* Distinction Cards: A. Active Listings vs B. Managed / Operating */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() =>
            setGroupFilter(groupFilter === 'listings' ? 'all' : 'listings')
          }
          className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
            groupFilter === 'listings'
              ? 'bg-[#151D18] text-[#FFFFFF] border-[#151D18]'
              : 'bg-[#FFFFFF] text-[#20251F] border-[#E5E4DA] hover:border-[#064E3B]/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-semibold ${
                groupFilter === 'listings' ? 'text-[#A8B9A2]' : 'text-[#064E3B]'
              }`}
            >
              A. Active Listings (Sales & Leasing Search)
            </span>
            <span className="text-xl font-mono tabular-nums font-semibold">
              {activeListingsCount}
            </span>
          </div>
          <p
            className={`text-xs mt-1.5 ${
              groupFilter === 'listings' ? 'text-[#E4EBE0]' : 'text-[#77796F]'
            }`}
          >
            Properties where the agency is actively matching buyers, conducting site visits, or negotiating offers.
          </p>
        </button>

        <button
          type="button"
          onClick={() =>
            setGroupFilter(groupFilter === 'managed' ? 'all' : 'managed')
          }
          className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
            groupFilter === 'managed'
              ? 'bg-[#151D18] text-[#FFFFFF] border-[#151D18]'
              : 'bg-[#FFFFFF] text-[#20251F] border-[#E5E4DA] hover:border-[#064E3B]/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-semibold ${
                groupFilter === 'managed' ? 'text-[#A8B9A2]' : 'text-[#064E3B]'
              }`}
            >
              B. Managed / Operating (Stays & Rentals)
            </span>
            <span className="text-xl font-mono tabular-nums font-semibold">
              {managedCount}
            </span>
          </div>
          <p
            className={`text-xs mt-1.5 ${
              groupFilter === 'managed' ? 'text-[#E4EBE0]' : 'text-[#77796F]'
            }`}
          >
            Properties operated under agency management mandates, corporate leases, or short-stay hospitality.
          </p>
        </button>
      </div>

      {/* Category Tabs & Search */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryTab(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                categoryTab === cat
                  ? 'bg-[#064E3B] text-[#FFFFFF]'
                  : 'bg-[#F1F0E8]/70 text-[#20251F] hover:bg-[#E4EBE0]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter running properties..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-[#F1F0E8]/60 border border-[#E5E4DA] rounded-lg focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No properties in this running category"
          description="Select another category tab or update a property status from the central inventory."
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                  <th className="py-3 px-4">Property</th>
                  <th className="py-3 px-3">Seller / Owner</th>
                  <th className="py-3 px-3">Location</th>
                  <th className="py-3 px-3">Price</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Current Status</th>
                  <th className="py-3 px-3">Agent</th>
                  <th className="py-3 px-3">Last Activity</th>
                  <th className="py-3 px-3">Next Action</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DA] text-xs">
                {filtered.map((prop) => {
                  const seller = db.sellers.find((s) => s.id === prop.sellerId);
                  const agent = db.users.find((u) => u.id === prop.assignedAgentId);
                  return (
                    <tr key={prop.id} className="hover:bg-[#F1F0E8]/40">
                      <td className="py-3 px-4">
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
                              className="font-semibold text-[#20251F] hover:text-[#064E3B] text-left cursor-pointer"
                            >
                              {prop.title}
                            </button>
                            <p className="text-[11px] text-[#77796F]">
                              {prop.code} · {prop.runningCategory}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {seller ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate({ page: 'seller-detail', id: seller.id })
                            }
                            className="text-[#064E3B] hover:underline font-medium cursor-pointer"
                          >
                            {seller.name}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-3 text-[#77796F] whitespace-nowrap">
                        {prop.location}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums font-semibold text-[#064E3B] whitespace-nowrap">
                        {formatCurrency(prop.askingPrice, currency)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">{prop.type}</td>
                      <td className="py-3 px-3">
                        <select
                          value={prop.status}
                          onChange={(e) =>
                            updateDb(
                              (prev) =>
                                crmService.updateProperty(prev, prop.id, {
                                  status: e.target.value as PropertyStatus,
                                }),
                              `Updated ${prop.title} to ${e.target.value}`
                            )
                          }
                          className="h-7 px-2 text-[11px] border border-[#E5E4DA] rounded bg-[#FFFFFF]"
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
                        {agent?.name || '—'}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-[#77796F] max-w-[160px] truncate">
                        {getLastActivity(prop.id)}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-[#20251F] max-w-[180px] truncate">
                        {getNextAction(prop.id)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setNextActionModal({
                                propertyId: prop.id,
                                sellerId: prop.sellerId,
                                agentId: prop.assignedAgentId,
                                title: prop.title,
                              })
                            }
                            title="Schedule Next Action"
                            className="p-1.5 rounded-md hover:bg-[#E4EBE0] text-[#064E3B] cursor-pointer"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              navigate({ page: 'property-detail', id: prop.id })
                            }
                            title="Open Property"
                            className="p-1.5 rounded-md hover:bg-[#F1F0E8] text-[#20251F] cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Schedule Next Action Modal */}
      <Modal
        open={Boolean(nextActionModal)}
        onClose={() => setNextActionModal(null)}
        title={`Schedule Next Action — ${nextActionModal?.title || ''}`}
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nextActionModal || !actionTitle.trim()) return;
            updateDb(
              (prev) =>
                crmService.upsertFollowUp(prev, {
                  title: actionTitle,
                  relatedType: 'Seller',
                  relatedId: nextActionModal.sellerId,
                  propertyId: nextActionModal.propertyId,
                  assignedAgentId: nextActionModal.agentId,
                  date: actionDate,
                  time: '11:00',
                  activityType: 'Call',
                  notes: 'Scheduled from Running Properties board.',
                }),
              'Next action scheduled'
            );
            setActionTitle('');
            setNextActionModal(null);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Action Title *</label>
            <input
              type="text"
              required
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              placeholder="e.g. Share updated offer with seller"
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Target Date</label>
            <input
              type="date"
              required
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNextActionModal(null)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Schedule Action
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
