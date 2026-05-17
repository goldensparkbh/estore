import type { ReactElement } from "react";
import { cn } from "@/lib/utils";
import type { SubscriptionStatus } from "@/lib/platform-types";

const styles: Record<SubscriptionStatus, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-400",
  PAST_DUE: "bg-amber-500/15 text-amber-400",
  CANCELLED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-red-500/15 text-red-400",
};

export function StatusBadge({
  status,
  className,
}: {
  status: SubscriptionStatus | string;
  className?: string;
}): ReactElement {
  const key = status as SubscriptionStatus;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        styles[key] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}
