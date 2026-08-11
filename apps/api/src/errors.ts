import { RepositoryError } from "@context-layer/db";

export interface PublicError {
  error: {
    code: string;
    message: string;
  };
}

export class HttpError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = status;
  }
}

function databaseIsUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const code = Reflect.get(error, "code");
  return (
    typeof code === "string" &&
    (code.startsWith("08") ||
      [
        "57P01",
        "57P02",
        "57P03",
        "ECONNREFUSED",
        "ECONNRESET",
        "ETIMEDOUT",
      ].includes(code))
  );
}

function isMalformedJson(error: unknown): boolean {
  if (!(error instanceof SyntaxError) || !("status" in error)) {
    return false;
  }

  return Reflect.get(error, "status") === 400;
}

export function normalizeHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof RepositoryError) {
    const mapping = {
      conflict: [409, "CONFLICT"],
      forbidden: [403, "FORBIDDEN"],
      invalid: [400, "INVALID_REQUEST"],
      not_found: [404, "NOT_FOUND"],
    } as const;
    const [status, code] = mapping[error.code];
    return new HttpError(status, code, error.message);
  }

  if (isMalformedJson(error)) {
    return new HttpError(
      400,
      "INVALID_REQUEST",
      "The request body must contain valid JSON.",
    );
  }

  if (databaseIsUnavailable(error)) {
    return new HttpError(
      503,
      "DATABASE_UNAVAILABLE",
      "The service is temporarily unavailable.",
    );
  }

  return new HttpError(
    500,
    "INTERNAL_SERVER_ERROR",
    "An unexpected error occurred.",
  );
}

export function toPublicError(error: unknown): PublicError {
  const normalized = normalizeHttpError(error);

  return {
    error: {
      code: normalized.code,
      message: normalized.message,
    },
  };
}
