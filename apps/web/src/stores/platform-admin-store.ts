import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PlatformAdminState {
  adminId: string;
  email: string;
  displayName: string;
  setOperator: (t: { adminId: string; email: string; displayName: string }) => void;
  clearOperator: () => void;
}

export const usePlatformAdminStore = create<PlatformAdminState>()(
  persist(
    (set) => ({
      adminId: "",
      email: "",
      displayName: "",
      setOperator: (t) => set(t),
      clearOperator: () => set({ adminId: "", email: "", displayName: "" }),
    }),
    { name: "erp-platform-admin" },
  ),
);
