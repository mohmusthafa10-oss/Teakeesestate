/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { InfinityPreloader } from './components/common/InfinityPreloader';
import { Sidebar } from './components/common/Sidebar';
import { TopNav } from './components/common/TopNav';
import { ToastStack } from './components/common/UIPrimitives';
import { CRMProvider, useCRM } from './context/CRMContext';
import { AddSellerPropertyPage } from './pages/AddSellerPropertyPage';
import { DashboardPage } from './pages/DashboardPage';
import { DealsPage } from './pages/DealsPage';
import { FollowUpsPage } from './pages/FollowUpsPage';
import { InvestmentsPage } from './pages/InvestmentsPage';
import { LeadProfilePage } from './pages/LeadProfilePage';
import { LeadsPage } from './pages/LeadsPage';
import { PropertiesPage } from './pages/PropertiesPage';
import { PropertyProfilePage } from './pages/PropertyProfilePage';
import { RentalsPage } from './pages/RentalsPage';
import { ReportsPage } from './pages/ReportsPage';
import { RunningPropertiesPage } from './pages/RunningPropertiesPage';
import { SellerProfilePage } from './pages/SellerProfilePage';
import { SellersPage } from './pages/SellersPage';
import { SettingsPage } from './pages/SettingsPage';

const CRMWorkspace: React.FC = () => {
  const { route, isLoading } = useCRM();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const renderPage = () => {
    switch (route.page) {
      case 'dashboard':
        return <DashboardPage />;
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

export default function App() {
  return (
    <CRMProvider>
      <CRMWorkspace />
    </CRMProvider>
  );
}
