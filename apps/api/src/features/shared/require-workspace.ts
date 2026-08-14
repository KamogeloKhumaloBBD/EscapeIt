import type { CurrentWorkspace } from "@context-layer/db";

import { HttpError } from "../../errors";

export function requireWorkspace(
  current: CurrentWorkspace | null,
): CurrentWorkspace {
  if (current === null) {
    throw new HttpError(
      404,
      "WORKSPACE_NOT_FOUND",
      "The user does not belong to a workspace.",
    );
  }

  return current;
}
