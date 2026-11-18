import React, { useMemo } from 'react';
import {
  ArrowRight,
  CalendarClock,
  Check,
  MapPin,
  Plus,
  TrendingUp,
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService } from '../services/crmService';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getTodayISO,
} from '../utils/formatters';
import { PropertyThumbnail, StatusTag } from '../components/common/UIPrimitives';

export const DashboardPage: React.FC = () => {
  const {
    db,
    currentUser,
    navigate,
    updateDb,
    visibleProperties,
    visibleLeads,
    visibleSellers,
    visibleFollowUps,
    visibleDeals,
  } = useCRM();

  const today = getTodayISO();
  const currency = db.settings.currencySymbol;

  const stats = useMemo(() => {
    const runningProperties = visibleProperties.filter(
      (p) => p.status !== 'Sold' && p.status !== 'Inactive'
    );
    const availableProperties = visibleProperties.filter((p) => p.status === 'Available');
    const todayFollowUps = visibleFollowUps.filter(
      (f) => f.status === 'Pending' && f.date === today
    );
    const overdueFollowUps = visibleFollowUps.filter(
      (f) => f.status === 'Pending' && f.date < today
    );
    const activeDeals = visibleDeals.filter(
      (d) => !['Closed', 'Cancelled', 'Lost'].includes(d.status)
    );

    const closedDeals = visibleDeals.filter((d) => d.status === 'Closed');
    const totalSalesVolume = closedDeals.reduce((sum, d) => sum + d.agreedPrice, 0);
    const totalCommissionEarned = closedDeals.reduce((sum, d) => sum + d.commissionAmount, 0);
    const pipelineVolume = activeDeals.reduce((sum, d) => sum + d.agreedPrice, 0);
    const expectedCommission = activeDeals.reduce((sum, d) => sum + d.commissionAmount, 0);

    return {
      totalProperties: visibleProperties.length,
      runningCount: runningProperties.length,
      availableCount: availableProperties.length,
      totalLeads: visibleLeads.length,
      totalSellers: visibleSellers.length,
      todayFollowUps,
      overdueFollowUps,
      activeDeals,
      closedDeals,
      totalSalesVolume,
      totalCommissionEarned,
      pipelineVolume,
      expectedCommission,
    };
  }, [
    visibleProperties,
    visibleLeads,
    visibleSellers,
    visibleFollowUps,
    visibleDeals,
    today,
  ]);

  const propertyBreakdown = useMemo(() => {
    const statuses = [
      'Available',
      'Under Negotiation',
      'Reserved',
      'Sold',
      'Rented',
      'Inactive',
    ] as const;
    return statuses.map((status) => ({
      status,
      count: visibleProperties.filter((p) => p.status === status).length,
      value: visibleProperties
        .filter((p) => p.status === status)
        .reduce((acc, p) => acc + p.askingPrice, 0),
    }));
  }, [visibleProperties]);

  const leadBreakdown = useMemo(() => {
    const groups = [
      { label: 'New Leads', filter: 'New', count: visibleLeads.filter((l) => l.status === 'New').length },
      { label: 'Contacted', filter: 'Contacted', count: visibleLeads.filter((l) => l.status === 'Contacted').length },
      { label: 'Qualified', filter: 'Qualified', count: visibleLeads.filter((l) => l.status === 'Qualified').length },
      {
        label: 'Interested / Shared',
        filter: 'Property Shared',
        count: visibleLeads.filter((l) =>
          ['Property Shared', 'Site Visit', 'Negotiation'].includes(l.status)
        ).length,
      },
      { label: 'Converted', filter: 'Converted', count: visibleLeads.filter((l) => l.status === 'Converted').length },
      { label: 'Lost', filter: 'Lost', count: visibleLeads.filter((l) => l.status === 'Lost').length },
    ];
    return groups;
  }, [visibleLeads]);

  const upcomingVisits = useMemo(() => {
    return db.siteVisits
      .filter((v) => v.status === 'Scheduled' || v.status === 'Rescheduled')
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
      .slice(0, 5);
  }, [db.siteVisits]);

  const runningSnapshot = useMemo(() => {
    const activeListings = visibleProperties.filter((p) => p.runningCategory === 'Active Listing').slice(0, 2);
    const negotiating = visibleProperties.filter((p) => p.runningCategory === 'Under Negotiation').slice(0, 2);
    const managed = visibleProperties.filter((p) => p.isManaged).slice(0, 2);
    return [...activeListings, ...negotiating, ...managed].slice(0, 5);
  }, [visibleProperties]);

  const getPrimaryImage = (propertyId: string) =>
    db.propertyImages.find((i) => i.propertyId === propertyId && i.isPrimary)?.url ||
    db.propertyImages.find((i) => i.propertyId === propertyId)?.url;

  const getUserName = (id: string) =>
    db.users.find((u) => u.id === id)?.name || 'Unassigned';

  // Sales & Deal stage distribution chart bars derived from real deals
  const dealStageBars = useMemo(() => {
    const stages = ['Interested', 'Site Visit', 'Negotiation', 'Booking', 'Closed'] as const;
    const maxVal = Math.max(
      1,
      ...stages.map((st) =>
        visibleDeals
          .filter((d) => d.status === st)
          .reduce((s, d) => s + d.agreedPrice, 0)
      )
    );
    return stages.map((stage) => {
      const deals = visibleDeals.filter((d) => d.status === stage);
      const value = deals.reduce((s, d) => s + d.agreedPrice, 0);
      return {
        stage,
        count: deals.length,
        value,
        heightPct: Math.max(8, Math.round((value / maxVal) * 100)),
      };
    });
  }, [visibleDeals]);

  const kpiCards = [
    {
      label: 'Total Properties',
      value: stats.totalProperties,
      sub: `${visibleProperties.filter((p) => p.isManaged).length} managed`,
      onClick: () => navigate({ page: 'properties' }),
    },
    {
      label: 'Running Properties',
      value: stats.runningCount,
      sub: 'Active & operating',
      onClick: () => navigate({ page: 'running-properties' }),
    },
    {
      label: 'Available Properties',
      value: stats.availableCount,
      sub: 'Ready for buyer match',
      onClick: () => navigate({ page: 'properties', filterStatus: 'Available' }),
    },
    {
      label: 'Total Leads',
      value: stats.totalLeads,
      sub: `${visibleLeads.filter((l) => l.status === 'New' || l.status === 'Qualified').length} new & qualified`,
      onClick: () => navigate({ page: 'leads' }),
    },
    {
      label: 'Total Sellers',
      value: stats.totalSellers,
      sub: 'Property owners',
      onClick: () => navigate({ page: 'sellers' }),
    },
    {
      label: 'Follow-ups Today',
      value: stats.todayFollowUps.length,
      sub: 'Scheduled for today',
      onClick: () => navigate({ page: 'follow-ups', filterCategory: 'Today' }),
    },
    {
      label: 'Overdue Follow-ups',
      value: stats.overdueFollowUps.length,
      sub: stats.overdueFollowUps.length > 0 ? 'Requires attention' : 'All caught up',
      tone: stats.overdueFollowUps.length > 0 ? 'danger' : 'normal',
      onClick: () => navigate({ page: 'follow-ups', filterCategory: 'Overdue' }),
    },
    {
      label: 'Active Deals',
      value: stats.activeDeals.length,
      sub: `${formatCurrency(stats.pipelineVolume, currency)} pipeline`,
      onClick: () => navigate({ page: 'deals' }),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#77796F]">
            {db.settings.agencyTagline} · Viewing as {currentUser.name} ({currentUser.role})
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F] mt-1">
            Agency Operations Overview
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate({ page: 'leads' })}
            className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/40 text-xs font-medium text-[#20251F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Register Lead
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

      {/* 8 Clickable Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {kpiCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className="bg-[#FFFFFF] border border-[#E5E4DA] hover:border-[#064E3B]/50 rounded-xl p-4 text-left transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#77796F] group-hover:text-[#064E3B] transition-colors">
                {card.label}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[#A8B9A2] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div
              className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${
                card.tone === 'danger' ? 'text-[#C96C60]' : 'text-[#20251F]'
              }`}
            >
              {card.value}
            </div>
            <p className="mt-1 text-[11px] text-[#77796F] truncate">{card.sub}</p>
          </button>
        ))}
      </div>

      {/* Main Executive Row: Dark Panel Sales & Commission + Property & Lead Overviews */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* G. Sales & Commission Overview (Dark Charcoal Panel) */}
        <div className="lg:col-span-5 bg-[#151D18] text-[#FFFFFF] rounded-2xl p-6 flex flex-col justify-between border border-[#243028]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#A8B9A2]">
                Sales & Commission Overview
              </span>
              <button
                type="button"
                onClick={() => navigate({ page: 'deals' })}
                className="text-xs text-[#A8B9A2] hover:text-[#FFFFFF] transition-colors cursor-pointer"
              >
                Open Deals
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-[#A8B9A2]">Closed Sales Volume</p>
                <p className="text-2xl font-semibold tabular-nums mt-0.5">
                  {formatCurrency(stats.totalSalesVolume, currency)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#A8B9A2]">Commission Earned</p>
                <p className="text-2xl font-semibold tabular-nums text-[#70A76B] mt-0.5">
                  {formatCurrency(stats.totalCommissionEarned, currency)}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-[#243028] grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[#A8B9A2]">Active Pipeline Value</span>
                <p className="font-mono tabular-nums font-medium mt-0.5">
                  {formatCurrency(stats.pipelineVolume, currency)}
                </p>
              </div>
              <div>
                <span className="text-[#A8B9A2]">Projected Commission</span>
                <p className="font-mono tabular-nums font-medium mt-0.5">
                  {formatCurrency(stats.expectedCommission, currency)}
                </p>
              </div>
            </div>
          </div>

          {/* Interactive SVG Deal Pipeline Value Bar Chart */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-[11px] text-[#A8B9A2] mb-2">
              <span>Pipeline Volume by Stage</span>
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-[#70A76B]" />
                {visibleDeals.length} total deals
              </span>
            </div>
            <div className="h-28 flex items-end gap-2.5 pt-2">
              {dealStageBars.map((bar) => (
                <button
                  key={bar.stage}
                  type="button"
                  onClick={() => navigate({ page: 'deals' })}
                  className="flex-1 flex flex-col items-center gap-1.5 group cursor-pointer"
                  title={`${bar.stage}: ${bar.count} deal(s) · ${formatCurrency(bar.value, currency)}`}
                >
                  <div className="w-full h-20 bg-[#1F2B24] rounded-md flex items-end p-1 overflow-hidden">
                    <div
                      style={{ height: `${bar.heightPct}%` }}
                      className={`w-full rounded-sm transition-all ${
                        bar.stage === 'Closed'
                          ? 'bg-[#70A76B] group-hover:bg-[#88BD83]'
                          : 'bg-[#176B50] group-hover:bg-[#A8B9A2]'
                      }`}
                    />
                  </div>
                  <span className="text-[10px] text-[#A8B9A2] truncate max-w-full">
                    {bar.stage}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* A. Property Overview */}
        <div className="lg:col-span-4 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#20251F]">Property Overview</h2>
              <button
                type="button"
                onClick={() => navigate({ page: 'properties' })}
                className="text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-[#E5E4DA]">
              {propertyBreakdown.map((item) => (
                <button
                  key={item.status}
                  type="button"
                  onClick={() =>
                    navigate({ page: 'properties', filterStatus: item.status })
                  }
                  className="w-full py-2.5 flex items-center justify-between text-left hover:bg-[#F1F0E8]/60 px-2 -mx-2 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <StatusTag status={item.status} />
                  </div>
                  <div className="flex items-center gap-4 text-xs tabular-nums">
                    <span className="text-[#77796F]">
                      {formatCurrency(item.value, currency)}
                    </span>
                    <span className="font-semibold text-[#20251F] w-6 text-right">
                      {item.count}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-[#77796F] pt-3 border-t border-[#E5E4DA] mt-2">
            Click any status row to open filtered property inventory.
          </p>
        </div>

        {/* B. Lead Overview */}
        <div className="lg:col-span-3 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#20251F]">Lead Overview</h2>
              <button
                type="button"
                onClick={() => navigate({ page: 'leads' })}
                className="text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
              >
                Pipeline
              </button>
            </div>
            <div className="divide-y divide-[#E5E4DA]">
              {leadBreakdown.map((item) => {
                const pct =
                  stats.totalLeads > 0
                    ? Math.round((item.count / stats.totalLeads) * 100)
                    : 0;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() =>
                      navigate({ page: 'leads', filterStatus: item.filter })
                    }
                    className="w-full py-2.5 flex items-center justify-between text-left hover:bg-[#F1F0E8]/60 px-2 -mx-2 rounded-lg transition-colors cursor-pointer"
                  >
                    <span className="text-xs font-medium text-[#20251F]">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-2.5 tabular-nums">
                      <span className="text-[11px] text-[#77796F]">{pct}%</span>
                      <span className="text-xs font-semibold text-[#064E3B] w-5 text-right">
                        {item.count}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-[#77796F] pt-3 border-t border-[#E5E4DA] mt-2">
            Total active buyer inquiries: {visibleLeads.filter((l) => !['Converted', 'Lost'].includes(l.status)).length}
          </p>
        </div>
      </div>

      {/* Middle Section: C. Today's Follow-ups + D. Running Properties */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* C. Today's Follow-ups */}
        <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E4DA] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#20251F]">
                Today's Follow-ups
              </h2>
              <p className="text-[11px] text-[#77796F]">
                Scheduled calls, WhatsApp updates, and client meetings for {formatDate(today)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ page: 'follow-ups', filterCategory: 'Today' })}
              className="text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
            >
              Manage schedule
            </button>
          </div>
          <div className="overflow-x-auto">
            {stats.todayFollowUps.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#77796F]">
                No pending follow-ups remaining for today.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E4DA] text-[11px] font-medium text-[#77796F] bg-[#F1F0E8]/40">
                    <th className="py-2.5 px-4">Contact</th>
                    <th className="py-2.5 px-3">Related Property</th>
                    <th className="py-2.5 px-3">Agent</th>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E4DA] text-xs">
                  {stats.todayFollowUps.map((fup) => {
                    const contact =
                      fup.relatedType === 'Lead'
                        ? db.leads.find((l) => l.id === fup.relatedId)?.name
                        : db.sellers.find((s) => s.id === fup.relatedId)?.name;
                    const prop = fup.propertyId
                      ? db.properties.find((p) => p.id === fup.propertyId)
                      : undefined;
                    return (
                      <tr key={fup.id} className="hover:bg-[#F1F0E8]/40 transition-colors">
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() =>
                              navigate({
                                page: fup.relatedType === 'Lead' ? 'lead-detail' : 'seller-detail',
                                id: fup.relatedId,
                              })
                            }
                            className="font-medium text-[#20251F] hover:text-[#064E3B] text-left cursor-pointer"
                          >
                            {contact || 'Contact'}
                          </button>
                          <p className="text-[11px] text-[#77796F] truncate max-w-[180px]">
                            {fup.relatedType} · {fup.activityType}
                          </p>
                        </td>
                        <td className="py-3 px-3">
                          {prop ? (
                            <button
                              type="button"
                              onClick={() =>
                                navigate({ page: 'property-detail', id: prop.id })
                              }
                              className="text-[#064E3B] hover:underline truncate max-w-[160px] block text-left cursor-pointer"
                            >
                              {prop.title}
                            </button>
                          ) : (
                            <span className="text-[#77796F]">General inquiry</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[#20251F] whitespace-nowrap">
                          {getUserName(fup.assignedAgentId)}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-[#20251F] whitespace-nowrap">
                          {fup.time}
                        </td>
                        <td className="py-3 px-3">
                          <StatusTag status={fup.status} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              updateDb(
                                (prev) =>
                                  crmService.completeFollowUp(
                                    prev,
                                    fup.id,
                                    'Completed from executive dashboard.'
                                  ),
                                'Follow-up marked as completed'
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#E4EBE0] hover:bg-[#064E3B] text-[#064E3B] hover:text-[#FFFFFF] text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            Done
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* D. Running Properties */}
        <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E4DA] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#20251F]">
                Running Properties
              </h2>
              <p className="text-[11px] text-[#77796F]">
                Active listings, negotiations & managed stays
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ page: 'running-properties' })}
              className="text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
            >
              Open board
            </button>
          </div>
          <div className="divide-y divide-[#E5E4DA]">
            {runningSnapshot.map((prop) => (
              <button
                key={prop.id}
                type="button"
                onClick={() => navigate({ page: 'property-detail', id: prop.id })}
                className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#F1F0E8]/50 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <PropertyThumbnail
                    src={getPrimaryImage(prop.id)}
                    alt={prop.title}
                    className="w-12 h-10 rounded-lg"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#20251F] truncate">
                      {prop.title}
                    </p>
                    <p className="text-[11px] text-[#77796F] truncate">
                      {prop.location} · {prop.runningCategory}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono tabular-nums font-semibold text-[#064E3B]">
                    {formatCurrency(prop.askingPrice, currency)}
                  </p>
                  <StatusTag status={prop.status} className="mt-1" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: F. Upcoming Site Visits + E. Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* F. Upcoming Site Visits */}
        <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#20251F]">
              Upcoming Site Visits
            </h2>
            <span className="text-xs text-[#77796F] tabular-nums">
              {upcomingVisits.length} scheduled
            </span>
          </div>
          {upcomingVisits.length === 0 ? (
            <p className="text-xs text-[#77796F] py-6 text-center">
              No upcoming site visits scheduled.
            </p>
          ) : (
            <div className="divide-y divide-[#E5E4DA]">
              {upcomingVisits.map((visit) => {
                const prop = db.properties.find((p) => p.id === visit.propertyId);
                const lead = db.leads.find((l) => l.id === visit.leadId);
                return (
                  <div
                    key={visit.id}
                    className="py-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          prop && navigate({ page: 'property-detail', id: prop.id })
                        }
                        className="text-xs font-semibold text-[#20251F] hover:text-[#064E3B] truncate block text-left cursor-pointer"
                      >
                        {prop?.title || 'Property'}
                      </button>
                      <p className="text-[11px] text-[#77796F] mt-0.5 flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-[#176B50]" />
                        <span>Buyer: {lead?.name || 'Lead'}</span>
                        <span aria-hidden="true">·</span>
                        <span>Agent: {getUserName(visit.agentId)}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono tabular-nums font-medium text-[#064E3B] flex items-center gap-1 justify-end">
                        <CalendarClock className="w-3 h-3" />
                        {formatDate(visit.scheduledDate)}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-[#77796F]">
                        {visit.scheduledTime}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* E. Recent Activity */}
        <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#20251F]">Recent Activity</h2>
            <button
              type="button"
              onClick={() => navigate({ page: 'reports' })}
              className="text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
            >
              Audit reports
            </button>
          </div>
          <div className="divide-y divide-[#E5E4DA]">
            {db.activityLogs.slice(0, 6).map((log) => (
              <div
                key={log.id}
                className="py-2.5 flex items-start justify-between gap-4 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#064E3B]">{log.action}</span>
                    <span aria-hidden="true" className="text-[#A8B9A2]">·</span>
                    <span className="text-[#77796F]">{getUserName(log.actorId)}</span>
                  </div>
                  <p className="text-[#20251F] mt-0.5 leading-snug">{log.summary}</p>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-[#77796F] whitespace-nowrap shrink-0">
                  {formatDateTime(log.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
