import type { FormEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck, UserCog, UserX } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSessionStore } from "@/stores/session-store";

interface TenantUser {
  id: string;
  email: string;
  displayName: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  isActive: boolean;
  createdAt: string;
}

interface UsersResponse {
  data: TenantUser[];
}

interface MeResponse {
  data: { user: { id: string; role: string } };
}

const labelClass = "text-xs font-medium text-muted-foreground";
const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function TeamPage(): ReactElement {
  const qc = useQueryClient();
  const currentUserId = useSessionStore((s) => s.userId);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<TenantUser | null>(null);

  const me = useQuery({
    queryKey: ["account-me"],
    queryFn: () => apiFetch<MeResponse>("/v1/account/me"),
  });

  const users = useQuery({
    queryKey: ["team-users"],
    queryFn: () => apiFetch<UsersResponse>("/v1/team"),
  });

  const myRole = me.data?.data?.user?.role ?? "MEMBER";
  const canManage = myRole === "OWNER" || myRole === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
          <h1 className="text-xl font-semibold">Team & roles</h1>
          <p className="text-sm text-muted-foreground">
            Manage who can sign in and what they can do.
          </p>
        </div>
        {canManage && (
          <Button type="button" onClick={() => setOpenCreate(true)}>
            <Plus className="mr-1 h-4 w-4" /> Invite user
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  Loading users…
                </td>
              </tr>
            )}
            {users.isError && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-red-400">
                  {(users.error as Error).message}
                </td>
              </tr>
            )}
            {(users.data?.data ?? []).map((u) => (
              <tr key={u.id} className={u.isActive ? "" : "opacity-60"}>
                <td className="px-4 py-3 font-medium">
                  {u.displayName}
                  {u.id === currentUserId && (
                    <span className="ml-2 rounded bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                      You
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {u.email}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase">
                    {u.role === "OWNER" && <ShieldCheck className="h-3 w-3" />}
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {u.isActive ? (
                    <span className="text-emerald-400">Active</span>
                  ) : (
                    <span className="text-muted-foreground">Disabled</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage && (
                    <Button
                      variant="subtle"
                      size="sm"
                      type="button"
                      onClick={() => setEditing(u)}
                    >
                      <UserCog className="mr-1 h-3 w-3" /> Edit
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {users.data?.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateUserDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        canMakeOwner={myRole === "OWNER"}
        onSuccess={() => void qc.invalidateQueries({ queryKey: ["team-users"] })}
      />

      <EditUserDialog
        user={editing}
        currentUserId={currentUserId}
        currentRole={myRole}
        onClose={() => setEditing(null)}
        onSuccess={() => void qc.invalidateQueries({ queryKey: ["team-users"] })}
      />
    </div>
  );
}

function CreateUserDialog(props: {
  open: boolean;
  onClose: () => void;
  canMakeOwner: boolean;
  onSuccess: () => void;
}): ReactElement {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"OWNER" | "ADMIN" | "MEMBER">("MEMBER");

  const mut = useMutation({
    mutationFn: (vars: {
      email: string;
      displayName: string;
      password: string;
      role: string;
    }) =>
      apiFetch<{ data: TenantUser }>("/v1/team", {
        method: "POST",
        body: JSON.stringify(vars),
      }),
    onSuccess: () => {
      props.onSuccess();
      setEmail("");
      setDisplayName("");
      setPassword("");
      setRole("MEMBER");
      props.onClose();
    },
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    mut.mutate({ email, displayName, password, role });
  };

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Invite a workspace user</DialogTitle>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className={labelClass}>Display name</label>
            <input
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Email</label>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Temporary password (min 10)</label>
            <input
              type="text"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              required
            />
            <p className="text-[10px] text-muted-foreground">
              Share securely. The user can change it from their account page.
            </p>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Role</label>
            <select
              className={inputClass}
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              {props.canMakeOwner && <option value="OWNER">Owner</option>}
            </select>
          </div>
          {mut.isError && (
            <p className="text-sm text-red-400">{(mut.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="subtle" type="button" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              Create user
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog(props: {
  user: TenantUser | null;
  currentUserId: string;
  currentRole: string;
  onClose: () => void;
  onSuccess: () => void;
}): ReactElement | null {
  const u = props.user;
  const [displayName, setDisplayName] = useState(u?.displayName ?? "");
  const [role, setRole] = useState<"OWNER" | "ADMIN" | "MEMBER">(u?.role ?? "MEMBER");
  const [isActive, setIsActive] = useState(u?.isActive ?? true);
  const [resetPw, setResetPw] = useState("");

  useEffect(() => {
    if (u) {
      setDisplayName(u.displayName);
      setRole(u.role);
      setIsActive(u.isActive);
      setResetPw("");
    }
  }, [u]);

  const mut = useMutation({
    mutationFn: (vars: {
      displayName?: string;
      role?: string;
      isActive?: boolean;
      password?: string;
    }) =>
      apiFetch<{ data: TenantUser }>(`/v1/team/${u?.id}`, {
        method: "PATCH",
        body: JSON.stringify(vars),
      }),
    onSuccess: () => {
      props.onSuccess();
      props.onClose();
    },
  });

  const deactivate = useMutation({
    mutationFn: () =>
      apiFetch<{ data: { id: string } }>(`/v1/team/${u?.id}`, { method: "DELETE" }),
    onSuccess: () => {
      props.onSuccess();
      props.onClose();
    },
  });

  if (!u) return null;

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    mut.mutate({
      displayName,
      role,
      isActive,
      ...(resetPw ? { password: resetPw } : {}),
    });
  };

  const isSelf = u.id === props.currentUserId;
  const canChangeRole = props.currentRole === "OWNER";

  return (
    <Dialog open={Boolean(u)} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Edit {u.email}</DialogTitle>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className={labelClass}>Display name</label>
            <input
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Role</label>
            <select
              className={inputClass}
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              disabled={!canChangeRole}
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="OWNER">Owner</option>
            </select>
            {!canChangeRole && (
              <p className="text-[10px] text-muted-foreground">
                Only owners can change roles.
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={isSelf}
            />
            <span>Active</span>
          </label>
          <div className="space-y-1">
            <label className={labelClass}>Reset password (optional)</label>
            <input
              type="text"
              className={inputClass}
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              minLength={10}
              placeholder="Leave empty to keep existing"
            />
          </div>
          {mut.isError && (
            <p className="text-sm text-red-400">{(mut.error as Error).message}</p>
          )}
          {deactivate.isError && (
            <p className="text-sm text-red-400">
              {(deactivate.error as Error).message}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 pt-2">
            {!isSelf && (
              <Button
                variant="subtle"
                type="button"
                onClick={() => deactivate.mutate()}
                disabled={deactivate.isPending}
              >
                <UserX className="mr-1 h-3 w-3" /> Deactivate
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="subtle" type="button" onClick={props.onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={mut.isPending}>
                Save
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
