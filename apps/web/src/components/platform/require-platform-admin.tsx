import type { ReactElement } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { usePlatformAdminStore } from "@/stores/platform-admin-store";

export function RequirePlatformAdmin(): ReactElement {
  const adminId = usePlatformAdminStore((s) => s.adminId);
  if (!adminId) {
    return <Navigate to="/platform/login" replace />;
  }
  return <Outlet />;
}
