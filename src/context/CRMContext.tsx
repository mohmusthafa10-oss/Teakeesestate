import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { crmService } from '../services/crmService';
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
  logout: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  withLoader: <T>(fn: () => Promise<T> | T, delayMs?: number) => Promise<T>;
  toasts: ToastMessage[];
  notify: (message: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;
  updateDb: (updater: (prev: CRMDatabase) => CRMDatabase, toastMsg?: string) => boolean;
  resetDemo: () => void;
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
  'submissions',
  'portfolio-publishing',
  'audit-logs',
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
  const { crmUser, authStatus, signOutUser } = useAuth();
  const [db, setDb] = useState<CRMDatabase>(() => crmService.getDatabase());
  const [route, setRoute] = useState<RouteState>(() => parseHashToRoute());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const isAuthenticated = authStatus === 'authenticated' && Boolean(crmUser);

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

  // Sync document title with configurable agency name
  useEffect(() => {
    document.title = `${db.settings.agencyName} — Real Estate CRM`;
  }, [db.settings.agencyName]);

  // Listen to browser hash back/forward
  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHashToRoute());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const logout = useCallback(() => {
    void signOutUser();
    notify('You have been signed out.', 'info');
  }, [signOutUser, notify]);

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

  const currentUser: User = useMemo(() => {
    if (crmUser) {
      const matchedLegacy = db.users.find(
        (u) => u.email.toLowerCase() === crmUser.email.toLowerCase()
      );
      return {
        id: matchedLegacy?.id || `usr-${crmUser.id}`,
        name: crmUser.name,
        email: crmUser.email,
        phone: crmUser.phone,
        role: crmUser.role === 'ADMIN' ? 'Admin' : 'Agent',
        designation: crmUser.designation,
        active: crmUser.active,
        created_at: matchedLegacy?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return db.users.find((u) => u.id === db.settings.currentUserId) || db.users[0];
  }, [crmUser, db.users, db.settings.currentUserId]);

  const isAdmin = crmUser?.role === 'ADMIN';

  const visibleProperties = useMemo(
    () =>
      isAdmin
        ? db.properties
        : db.properties.filter((p) => p.assignedAgentId === currentUser.id),
    [db.properties, isAdmin, currentUser.id]
  );

  const visibleSellers = useMemo(
    () =>
      isAdmin
        ? db.sellers
        : db.sellers.filter((s) => s.assignedAgentId === currentUser.id),
    [db.sellers, isAdmin, currentUser.id]
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
    logout,
    isLoading,
    setIsLoading,
    withLoader,
    toasts,
    notify,
    dismissToast,
    updateDb,
    resetDemo,
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
