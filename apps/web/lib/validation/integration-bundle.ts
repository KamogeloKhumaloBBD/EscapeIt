import { z } from "zod";

const connectionStatusSchema = z.enum(["connected", "disconnected", "error"]);

export const bundleProviderSchema = z.object({
  displayName: z.string(),
  provider: z.string(),
  status: connectionStatusSchema,
});

export const bundleSchema = z.object({
  createdAt: z.iso.datetime(),
  creator: z.object({
    email: z.string(),
    membershipId: z.string(),
    name: z.string(),
  }),
  description: z.string().nullable(),
  customMcpServers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: connectionStatusSchema,
    }),
  ),
  id: z.string(),
  name: z.string(),
  permissions: z.object({
    canDelete: z.boolean(),
    canEdit: z.boolean(),
  }),
  providers: z.array(bundleProviderSchema),
  updatedAt: z.iso.datetime(),
});

export const bundleListSchema = z.array(bundleSchema);

export const bundleNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name for this bundle.")
  .max(120, "Bundle names must be 120 characters or fewer.");

export const bundleDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Descriptions must be 500 characters or fewer.");

export type Bundle = z.infer<typeof bundleSchema>;
export type BundleProvider = z.infer<typeof bundleProviderSchema>;
