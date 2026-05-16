import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface Emp {
  id: string;
  fullName: string;
  employeeNumber: string;
  email: string;
  jobTitle: string | null;
  baseSalary: string;
  salaryCurrency: string;
  department: { id: string; name: string; code: string } | null;
}

interface EmpResponse {
  data: Emp[];
}

export function HrPage(): ReactElement {
  const q = useQuery({
    queryKey: ["employees"],
    queryFn: () => apiFetch<EmpResponse>("/v1/hr/employees"),
  });

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Staff registry</p>
        <p className="text-xs text-muted-foreground">
          Attendance, leave policies, and payroll runs are fully modeled server-side.
        </p>
      </div>
      <div className="divide-y divide-border">
        {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {q.isError && <p className="p-4 text-sm text-red-400">{(q.error as Error).message}</p>}
        {(q.data?.data ?? []).map((e) => (
          <div key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{e.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {e.employeeNumber} · {e.email}
                {e.jobTitle ? ` · ${e.jobTitle}` : ""}
              </p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {e.baseSalary} {e.salaryCurrency}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
