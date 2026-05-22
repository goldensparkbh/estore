import { lazy, Suspense, type ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes, Outlet } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { LandingPage } from "@/pages/landing-page";
import { LoginPage } from "@/pages/login-page";
import { SignupPage } from "@/pages/signup-page";
import { ForgotPasswordPage } from "@/pages/forgot-password-page";
import { ResetPasswordPage } from "@/pages/reset-password-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { PlatformLoginPage } from "@/pages/platform-login-page";
import { PlatformShell } from "@/components/layout/platform-shell";
import { RequirePlatformAdmin } from "@/components/platform/require-platform-admin";
import { DashboardPage } from "@/pages/dashboard-page";
import { ReferencePage } from "@/pages/reference-page";
import { SessionPage } from "@/pages/session-page";
import { BillingPage } from "@/pages/billing-page";
import { AccountPage } from "@/pages/account-page";
import { TeamPage } from "@/pages/team-page";
import { CheckoutReturnPage } from "@/pages/checkout-return-page";
import { useSessionStore } from "@/stores/session-store";

const InventoryPage = lazy(() =>
  import("@/pages/inventory-page").then((m) => ({ default: m.InventoryPage })),
);
const PosPage = lazy(() =>
  import("@/pages/pos-page").then((m) => ({ default: m.PosPage })),
);
const HrPage = lazy(() =>
  import("@/pages/hr-page").then((m) => ({ default: m.HrPage })),
);

const PlatformDashboardPage = lazy(() =>
  import("@/pages/platform/platform-dashboard-page").then((m) => ({
    default: m.PlatformDashboardPage,
  })),
);
const PlatformTenantsPage = lazy(() =>
  import("@/pages/platform/platform-tenants-page").then((m) => ({
    default: m.PlatformTenantsPage,
  })),
);
const PlatformSubscriptionsPage = lazy(() =>
  import("@/pages/platform/platform-subscriptions-page").then((m) => ({
    default: m.PlatformSubscriptionsPage,
  })),
);
const PlatformPlansPage = lazy(() =>
  import("@/pages/platform/platform-plans-page").then((m) => ({
    default: m.PlatformPlansPage,
  })),
);
const PlatformTenantDetailPage = lazy(() =>
  import("@/pages/platform/platform-tenant-detail-page").then((m) => ({
    default: m.PlatformTenantDetailPage,
  })),
);
const PlatformAuditPage = lazy(() =>
  import("@/pages/platform/platform-audit-page").then((m) => ({
    default: m.PlatformAuditPage,
  })),
);
const PlatformSettingsPage = lazy(() =>
  import("@/pages/platform/platform-settings-page").then((m) => ({
    default: m.PlatformSettingsPage,
  })),
);

function RequireTenant(): ReactElement {
  const tenantId = useSessionStore((s) => s.tenantId);
  if (!tenantId) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

function RouteFallback(): ReactElement {
  return (
    <div className="flex h-full items-center justify-center p-12 text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

export function App(): ReactElement {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
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
              <Route path="billing/return" element={<CheckoutReturnPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="team" element={<TeamPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
