import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { crmService } from '../services/crmService';
import { apiClient } from '../services/apiClient';
import { CRMDatabase, RoutePage, User } from '../types/crm';

export interface RouteState {
  page: RoutePage;
  id?: string;
  filterStatus?: string;
  filterCategory?: string;
  filterAging?: string;
  filterSource?: string;
  preselectedSellerId?: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface CRMContextValue {
  db: CRMDatabase;
  currentUser: User;
  isAuthenticated: boolean;
  isAdmin: boolean;
  route: RouteState;
  navigate: (next: RouteState, options?: { showLoader?: boolean }) => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  withLoader: <T>(fn: () => Promise<T> | T, delayMs?: number) => Promise<T>;
  toasts: ToastMessage[];
  notify: (message: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;
  updateDb: (updater: (prev: CRMDatabase) => CRMDatabase, toastMsg?: string) => boolean;
  resetDemo: () => void;
  refreshDb: () => Promise<void>;
  // Scoped datasets respecting Admin vs Agent role permissions
  visibleProperties: CRMDatabase['properties'];
  visibleSellers: CRMDatabase['sellers'];
  visibleLeads: CRMDatabase['leads'];
  visibleFollowUps: CRMDatabase['followUps'];
  visibleDeals: CRMDatabase['deals'];
}

const CRMContext = createContext<CRMContextValue | null>(null);

const VALID_PAGES: RoutePage[] = [
  'login',
  'profile',
  'dashboard',
  'properties',
  'property-detail',
  'register-property',
  'leads',
  'lead-detail',
  'sellers',
  'seller-detail',
  'running-properties',
  'follow-ups',
  'deals',
  'investments',
  'rentals',
  'reports',
  'settings',
  'public-submission',
  'admin-submissions',
];

function parseHashToRoute(): RouteState {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return { page: 'dashboard' };
  const [segment, id] = raw.split('/');
  if (VALID_PAGES.includes(segment as RoutePage)) {
    return { page: segment as RoutePage, id };
  }
  return { page: 'dashboard' };
}

export const CRMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<CRMDatabase>(() => crmService.getDatabase());
  const [route, setRoute] = useState<RouteState>(() => parseHashToRoute());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!localStorage.getItem('crm_access_token'));

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, type: ToastMessage['type'] = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const navigate = useCallback(
    (next: RouteState, options?: { showLoader?: boolean }) => {
      const targetHash = next.id ? `#/${next.page}/${next.id}` : `#/${next.page}`;
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
      if (options?.showLoader) {
        setIsLoading(true);
        window.setTimeout(() => {
          setRoute(next);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setIsLoading(false);
        }, 280);
      } else {
        setRoute(next);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    []
  );

  // Authenticate & restore session on initial mount
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      const currentRoute = parseHashToRoute();
      const token = localStorage.getItem('crm_access_token');
      if (!token) {
        if (isMounted) {
          setIsAuthenticated(false);
          setAuthUser(null);
          setIsLoading(false);
          if (currentRoute.page !== 'public-submission' && window.location.hash !== '#/login') {
            navigate({ page: 'login' });
          } else {
            setRoute(currentRoute);
          }
        }
        return;
      }

      try {
        const user = await apiClient.getMe();
        if (isMounted) {
          setAuthUser(user);
          setIsAuthenticated(true);
          setIsLoading(false);
          refreshDb();
          if (currentRoute.page === 'login') {
            navigate({ page: 'dashboard' });
          } else if (currentRoute.page === 'admin-submissions' && user.role !== 'Admin') {
            notify('Admin privileges required to access submissions', 'error');
            navigate({ page: 'dashboard' });
          } else {
            setRoute(currentRoute);
          }
        }
      } catch (err) {
        apiClient.logout();
        if (isMounted) {
          setIsAuthenticated(false);
          setAuthUser(null);
          setIsLoading(false);
          if (currentRoute.page !== 'public-submission') {
            navigate({ page: 'login' });
          }
        }
      }
    };

    initAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync document title with configurable agency name
  useEffect(() => {
    document.title = `${db.settings.agencyName} — Real Estate CRM`;
  }, [db.settings.agencyName]);

  // Listen to browser hash back/forward
  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseHashToRoute();
      const token = localStorage.getItem('crm_access_token');
      if (!token && parsed.page !== 'login' && parsed.page !== 'public-submission') {
        navigate({ page: 'login' });
      } else if (parsed.page === 'admin-submissions' && authUser && authUser.role !== 'Admin') {
        notify('Admin privileges required to access submissions', 'error');
        navigate({ page: 'dashboard' });
      } else {
        setRoute(parsed);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [navigate, authUser, notify]);

  const refreshDb = useCallback(async () => {
    try {
      const [propsRes, sellersRes, leadsRes, followUpsRes, dealsRes, rentalsRes, settingsRes, usersRes] = await Promise.allSettled([
        apiClient.getProperties({ page_size: 100 }),
        apiClient.getSellers({ page_size: 100 }),
        apiClient.getLeads({ page_size: 100 }),
        apiClient.getFollowUps({ page_size: 100 }),
        apiClient.getDeals({ page_size: 100 }),
        apiClient.getRentals(),
        apiClient.getSettings(),
        apiClient.getUsers(),
      ]);

      setDb((prev) => {
        const next = { ...prev };
        if (propsRes.status === 'fulfilled' && propsRes.value?.items) {
          next.properties = propsRes.value.items.map((p: any) => ({
            ...p,
            sellerId: p.seller_id || p.sellerId || '',
            assignedAgentId: p.assigned_agent_id || p.assignedAgentId || '',
            areaValue: p.area_value !== undefined ? Number(p.area_value) : p.areaValue,
            areaUnit: p.area_unit || p.areaUnit || 'Cents',
            expectedPrice: p.expected_price !== undefined ? Number(p.expected_price) : p.expectedPrice,
            askingPrice: p.expected_price !== undefined ? Number(p.expected_price) : (p.askingPrice || p.expectedPrice),
            runningCategory: p.running_category || p.runningCategory || 'Active Listing',
            priceHistory: p.price_history || p.priceHistory || [],
            status: p.status || 'Available',
            listedDate: p.listed_date || p.listedDate || p.created_at,
            addedDate: p.added_date || p.addedDate || p.created_at,
            bedrooms: p.bedrooms,
            bathrooms: p.bathrooms,
          }));
        }
        if (sellersRes.status === 'fulfilled' && sellersRes.value?.items) {
          next.sellers = sellersRes.value.items.map((s: any) => ({
            ...s,
            assignedAgentId: s.assigned_agent_id || s.assignedAgentId || '',
            relationshipWithProperty: s.relationship_with_property || s.relationshipWithProperty || 'Owner',
            lastContactAt: s.last_contacted_date || s.lastContactAt || s.created_at,
          }));
        }
        if (leadsRes.status === 'fulfilled' && leadsRes.value?.items) {
          next.leads = leadsRes.value.items.map((l: any) => ({
            ...l,
            assignedAgentId: l.assigned_agent_id || l.assignedAgentId || '',
            leadSource: l.lead_source || l.leadSource || 'Website',
            propertyType: l.property_type || l.propertyType || 'Any',
            minBudget: l.min_budget !== undefined ? Number(l.min_budget) : l.minBudget,
            maxBudget: l.max_budget !== undefined ? Number(l.max_budget) : l.maxBudget,
          }));
        }
        if (followUpsRes.status === 'fulfilled' && followUpsRes.value?.items) {
          next.followUps = followUpsRes.value.items.map((f: any) => ({
            ...f,
            assignedAgentId: f.assigned_agent_id || f.assignedAgentId || '',
            relatedType: f.related_type || f.relatedType || 'Lead',
            relatedId: f.related_id || f.relatedId || '',
            activityType: f.activity_type || f.activityType || 'Call',
          }));
        }
        if (dealsRes.status === 'fulfilled' && dealsRes.value?.items) {
          next.deals = dealsRes.value.items.map((d: any) => ({
            ...d,
            propertyId: d.property_id || d.propertyId || '',
            leadId: d.lead_id || d.leadId || '',
            sellerId: d.seller_id || d.sellerId || '',
            assignedAgentId: d.assigned_agent_id || d.assignedAgentId || '',
            dealType: d.deal_type || d.dealType || 'Sale',
            finalPrice: d.final_price !== undefined ? Number(d.final_price) : d.finalPrice,
          }));
        }
        if (rentalsRes.status === 'fulfilled' && Array.isArray(rentalsRes.value)) {
          next.rentalBookings = rentalsRes.value.map((r: any) => ({
            ...r,
            propertyId: r.property_id || r.propertyId || '',
            tenantId: r.tenant_id || r.tenantId,
            rentalType: r.rental_type || r.rentalType || 'Long-Term',
            rateAmount: r.rate_amount !== undefined ? Number(r.rate_amount) : r.rateAmount,
            bookingDate: r.booking_date || r.bookingDate,
            checkIn: r.check_in || r.checkIn,
            checkOut: r.check_out || r.checkOut,
            contractRef: r.contract_ref || r.contractRef || '',
            incomeReceived: r.income_received !== undefined ? Number(r.income_received) : r.incomeReceived,
            maintenanceNotes: r.maintenance_notes || r.maintenanceNotes || '',
          }));
        }
        if (settingsRes.status === 'fulfilled' && settingsRes.value) {
          next.settings = {
            ...next.settings,
            ...settingsRes.value,
            followUpDefaults: {
              ...next.settings.followUpDefaults,
              ...(settingsRes.value.followUpDefaults || {}),
            },
          };
        }
        if (usersRes.status === 'fulfilled' && Array.isArray(usersRes.value)) {
          next.users = usersRes.value.map((u: any) => ({
            ...u,
            avatarUrl: u.avatar_url || u.avatarUrl || '',
            role: u.role || 'Agent',
            active: u.active !== undefined ? u.active : true,
          }));
        }
        return next;
      });
    } catch (e) {
      console.warn('Could not refresh data from backend, using local store', e);
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await apiClient.login(username, password);
      setAuthUser(res.user);
      setIsAuthenticated(true);
      notify(`Welcome back, ${res.user.name}!`, 'success');
      refreshDb();
      navigate({ page: 'dashboard' }, { showLoader: true });
    },
    [navigate, notify, refreshDb]
  );

  const logout = useCallback(() => {
    apiClient.logout();
    setIsAuthenticated(false);
    setAuthUser(null);
    notify('You have been signed out.', 'info');
    navigate({ page: 'login' });
  }, [navigate, notify]);

  const withLoader = useCallback(
    async <T,>(fn: () => Promise<T> | T, delayMs = 340): Promise<T> => {
      setIsLoading(true);
      try {
        const result = await fn();
        await new Promise((res) => window.setTimeout(res, delayMs));
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const updateDb = useCallback(
    (updater: (prev: CRMDatabase) => CRMDatabase, toastMsg?: string): boolean => {
      try {
        setDb((prev) => updater(prev));
        if (toastMsg) notify(toastMsg, 'success');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Operation failed.';
        notify(msg, 'error');
        return false;
      }
    },
    [notify]
  );

  const resetDemo = useCallback(() => {
    setIsLoading(true);
    window.setTimeout(() => {
      const fresh = crmService.resetToDemo();
      setDb(fresh);
      setIsLoading(false);
      notify('Sample agency records restored.', 'info');
    }, 500);
  }, [notify]);

  // Current user is either the authenticated user from backend or fallback to db user
  const currentUser: User = useMemo(() => {
    if (authUser) {
      return authUser;
    }
    return (
      db.users.find((u) => u.id === db.settings.currentUserId) ||
      db.users[0]
    );
  }, [authUser, db.users, db.settings.currentUserId]);

  const isAdmin = currentUser?.role === 'Admin';
  const isTelecaller = currentUser?.role === 'Telecaller';

  // Access control scoping: Admins and Telecallers see all properties & sellers
  const visibleProperties = useMemo(
    () =>
      isAdmin || isTelecaller
        ? db.properties
        : db.properties.filter((p) => p.assignedAgentId === currentUser.id),
    [db.properties, isAdmin, isTelecaller, currentUser.id]
  );

  const visibleSellers = useMemo(
    () =>
      isAdmin || isTelecaller
        ? db.sellers
        : db.sellers.filter((s) => s.assignedAgentId === currentUser.id),
    [db.sellers, isAdmin, isTelecaller, currentUser.id]
  );

  const visibleLeads = useMemo(
    () =>
      isAdmin
        ? db.leads
        : db.leads.filter((l) => l.assignedAgentId === currentUser.id),
    [db.leads, isAdmin, currentUser.id]
  );

  const visibleFollowUps = useMemo(
    () =>
      isAdmin
        ? db.followUps
        : db.followUps.filter((f) => f.assignedAgentId === currentUser.id),
    [db.followUps, isAdmin, currentUser.id]
  );

  const visibleDeals = useMemo(
    () =>
      isAdmin
        ? db.deals
        : db.deals.filter((d) => d.assignedAgentId === currentUser.id),
    [db.deals, isAdmin, currentUser.id]
  );

  const value: CRMContextValue = {
    db,
    currentUser,
    isAuthenticated,
    isAdmin,
    route,
    navigate,
    login,
    logout,
    isLoading,
    setIsLoading,
    withLoader,
    toasts,
    notify,
    dismissToast,
    updateDb,
    resetDemo,
    refreshDb,
    visibleProperties,
    visibleSellers,
    visibleLeads,
    visibleFollowUps,
    visibleDeals,
  };

  return <CRMContext.Provider value={value}>{children}</CRMContext.Provider>;
};

export function useCRM(): CRMContextValue {
  const ctx = useContext(CRMContext);
  if (!ctx) throw new Error('useCRM must be used within CRMProvider');
  return ctx;
}
