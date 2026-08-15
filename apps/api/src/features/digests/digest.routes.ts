import { timingSafeEqual } from "node:crypto";

import { Router, type RequestHandler } from "express";

import { HttpError } from "../../errors";
import type { AuthenticatedLocals } from "../../http/authentication";
import type { createDigestService } from "./digest.service";

export interface DigestRouterDependencies {
  requireAuthentication: RequestHandler;
  /**
   * The shared secret the scheduler presents. Null leaves the scheduled route
   * unmounted entirely, so a deployment without a scheduler exposes no way to
   * trigger a run.
   */
  runSecret: string | null;
  service: ReturnType<typeof createDigestService>;
}

function correlationId(requestId: unknown): string {
  if (typeof requestId !== "string") {
    throw new HttpError(
      500,
      "INTERNAL_SERVER_ERROR",
      "An unexpected error occurred.",
    );
  }

  return requestId;
}

function matchesSecret(presented: string, expected: string): boolean {
  const presentedBytes = Buffer.from(presented);
  const expectedBytes = Buffer.from(expected);

  // Compare lengths first: timingSafeEqual throws on a mismatch rather than
  // returning false, and the length is not the secret.
  return (
    presentedBytes.length === expectedBytes.length &&
    timingSafeEqual(presentedBytes, expectedBytes)
  );
}

export function createDigestRouter({
  requireAuthentication,
  runSecret,
  service,
}: DigestRouterDependencies): Router {
  const router = Router();

  router.post("/send-now", requireAuthentication, async (request, response) => {
    const sent = await service.sendNow(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      correlationId(request.id),
    );
    response.status(202).json({ data: { sent } });
  });

  if (runSecret !== null) {
    router.post("/run", async (request, response) => {
      const header = request.get("authorization") ?? "";
      const presented = header.startsWith("Bearer ")
        ? header.slice("Bearer ".length)
        : "";

      if (!matchesSecret(presented, runSecret)) {
        throw new HttpError(401, "UNAUTHORIZED", "The request is not allowed.");
      }

      const result = await service.runScheduled(
        new Date(),
        correlationId(request.id),
      );
      response.status(200).json({ data: result });
    });
  }

  return router;
}
