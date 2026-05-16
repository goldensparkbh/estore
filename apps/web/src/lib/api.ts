import { useSessionStore } from "../stores/session-store";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
}

async function parseProblem(res: Response): Promise<ProblemDetails | null> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/problem+json")) {
    return null;
  }
  return (await res.json()) as ProblemDetails;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | undefined> },
): Promise<T> {
  const { query, ...rest } = init ?? {};
  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const tenantId = useSessionStore.getState().tenantId;
  const userId = useSessionStore.getState().userId;

  const res = await fetch(url.toString(), {
    ...rest,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenantId,
      "x-user-id": userId,
      ...(rest.headers ?? {}),
    },
  });

  if (!res.ok) {
    const problem = await parseProblem(res);
    const msg = problem?.detail ?? problem?.title ?? `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
