import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  tenantId: string;
  userId: string;
  tenantSlug: string;
  email: string;
  setSession: (t: {
    tenantId: string;
    userId: string;
    tenantSlug: string;
    email: string;
  }) => void;
  clearSession: () => void;
}

const envTenant = import.meta.env.VITE_TENANT_ID ?? "";
const envUser = import.meta.env.VITE_USER_ID ?? "";
const envSlug = import.meta.env.VITE_TENANT_SLUG ?? "";

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      tenantId: envTenant,
      userId: envUser,
      tenantSlug: envSlug,
      email: "",
      setSession: (t) =>
        set({
          tenantId: t.tenantId,
          userId: t.userId,
          tenantSlug: t.tenantSlug,
          email: t.email,
        }),
      clearSession: () =>
        set({ tenantId: "", userId: "", tenantSlug: "", email: "" }),
    }),
    { name: "erp-session" },
  ),
);
