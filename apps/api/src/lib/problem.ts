import type { FastifyReply } from "fastify";

/** RFC 7807 Problem Details */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly type?: string,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(detail ?? title);
    this.name = "AppError";
  }
}

export function sendProblem(reply: FastifyReply, problem: ProblemDetails): void {
  void reply
    .code(problem.status)
    .header("content-type", "application/problem+json; charset=utf-8")
    .send(problem);
}

export function problemFromError(err: unknown, instance?: string): ProblemDetails {
  if (err instanceof AppError) {
    return {
      type: err.type ?? "about:blank",
      title: err.title,
      status: err.status,
      detail: err.detail,
      instance,
      errors: err.errors,
    };
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return {
    type: "about:blank",
    title: "Internal Server Error",
    status: 500,
    detail: process.env.NODE_ENV === "development" ? message : undefined,
    instance,
  };
}
