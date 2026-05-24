import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";
import {
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Layers,
  LogOut,
  Mail,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePlatformAdminStore } from "@/stores/platform-admin-store";

const nav = [
  { to: "/platform", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/platform/tenants", label: "Tenants", icon: Building2 },
  { to: "/platform/subscriptions", label: "Subscriptions", icon: CreditCard },
  { to: "/platform/plans", label: "Plans", icon: Layers },
  { to: "/platform/marketplace", label: "Marketplace", icon: ShoppingBag },
  { to: "/platform/audit", label: "Activity", icon: ClipboardList },
  { to: "/platform/settings", label: "Email", icon: Mail },
];

export function PlatformSidebar(): ReactElement {
  const displayName = usePlatformAdminStore((s) => s.displayName);
  const email = usePlatformAdminStore((s) => s.email);
  const clear = usePlatformAdminStore((s) => s.clearOperator);

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">ERP Platform</p>
        <p className="mt-1 truncate text-sm font-medium">{displayName || "Operator"}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t border-border p-2">
        <Button variant="ghost" className="w-full justify-start gap-2" type="button" asChild>
          <a href="/">Marketing site</a>
        </Button>
        <Button
          variant="subtle"
          className="w-full justify-start gap-2"
          type="button"
          onClick={() => clear()}
          asChild
        >
          <NavLink to="/platform/login">
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </NavLink>
        </Button>
      </div>
    </aside>
  );
}
