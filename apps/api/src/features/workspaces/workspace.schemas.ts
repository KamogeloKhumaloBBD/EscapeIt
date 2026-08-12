import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a workspace name.")
    .max(120, "Workspace names must be 120 characters or fewer."),
});

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use dates in YYYY-MM-DD format.");

const providerSchema = z
  .string()
  .max(63)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, "The provider is invalid.");

const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: "The time zone is invalid." },
  )
  .default("UTC");

const analyticsFilterShape = {
  end: dateOnlySchema.optional(),
  membershipId: z.string().min(1).max(128).optional(),
  provider: providerSchema.optional(),
  start: dateOnlySchema.optional(),
  timeZone: timeZoneSchema,
};

function validateDatePair(
  value: { end?: string | undefined; start?: string | undefined },
  context: z.RefinementCtx,
): void {
  if ((value.start === undefined) !== (value.end === undefined)) {
    context.addIssue({
      code: "custom",
      message: "Provide both start and end dates, or omit both.",
    });
  }
}

export const workspaceAnalyticsQuerySchema = z
  .object(analyticsFilterShape)
  .superRefine(validateDatePair);

export const workspaceAnalyticsRankingQuerySchema = z
  .object({
    ...analyticsFilterShape,
    dimension: z.enum(["tool", "member"]),
    direction: z.enum(["asc", "desc"]).default("desc"),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().nonnegative().default(0),
    query: z.string().trim().max(120).default(""),
    sort: z.enum(["calls", "failures", "success-rate"]).default("calls"),
  })
  .superRefine(validateDatePair);
