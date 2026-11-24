/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { InfinityPreloader } from './components/common/InfinityPreloader';
import { Sidebar } from './components/common/Sidebar';
import { TopNav } from './components/common/TopNav';
import { ToastStack } from './components/common/UIPrimitives';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CRMProvider, useCRM } from './context/CRMContext';
import { AddSellerPropertyPage } from './pages/AddSellerPropertyPage';
import { AdminSubmissionsPage } from './pages/AdminSubmissionsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DealsPage } from './pages/DealsPage';
import { FollowUpsPage } from './pages/FollowUpsPage';
import { InvestmentsPage } from './pages/InvestmentsPage';
import { LeadProfilePage } from './pages/LeadProfilePage';
import { LeadsPage } from './pages/LeadsPage';
import { PortfolioPublishingPage } from './pages/PortfolioPublishingPage';
import { ProfilePage } from './pages/ProfilePage';
import { PropertiesPage } from './pages/PropertiesPage';
import { PropertyProfilePage } from './pages/PropertyProfilePage';
import { PublicLandingPage } from './pages/PublicLandingPage';
import { PublicPropertyDetailPage } from './pages/PublicPropertyDetailPage';
import { PublicSubmitPropertyPage } from './pages/PublicSubmitPropertyPage';
import { RentalsPage } from './pages/RentalsPage';
import { ReportsPage } from './pages/ReportsPage';
import { RunningPropertiesPage } from './pages/RunningPropertiesPage';
import { SellerProfilePage } from './pages/SellerProfilePage';
import { SellersPage } from './pages/SellersPage';
import { SettingsPage } from './pages/SettingsPage';
import { StaffSignInPage } from './pages/StaffSignInPage';
import { TelecallerWorkspacePage } from './pages/TelecallerWorkspacePage';

function normalizePath(raw: string): string {
  const clean = raw.split('?')[0].replace(/\/+$/, '');
  return clean || '/';
}

const CRMWorkspace: React.FC<{ onNavigatePath: (path: string) => void }> = ({
  onNavigatePath,
}) => {
  const { crmUser } = useAuth();
  const { route, isLoading } = useCRM();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const isAdmin = crmUser?.role === 'ADMIN';

  const renderPage = () => {
    switch (route.page) {
      case 'login':
      case 'dashboard':
        return <DashboardPage />;
      case 'submissions':
        return isAdmin ? (
          <AdminSubmissionsPage />
        ) : (
          <PortfolioPublishingPage onNavigatePath={onNavigatePath} />
        );
      case 'portfolio-publishing':
        return <PortfolioPublishingPage onNavigatePath={onNavigatePath} />;
      case 'audit-logs':
        return isAdmin ? <AuditLogsPage /> : <DashboardPage />;
      case 'profile':
        return <ProfilePage />;
      case 'properties':
        return <PropertiesPage />;
      case 'property-detail':
        return <PropertyProfilePage />;
      case 'register-property':
        return <AddSellerPropertyPage />;
      case 'leads':
        return <LeadsPage />;
      case 'lead-detail':
        return <LeadProfilePage />;
      case 'sellers':
        return <SellersPage />;
      case 'seller-detail':
        return <SellerProfilePage />;
      case 'running-properties':
        return <RunningPropertiesPage />;
      case 'follow-ups':
        return <FollowUpsPage />;
      case 'deals':
        return <DealsPage />;
      case 'investments':
        return <InvestmentsPage />;
      case 'rentals':
        return <RentalsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F0E8] text-[#20251F]">
      <InfinityPreloader visible={isLoading} />
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onNavigatePath={onNavigatePath}
      />
      <TopNav onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
      <div className="lg:pl-64">
        <main className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-22 pb-14">
          {renderPage()}
        </main>
      </div>
      <ToastStack />
    </div>
  );
};

const AppRouter: React.FC = () => {
  const { authStatus, crmUser } = useAuth();
  const [pathname, setPathname] = useState<string>(() =>
    normalizePath(window.location.pathname)
  );

  const navigatePath = useCallback((target: string) => {
    const clean = normalizePath(target);
    if (window.location.pathname !== clean) {
      window.history.pushState({}, '', clean);
    }
    setPathname(clean);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const handlePop = () => {
      setPathname(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Public Seller Submission Route (No login required)
  if (pathname === '/submit-property') {
    return <PublicSubmitPropertyPage onNavigatePath={navigatePath} />;
  }

  // Public Single Property Detail Route (Only published & approved)
  if (pathname.startsWith('/properties/')) {
    const idOrCode = decodeURIComponent(pathname.slice('/properties/'.length));
    return <PublicPropertyDetailPage idOrCode={idOrCode} onNavigatePath={navigatePath} />;
  }

  // Public Homepage Showcase (No login required)
  if (pathname === '/' && !window.location.hash.startsWith('#/')) {
    return <PublicLandingPage onNavigatePath={navigatePath} />;
  }

  // Staff / CRM / Telecaller Protected Routes
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#F1F0E8] text-[#20251F] flex flex-col items-center justify-center gap-3 text-xs text-[#77796F]">
        <Loader2 className="w-6 h-6 animate-spin text-[#064E3B]" />
        <span>Verifying Teakees CRM session...</span>
      </div>
    );
  }

  if (authStatus !== 'authenticated' || !crmUser) {
    return <StaffSignInPage onNavigatePath={navigatePath} />;
  }

  // TELECALLER STRICT ISOLATION: only property submission intake & own submission status
  if (crmUser.role === 'TELECALLER') {
    return <TelecallerWorkspacePage onNavigatePath={navigatePath} />;
  }

  return (
    <CRMProvider>
      <CRMWorkspace onNavigatePath={navigatePath} />
    </CRMProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
