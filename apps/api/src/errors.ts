import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid_transition"
  | "channel_not_mapped";

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid_transition: 422,
  channel_not_mapped: 422,
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  get status(): ContentfulStatusCode {
    return STATUS[this.code];
  }
}

export const notFound = (what: string) => new AppError("not_found", `${what} not found`);
export const forbidden = (message = "You do not have permission to perform this action") =>
  new AppError("forbidden", message);
