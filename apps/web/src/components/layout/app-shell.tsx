import type { ReactElement } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { TenantThemeSync } from "@/components/theme-sync";

export function AppShell(): ReactElement {
  return (
    <div className="flex min-h-screen bg-background">
      <TenantThemeSync />
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center border-b border-border bg-background/80 px-6 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Workspace</p>
            <h1 className="truncate text-lg font-semibold leading-tight">Operational console</h1>
          </div>
          <kbd className="hidden rounded-md border border-border bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground sm:inline">
            Ctrl K
          </kbd>
        </header>
        <div className="flex-1 px-6 py-6">
          <Outlet />
        </div>
      </main>
      <CommandPalette />
    </div>
  );
}
