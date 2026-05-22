import type { ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import {
  Box,
  Building2,
  CreditCard,
  LayoutDashboard,
  Receipt,
  Settings,
  UserCircle,
  Users,
} from "lucide-react";
import { Command } from "cmdk";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useUiStore } from "@/stores/ui-store";

const items: { label: string; path: string; icon: typeof LayoutDashboard }[] = [
  { label: "Dashboard", path: "/app/dashboard", icon: LayoutDashboard },
  { label: "Inventory & warehouses", path: "/app/inventory", icon: Box },
  { label: "Point of Sale", path: "/app/pos", icon: CreditCard },
  { label: "HR & payroll", path: "/app/hr", icon: Users },
  { label: "Billing & subscription", path: "/app/billing", icon: Receipt },
  { label: "Team & roles", path: "/app/team", icon: Users },
  { label: "Account & workspace", path: "/app/account", icon: UserCircle },
  { label: "Reference · currencies", path: "/app/reference", icon: Building2 },
  { label: "Dev session headers", path: "/app/session", icon: Settings },
];

export function CommandPalette(): ReactElement {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command className="rounded-xl border border-border bg-card text-foreground">
          <Command.Input
            placeholder="Jump to module, action, or record..."
            className="h-11 w-full border-b border-border bg-transparent px-4 text-sm outline-none"
          />
          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches — try another keyword.
            </Command.Empty>
            {items.map((item) => (
              <Command.Item
                key={item.path}
                value={item.label}
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-muted"
                onSelect={() => {
                  navigate(item.path);
                  setOpen(false);
                }}
              >
                <item.icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                {item.label}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
