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

export async function publicApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, window.location.origin);
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const problem = await parseProblem(res);
    const msg = problem?.detail ?? problem?.title ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
