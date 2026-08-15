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
      "The request body is invalid. Review it and try again.",
    );
  }

  if (databaseIsUnavailable(error)) {
    return new HttpError(
      503,
      "DATABASE_UNAVAILABLE",
      "The service is temporarily unavailable. Try again in a few minutes.",
    );
  }

  return new HttpError(
    500,
    "INTERNAL_SERVER_ERROR",
    "Something went wrong. Try again in a few minutes.",
  );
}

export function toPublicError(error: unknown): PublicError {
  const normalized = normalizeHttpError(error);

  return {
    error: {
      code: normalized.code,
      message: actionableErrorMessage(normalized),
    },
  };
}

export function actionableErrorMessage(error: HttpError): string {
  if (
    /\b(ask|check|choose|connect|contact|grant|reconnect|refresh|replace|resolve|review|select|sign in|start|try again|wait)\b/i.test(
      error.message,
    )
  ) {
    return error.message;
  }

  let nextStep: string;
  switch (error.status) {
    case 400:
      nextStep = "Review the information and try again.";
      break;
    case 401:
      nextStep = "Sign in again to continue.";
      break;
    case 403:
      nextStep = "Ask the appropriate owner or administrator to do this.";
      break;
    case 404:
      nextStep = "Refresh the page and verify that it still exists.";
      break;
    case 409:
      nextStep = "Resolve the current setup or conflict, then try again.";
      break;
    case 410:
      nextStep = "Ask the workspace owner for a replacement.";
      break;
    case 413:
    case 415:
      nextStep = "Choose a different item and try again.";
      break;
    case 429:
      nextStep = "Wait a moment, then try again.";
      break;
    default:
      nextStep =
        error.status >= 500
          ? "Wait a few minutes, then try again."
          : "Review the current state and try again.";
  }

  return `${error.message} ${nextStep}`;
}
