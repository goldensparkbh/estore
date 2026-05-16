import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  theme: "light" | "dark";
  toggleSidebar: () => void;
  setCommandOpen: (open: boolean) => void;
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarCollapsed: false,
  commandOpen: false,
  theme: (typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "dark"
    : "light") as "light" | "dark",
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
  setCommandOpen: (open) => set({ commandOpen: open }),
  setTheme: (theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    set({ theme: next });
  },
}));
