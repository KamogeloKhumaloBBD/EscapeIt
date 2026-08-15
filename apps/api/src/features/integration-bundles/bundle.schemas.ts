import { z } from "zod";

export const bundleIdParameterSchema = z.uuid(
  "The bundle identifier is invalid.",
);

export const createBundleSchema = z.object({
  description: z.string().trim().min(1).max(500).optional(),
  name: z.string().trim().min(1).max(120),
});

export const updateBundleSchema = z.object({
  description: z.string().trim().min(1).max(500).nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

const providerKeySchema = z.string().min(1).max(63);

export const replaceBundleProvidersSchema = z.object({
  providers: z.array(providerKeySchema).max(50),
});

export const replaceBundleCustomMcpServersSchema = z.object({
  serverIds: z.array(z.uuid()).max(10),
});
