import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ExternalLink,
  LogOut,
  Menu,
  Plus,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCRM } from '../../context/CRMContext';
import { apiClient, NotificationDTO } from '../../services/apiClient';
import { formatCurrency } from '../../utils/formatters';

export const TopNav: React.FC<{
  onOpenMobileSidebar: () => void;
  onNavigatePath: (path: string) => void;
}> = ({ onOpenMobileSidebar, onNavigatePath }) => {
  const { crmUser, unreadNotifications, signOutUser, refreshProfile } = useAuth();
  const {
    db,
    currentUser,
    isAdmin,
    navigate,
    visibleProperties,
    visibleLeads,
    visibleSellers,
    visibleDeals,
  } = useCRM();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);

  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setUserMenuOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadNotifications = async () => {
    try {
      const res = await apiClient.getNotifications();
      setNotifications(res.items);
    } catch {
      // ignore
    }
  };

  const handleToggleNotifs = () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) void loadNotifications();
  };

  const handleMarkRead = async (n: NotificationDTO) => {
    if (!n.isRead) {
      await apiClient.markNotificationRead(n.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
      );
      void refreshProfile();
    }
    if (n.entityType === 'PropertySubmission' && isAdmin) {
      setNotifOpen(false);
      navigate({ page: 'submissions' });
    } else if (n.entityType === 'Property') {
      setNotifOpen(false);
      navigate({ page: 'portfolio-publishing' });
    }
  };

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { properties: [], leads: [], sellers: [], deals: [] };
    return {
      properties: visibleProperties
        .filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q) ||
            p.location.toLowerCase().includes(q) ||
            p.type.toLowerCase().includes(q)
        )
        .slice(0, 4),
      leads: visibleLeads
        .filter(
          (l) =>
            l.name.toLowerCase().includes(q) ||
            l.code.toLowerCase().includes(q) ||
            l.phone.includes(q) ||
            l.preferredLocation.toLowerCase().includes(q)
        )
        .slice(0, 4),
      sellers: visibleSellers
        .filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.code.toLowerCase().includes(q) ||
            s.phone.includes(q)
        )
        .slice(0, 3),
      deals: visibleDeals
        .filter((d) => d.code.toLowerCase().includes(q) || d.status.toLowerCase().includes(q))
        .slice(0, 2),
    };
  }, [searchQuery, visibleProperties, visibleLeads, visibleSellers, visibleDeals]);

  const hasResults =
    searchResults.properties.length > 0 ||
    searchResults.leads.length > 0 ||
    searchResults.sellers.length > 0 ||
    searchResults.deals.length > 0;

  return (
    <header className="no-print fixed top-0 left-0 lg:left-64 right-0 z-30 h-16 bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E5E4DA]">
      <div className="h-full max-w-[1440px] mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="lg:hidden p-2 rounded-lg text-[#20251F] hover:bg-[#F1F0E8] transition-colors shrink-0 cursor-pointer"
            aria-label="Open navigation sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div ref={searchRef} className="relative flex-1 max-w-md">
            <div className="relative">
              <Search className="w-4 h-4 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder="Search properties, sellers, leads, deals... (⌘K)"
                className="w-full h-9 pl-9 pr-8 text-xs bg-[#F1F0E8]/80 border border-[#E5E4DA] rounded-lg text-[#20251F] placeholder-[#77796F] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B] transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#77796F] hover:text-[#20251F]"
                  aria-label="Clear global search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {searchOpen && searchQuery.trim().length > 0 && (
              <div className="absolute top-11 left-0 right-0 bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl shadow-lg overflow-hidden z-50 max-h-[420px] overflow-y-auto">
                {!hasResults ? (
                  <div className="p-4 text-xs text-[#77796F] text-center">
                    No matching CRM records for "{searchQuery}"
                  </div>
                ) : (
                  <div className="divide-y divide-[#E5E4DA]">
                    {searchResults.properties.length > 0 && (
                      <div className="p-2">
                        <p className="px-2 py-1 text-[11px] font-semibold text-[#77796F]">
                          Properties
                        </p>
                        {searchResults.properties.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              setSearchQuery('');
                              navigate({ page: 'property-detail', id: p.id });
                            }}
                            className="w-full px-2.5 py-2 rounded-lg text-left hover:bg-[#F1F0E8] flex items-center justify-between gap-2 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[#20251F] truncate">
                                {p.title}
                              </p>
                              <p className="text-[11px] text-[#77796F] truncate">
                                {p.code} · {p.location} · {p.status}
                              </p>
                            </div>
                            <span className="text-xs font-mono tabular-nums font-medium text-[#064E3B] shrink-0">
                              {formatCurrency(p.askingPrice, db.settings.currencySymbol)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {searchResults.leads.length > 0 && (
                      <div className="p-2">
                        <p className="px-2 py-1 text-[11px] font-semibold text-[#77796F]">
                          Leads
                        </p>
                        {searchResults.leads.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              setSearchQuery('');
                              navigate({ page: 'lead-detail', id: l.id });
                            }}
                            className="w-full px-2.5 py-2 rounded-lg text-left hover:bg-[#F1F0E8] flex items-center justify-between gap-2 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[#20251F] truncate">
                                {l.name}
                              </p>
                              <p className="text-[11px] text-[#77796F] truncate">
                                {l.code} · {l.preferredLocation || 'Any location'} · {l.status}
                              </p>
                            </div>
                            <span className="text-[11px] font-mono tabular-nums text-[#77796F] shrink-0">
                              {l.phone}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {searchResults.sellers.length > 0 && (
                      <div className="p-2">
                        <p className="px-2 py-1 text-[11px] font-semibold text-[#77796F]">
                          Sellers
                        </p>
                        {searchResults.sellers.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              setSearchQuery('');
                              navigate({ page: 'seller-detail', id: s.id });
                            }}
                            className="w-full px-2.5 py-2 rounded-lg text-left hover:bg-[#F1F0E8] flex items-center justify-between gap-2 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[#20251F] truncate">
                                {s.name}
                              </p>
                              <p className="text-[11px] text-[#77796F] truncate">
                                {s.code} · {s.address}
                              </p>
                            </div>
                            <span className="text-[11px] font-mono tabular-nums text-[#77796F] shrink-0">
                              {s.phone}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Actions: Notifications Bell + Authenticated Profile + Primary CTA */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Notifications Bell */}
          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={handleToggleNotifs}
              aria-label="Open notifications"
              className="relative h-9 w-9 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] flex items-center justify-center text-[#20251F] cursor-pointer"
            >
              <Bell className="w-4 h-4 text-[#064E3B]" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C96C60] text-[#FFFFFF] text-[10px] font-mono font-bold flex items-center justify-center">
                  {unreadNotifications}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-1.5 w-80 bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl shadow-lg overflow-hidden z-50">
                <div className="px-3.5 py-2.5 border-b border-[#E5E4DA] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#20251F]">
                    CRM Notifications
                  </span>
                  <span className="text-[11px] font-mono text-[#77796F]">
                    {unreadNotifications} unread
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-[#E5E4DA]">
                  {notifications.length === 0 ? (
                    <p className="p-4 text-xs text-[#77796F] text-center">
                      No notifications yet.
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => void handleMarkRead(n)}
                        className={`w-full px-3.5 py-2.5 text-left hover:bg-[#F1F0E8]/60 transition-colors cursor-pointer ${
                          n.isRead ? 'opacity-70' : 'bg-[#E4EBE0]/25'
                        }`}
                      >
                        <p className="text-xs font-semibold text-[#20251F]">{n.title}</p>
                        <p className="text-[11px] text-[#77796F] mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Authenticated User Dropdown */}
          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="h-9 px-3 rounded-lg border border-[#E5E4DA] bg-[#F1F0E8]/60 hover:bg-[#E4EBE0]/50 flex items-center gap-2 text-xs text-[#20251F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#064E3B]" />
              <span className="hidden md:inline font-medium">
                {crmUser?.name || currentUser.name}
              </span>
              <span className="text-[#77796F]">
                ({crmUser?.role || currentUser.role})
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[#77796F]" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl shadow-lg p-2 z-50 space-y-1">
                <div className="px-2.5 py-2 border-b border-[#E5E4DA]">
                  <p className="text-xs font-semibold text-[#20251F]">
                    {crmUser?.name || currentUser.name}
                  </p>
                  <p className="text-[11px] text-[#77796F] truncate">
                    {crmUser?.email || currentUser.email}
                  </p>
                  <p className="text-[10px] font-mono text-[#064E3B] mt-0.5">
                    Role: {crmUser?.role || currentUser.role}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onNavigatePath('/');
                  }}
                  className="w-full px-2.5 py-2 rounded-lg text-left text-xs text-[#20251F] hover:bg-[#F1F0E8] flex items-center justify-between cursor-pointer"
                >
                  <span>Public Showcase</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#064E3B]" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    void signOutUser();
                  }}
                  className="w-full px-2.5 py-2 rounded-lg text-left text-xs text-[#9E3E33] hover:bg-[#C96C60]/10 flex items-center justify-between cursor-pointer"
                >
                  <span>Sign Out</span>
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate({ page: 'register-property' })}
              className="h-9 px-3.5 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-[#FFFFFF] text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Seller + Property</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
