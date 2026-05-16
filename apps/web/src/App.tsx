import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes, Outlet } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { LandingPage } from "@/pages/landing-page";
import { LoginPage } from "@/pages/login-page";
import { SignupPage } from "@/pages/signup-page";
import { PlatformLoginPage } from "@/pages/platform-login-page";
import { PlatformAdminPage } from "@/pages/platform-admin-page";
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
        <Route path="/platform" element={<PlatformAdminPage />} />
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
