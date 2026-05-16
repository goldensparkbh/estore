import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";
import {
  Box,
  Building2,
  ChevronLeft,
  CreditCard,
  LayoutDashboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/ui-store";

const nav: { to: string; label: string; icon: typeof LayoutDashboard }[] = [
  { to: "/app/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/app/inventory", label: "Inventory", icon: Box },
  { to: "/app/pos", label: "Point of Sale", icon: CreditCard },
  { to: "/app/hr", label: "HR & Payroll", icon: Users },
  { to: "/app/billing", label: "Billing", icon: Receipt },
  { to: "/app/reference", label: "Currencies", icon: Building2 },
  { to: "/app/session", label: "Session", icon: Settings },
];

export function Sidebar(): ReactElement {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-card transition-all duration-200",
        collapsed ? "w-[72px]" : "w-[240px]",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-xs font-semibold tracking-tight text-primary">
          ERP
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">Control</p>
            <p className="truncate text-xs text-muted-foreground">Enterprise suite</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-2">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                collapsed && "justify-center px-0",
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {!collapsed && <ChevronLeft className="ml-auto h-3 w-3 -rotate-90 opacity-40" />}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <Button
          variant="subtle"
          className={cn("w-full justify-start gap-2", collapsed && "justify-center px-0")}
          type="button"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {!collapsed && <span className="text-xs font-medium">Theme</span>}
        </Button>
      </div>
    </aside>
  );
}
