import React from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  CalendarCheck2,
  Handshake,
  Home,
  LayoutDashboard,
  Settings,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { RoutePage } from '../../types/crm';
import { getTodayISO } from '../../utils/formatters';

interface NavGroup {
  label: string;
  items: {
    label: string;
    page: RoutePage;
    icon: React.ComponentType<{ className?: string }>;
    activeMatches?: RoutePage[];
    count?: number;
  }[];
}

export const Sidebar: React.FC<{
  mobileOpen: boolean;
  onCloseMobile: () => void;
}> = ({ mobileOpen, onCloseMobile }) => {
  const {
    db,
    currentUser,
    route,
    navigate,
    visibleProperties,
    visibleLeads,
    visibleSellers,
    visibleFollowUps,
    visibleDeals,
  } = useCRM();

  const today = getTodayISO();
  const pendingTodayOrOverdue = visibleFollowUps.filter(
    (f) => f.status === 'Pending' && f.date <= today
  ).length;
  const runningCount = visibleProperties.filter(
    (p) => p.status !== 'Sold' && p.status !== 'Inactive'
  ).length;
  const activeDealsCount = visibleDeals.filter(
    (d) => !['Closed', 'Cancelled', 'Lost'].includes(d.status)
  ).length;

  const navGroups: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        {
          label: 'Dashboard',
          page: 'dashboard',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      label: 'Inventory & Clients',
      items: [
        {
          label: 'Properties',
          page: 'properties',
          icon: Building2,
          activeMatches: ['properties', 'property-detail', 'register-property'],
          count: visibleProperties.length,
        },
        {
          label: 'Leads',
          page: 'leads',
          icon: Users,
          activeMatches: ['leads', 'lead-detail'],
          count: visibleLeads.length,
        },
        {
          label: 'Sellers',
          page: 'sellers',
          icon: UserCheck,
          activeMatches: ['sellers', 'seller-detail'],
          count: visibleSellers.length,
        },
        {
          label: 'Running Properties',
          page: 'running-properties',
          icon: Activity,
          count: runningCount,
        },
      ],
    },
    {
      label: 'Operations',
      items: [
        {
          label: 'Follow-ups',
          page: 'follow-ups',
          icon: CalendarCheck2,
          count: pendingTodayOrOverdue,
        },
        {
          label: 'Deals & Sales',
          page: 'deals',
          icon: Handshake,
          count: activeDealsCount,
        },
        {
          label: 'Investments & ROI',
          page: 'investments',
          icon: TrendingUp,
        },
        {
          label: 'Stay & Rentals',
          page: 'rentals',
          icon: Home,
        },
      ],
    },
    {
      label: 'Analytics & System',
      items: [
        {
          label: 'Reports',
          page: 'reports',
          icon: BarChart3,
        },
        {
          label: 'Settings',
          page: 'settings',
          icon: Settings,
        },
      ],
    },
  ];

  const isNavActive = (item: NavGroup['items'][number]) => {
    if (item.activeMatches) return item.activeMatches.includes(route.page);
    return route.page === item.page;
  };

  const handleNavClick = (page: RoutePage) => {
    navigate({ page });
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="h-full flex flex-col bg-[#FFFFFF] border-r border-[#E5E4DA]">
      {/* Brand Wordmark */}
      <div className="h-16 px-5 border-b border-[#E5E4DA] flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => handleNavClick('dashboard')}
          className="flex items-center gap-2.5 text-left group whitespace-nowrap shrink-0 focus:outline-none cursor-pointer"
        >
          {db.settings.logoUrl ? (
            <img
              src={db.settings.logoUrl}
              alt={`${db.settings.agencyName} logo`}
              className="w-10 h-10 rounded-full object-cover border border-[#E5E4DA] shrink-0 bg-[#FFFFFF]"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-[#064E3B] flex items-center justify-center text-[#FFFFFF] shrink-0">
              <svg width="20" height="10" viewBox="0 0 124 62" fill="none" aria-hidden="true">
                <path
                  d="M32 13C19.85 13 10 21.5 10 31C10 40.5 19.85 49 32 49C47 49 55 31 62 31C69 31 77 13 92 13C104.15 13 114 21.5 114 31C114 40.5 104.15 49 92 49C77 49 69 31 62 31C55 31 47 13 32 13Z"
                  stroke="currentColor"
                  strokeWidth="9"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <span className="text-[15px] font-semibold tracking-tight text-[#20251F] group-hover:text-[#064E3B] transition-colors block truncate">
              {db.settings.agencyName}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-[#77796F] hover:text-[#20251F] hover:bg-[#F1F0E8] cursor-pointer"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Groups */}
      <nav
        aria-label="Main Sidebar Navigation"
        className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
      >
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-semibold text-[#77796F]">
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(item);
              return (
                <button
                  key={item.page}
                  type="button"
                  onClick={() => handleNavClick(item.page)}
                  className={`w-full px-3 py-2 rounded-lg text-[13px] flex items-center justify-between gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#064E3B] text-[#FFFFFF] font-medium'
                      : 'text-[#20251F] hover:bg-[#E4EBE0]/60 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-[#E4EBE0]' : 'text-[#77796F]'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {typeof item.count === 'number' && (
                    <span
                      className={`text-[11px] font-mono tabular-nums shrink-0 ${
                        active ? 'text-[#E4EBE0]' : 'text-[#77796F]'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Active Advisor Footer */}
      <div className="p-4 border-t border-[#E5E4DA] bg-[#F1F0E8]/40 shrink-0">
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <p className="font-semibold text-[#20251F] truncate">{currentUser.name}</p>
            <p className="text-[11px] text-[#77796F] truncate">
              {currentUser.role} · {currentUser.designation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Fixed Desktop Sidebar */}
      <aside className="no-print hidden lg:block fixed top-0 left-0 bottom-0 w-64 z-40">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Sidebar */}
      {mobileOpen && (
        <div className="no-print lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-[#151D18]/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10 shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
