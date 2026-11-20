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
      const token = localStorage.getItem('crm_access_token');
      if (!token) {
        if (isMounted) {
          setIsAuthenticated(false);
          setAuthUser(null);
          setIsLoading(false);
          if (window.location.hash !== '#/login') {
            navigate({ page: 'login' });
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
          if (parseHashToRoute().page === 'login') {
            navigate({ page: 'dashboard' });
          }
        }
      } catch (err) {
        apiClient.logout();
        if (isMounted) {
          setIsAuthenticated(false);
          setAuthUser(null);
          setIsLoading(false);
          navigate({ page: 'login' });
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
      if (!localStorage.getItem('crm_access_token') && parsed.page !== 'login') {
        navigate({ page: 'login' });
      } else {
        setRoute(parsed);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [navigate]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await apiClient.login(username, password);
      setAuthUser(res.user);
      setIsAuthenticated(true);
      notify(`Welcome back, ${res.user.name}!`, 'success');
      navigate({ page: 'dashboard' }, { showLoader: true });
    },
    [navigate, notify]
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

  // Access control scoping: Admins see everything; Agents see assigned records
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
