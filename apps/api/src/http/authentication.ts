import type { RequestHandler } from "express";
import type { IncomingHttpHeaders } from "node:http";

import { HttpError } from "../errors";

export interface AuthenticatedUser {
  email: string;
  id: string;
  name: string;
}

export interface AuthenticatedLocals {
  authenticatedUser: AuthenticatedUser;
}

export interface AuthenticationDependencies {
  getSession: (headers: IncomingHttpHeaders) => Promise<{
    user: AuthenticatedUser;
  } | null>;
}

export function createRequireAuthentication({
  getSession,
}: AuthenticationDependencies): RequestHandler {
  return async (request, response, next) => {
    try {
      const session = await getSession(request.headers);

      if (session === null) {
        next(
          new HttpError(401, "UNAUTHENTICATED", "Authentication is required."),
        );
        return;
      }

      (response.locals as AuthenticatedLocals).authenticatedUser = session.user;
      next();
    } catch (error) {
      request.log.warn({ err: error }, "Unable to resolve auth session");
      next(
        new HttpError(
          503,
          "AUTHENTICATION_UNAVAILABLE",
          "Authentication is temporarily unavailable.",
        ),
      );
    }
  };
}
