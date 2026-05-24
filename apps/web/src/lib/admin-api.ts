import { usePlatformAdminStore } from "../stores/platform-admin-store";

export async function adminApiFetch<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | undefined> },
): Promise<T> {
  const { query, ...rest } = init ?? {};
  const adminId = usePlatformAdminStore.getState().adminId;
  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    ...rest,
    headers: {
      "content-type": "application/json",
      "x-platform-admin-id": adminId,
      ...(rest.headers ?? {}),
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
