import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes, Outlet } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { LandingPage } from "@/pages/landing-page";
import { LoginPage } from "@/pages/login-page";
import { SignupPage } from "@/pages/signup-page";
import { PlatformLoginPage } from "@/pages/platform-login-page";
import { PlatformShell } from "@/components/layout/platform-shell";
import { RequirePlatformAdmin } from "@/components/platform/require-platform-admin";
import { PlatformDashboardPage } from "@/pages/platform/platform-dashboard-page";
import { PlatformTenantsPage } from "@/pages/platform/platform-tenants-page";
import { PlatformSubscriptionsPage } from "@/pages/platform/platform-subscriptions-page";
import { PlatformPlansPage } from "@/pages/platform/platform-plans-page";
import { PlatformTenantDetailPage } from "@/pages/platform/platform-tenant-detail-page";
import { PlatformAuditPage } from "@/pages/platform/platform-audit-page";
import { PlatformSettingsPage } from "@/pages/platform/platform-settings-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { InventoryPage } from "@/pages/inventory-page";
import { PosPage } from "@/pages/pos-page";
import { HrPage } from "@/pages/hr-page";
import { ReferencePage } from "@/pages/reference-page";
import { SessionPage } from "@/pages/session-page";
import { BillingPage } from "@/pages/billing-page";
import { useSessionStore } from "@/stores/session-store";

function RequireTenant(): ReactElement {
  const tenantId = useSessionStore((s) => s.tenantId);
  if (!tenantId) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

export function App(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/platform/login" element={<PlatformLoginPage />} />
        <Route path="/platform" element={<RequirePlatformAdmin />}>
          <Route element={<PlatformShell />}>
            <Route index element={<PlatformDashboardPage />} />
            <Route path="tenants" element={<PlatformTenantsPage />} />
            <Route path="tenants/:tenantId" element={<PlatformTenantDetailPage />} />
            <Route path="subscriptions" element={<PlatformSubscriptionsPage />} />
            <Route path="plans" element={<PlatformPlansPage />} />
            <Route path="audit" element={<PlatformAuditPage />} />
            <Route path="settings" element={<PlatformSettingsPage />} />
          </Route>
        </Route>
        <Route path="/app" element={<RequireTenant />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="pos" element={<PosPage />} />
            <Route path="hr" element={<HrPage />} />
            <Route path="reference" element={<ReferencePage />} />
            <Route path="session" element={<SessionPage />} />
            <Route path="billing" element={<BillingPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
