import type { ReactElement } from "react";
import { Outlet } from "react-router-dom";
import { PlatformSidebar } from "@/components/layout/platform-sidebar";

export function PlatformShell(): ReactElement {
  return (
    <div className="flex min-h-screen bg-background">
      <PlatformSidebar />
      <main className="min-w-0 flex-1 overflow-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
