import { usePlatformAdminStore } from "../stores/platform-admin-store";

export async function adminApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const adminId = usePlatformAdminStore.getState().adminId;
  const url = new URL(path, window.location.origin);
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-platform-admin-id": adminId,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const ct = res.headers.get("content-type") ?? "";
    let msg = `HTTP ${res.status}`;
    if (ct.includes("application/problem+json")) {
      const p = (await res.json()) as { detail?: string; title?: string };
      msg = p.detail ?? p.title ?? msg;
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
