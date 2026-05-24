import { create } from "zustand";
import { applyDocumentTheme, type UiTheme } from "@/lib/theme";

interface UiState {
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  theme: UiTheme;
  toggleSidebar: () => void;
  setCommandOpen: (open: boolean) => void;
  setTheme: (theme: UiTheme) => void;
  toggleTheme: () => UiTheme;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarCollapsed: false,
  commandOpen: false,
  theme: "light",
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
  setCommandOpen: (open) => set({ commandOpen: open }),
  setTheme: (theme) => {
    applyDocumentTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: UiTheme = get().theme === "dark" ? "light" : "dark";
    applyDocumentTheme(next);
    set({ theme: next });
    return next;
  },
}));
