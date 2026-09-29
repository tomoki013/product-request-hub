import { z } from "zod";
import {
  LEVELS,
  PRIORITIES,
  REQUEST_LINK_TYPES,
  REQUEST_SOURCE_TYPES,
  REQUEST_STATUSES,
  USER_ROLES,
} from "./constants";

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 4000;

const uuid = z.uuid();

export const requestStatusSchema = z.enum(REQUEST_STATUSES);
export const requestSourceTypeSchema = z.enum(REQUEST_SOURCE_TYPES);
export const levelSchema = z.enum(LEVELS);
export const prioritySchema = z.enum(PRIORITIES);
export const userRoleSchema = z.enum(USER_ROLES);

/**
 * Where a request came from. The project is never taken from the client:
 * for Discord it is resolved from the (guild, channel) mapping on the server.
 */
export const discordOriginSchema = z.object({
  provider: z.literal("discord"),
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  sourceMessageId: z.string().min(1).optional(),
  sourceMessageUrl: z.url().optional(),
});

export const webOriginSchema = z.object({
  provider: z.literal("web"),
  projectId: uuid,
});

export const createRequestSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  description: z.string().trim().min(1).max(DESCRIPTION_MAX),
  sourceType: requestSourceTypeSchema.optional(),
  origin: z.discriminatedUnion("provider", [discordOriginSchema, webOriginSchema]),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const updateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX),
    description: z.string().trim().min(1).max(DESCRIPTION_MAX),
    status: requestStatusSchema,
    priority: prioritySchema.nullable(),
    impact: levelSchema.nullable(),
    effort: levelSchema.nullable(),
    assigneeId: uuid.nullable(),
    targetReleaseId: uuid.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;

export const addSourceSchema = z.object({
  sourceType: requestSourceTypeSchema,
  note: z.string().trim().max(1000).optional(),
});
export type AddSourceInput = z.infer<typeof addSourceSchema>;

export const mergeDuplicateSchema = z.object({
  duplicateOfId: uuid,
});

export const addLinkSchema = z.object({
  linkType: z.enum(REQUEST_LINK_TYPES),
  url: z.url(),
  label: z.string().trim().max(200).optional(),
});
export type AddLinkInput = z.infer<typeof addLinkSchema>;

export const listRequestsQuerySchema = z.object({
  status: requestStatusSchema.optional(),
  projectId: uuid.optional(),
  priority: prioritySchema.optional(),
  assigneeId: uuid.optional(),
  q: z.string().trim().max(200).optional(),
  includeDuplicates: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and hyphens");

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slugSchema,
});
export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: slugSchema,
    isActive: z.boolean(),
  })
  .partial();

export const createReleaseSchema = z.object({
  projectId: uuid,
  name: z.string().trim().min(1).max(100),
});

export const createChannelMappingSchema = z.object({
  projectId: uuid,
  discordGuildId: z.string().trim().min(1),
  discordChannelId: z.string().trim().min(1),
  requestEnabled: z.boolean().default(true),
});
export const updateChannelMappingSchema = z
  .object({
    projectId: uuid,
    requestEnabled: z.boolean(),
  })
  .partial();

export const createDiscordIntegrationSchema = z.object({
  discordGuildId: z.string().trim().min(1),
  name: z.string().trim().max(100).optional(),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  role: userRoleSchema,
});
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    // Lets an admin give a Discord-provisioned user an email for web sign-in.
    email: z.email().nullable(),
    role: userRoleSchema,
  })
  .partial();
