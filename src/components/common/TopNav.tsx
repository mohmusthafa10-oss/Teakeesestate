import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Menu,
  Plus,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { formatCurrency } from '../../utils/formatters';

export const TopNav: React.FC<{ onOpenMobileSidebar: () => void }> = ({
  onOpenMobileSidebar,
}) => {
  const {
    db,
    currentUser,
    navigate,
    updateDb,
    visibleProperties,
    visibleLeads,
    visibleSellers,
    visibleDeals,
  } = useCRM();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut Cmd/Ctrl + K for global search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setUserMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Outside click handlers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        {/* Left: Mobile Menu Trigger + Global Search */}
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

        {/* Right Actions: Role/User Switcher + Primary CTA */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="h-9 px-3 rounded-lg border border-[#E5E4DA] bg-[#F1F0E8]/60 hover:bg-[#E4EBE0]/50 flex items-center gap-2 text-xs text-[#20251F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#064E3B]" />
              <span className="hidden md:inline font-medium">{currentUser.name}</span>
              <span className="text-[#77796F]">({currentUser.role})</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#77796F]" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl shadow-lg p-1.5 z-50">
                <p className="px-2.5 py-1.5 text-[11px] font-semibold text-[#77796F]">
                  Switch Active User & Access Scope
                </p>
                {db.users
                  .filter((u) => u.active)
                  .map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        updateDb(
                          (prev) => ({
                            ...prev,
                            settings: { ...prev.settings, currentUserId: u.id },
                          }),
                          `Switched view to ${u.name} (${u.role})`
                        );
                        setUserMenuOpen(false);
                      }}
                      className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                        u.id === currentUser.id
                          ? 'bg-[#E4EBE0] text-[#064E3B] font-semibold'
                          : 'hover:bg-[#F1F0E8] text-[#20251F]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate">{u.name}</p>
                        <p className="text-[11px] text-[#77796F] truncate">{u.designation}</p>
                      </div>
                      <span className="text-[11px] font-medium shrink-0 ml-2">{u.role}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate({ page: 'register-property' })}
            className="h-9 px-3.5 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-[#FFFFFF] text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Seller + Property</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>
    </header>
  );
};
