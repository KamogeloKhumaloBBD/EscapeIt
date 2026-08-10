export interface PublicError {
  error: {
    code: string;
    message: string;
  };
}

export function toPublicError(_error: unknown): PublicError {
  return {
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  };
}
