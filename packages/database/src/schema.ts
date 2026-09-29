import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  IDENTITY_PROVIDERS,
  LEVELS,
  ORIGIN_PROVIDERS,
  PRIORITIES,
  REQUEST_EVENT_TYPES,
  REQUEST_LINK_TYPES,
  REQUEST_SOURCE_TYPES,
  REQUEST_STATUSES,
  USER_ROLES,
} from "@prh/shared";

export const requestStatus = pgEnum("request_status", REQUEST_STATUSES);
export const requestSourceType = pgEnum("request_source_type", REQUEST_SOURCE_TYPES);
export const level = pgEnum("level", LEVELS);
export const priority = pgEnum("priority", PRIORITIES);
export const userRole = pgEnum("user_role", USER_ROLES);
export const originProvider = pgEnum("origin_provider", ORIGIN_PROVIDERS);
export const identityProvider = pgEnum("identity_provider", IDENTITY_PROVIDERS);
export const requestEventType = pgEnum("request_event_type", REQUEST_EVENT_TYPES);
export const requestLinkType = pgEnum("request_link_type", REQUEST_LINK_TYPES);
export const integrationStatus = pgEnum("integration_status", ["active", "disabled"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("projects_workspace_slug_key").on(t.workspaceId, t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    email: text("email"),
    role: userRole("role").notNull().default("requester"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_workspace_email_key").on(t.workspaceId, t.email)],
);

/** Discord user IDs, GitHub logins, Supabase auth IDs... are kept out of `users`. */
export const externalIdentities = pgTable(
  "external_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: identityProvider("provider").notNull(),
    externalUserId: text("external_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One identity per provider per user. The same Discord account may map to
    // users in several workspaces, so (provider, external_user_id) is not unique.
    uniqueIndex("external_identities_user_provider_key").on(t.userId, t.provider),
    index("external_identities_provider_external_idx").on(t.provider, t.externalUserId),
  ],
);

export const discordIntegrations = pgTable("discord_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  name: text("name"),
  discordGuildId: text("discord_guild_id").notNull().unique(),
  status: integrationStatus("status").notNull().default("active"),
  ...timestamps,
});

export const discordChannelMappings = pgTable(
  "discord_channel_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => discordIntegrations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    discordGuildId: text("discord_guild_id").notNull(),
    discordChannelId: text("discord_channel_id").notNull(),
    requestEnabled: boolean("request_enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("discord_channel_mappings_guild_channel_key").on(
      t.discordGuildId,
      t.discordChannelId,
    ),
  ],
);

export const releases = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("releases_project_name_key").on(t.projectId, t.name)],
);

/** Per-workspace counter backing REQ-0001, REQ-0002, ... */
export const requestNumberSequences = pgTable("request_number_sequences", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id),
  lastNumber: integer("last_number").notNull().default(0),
});

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    requestNumber: integer("request_number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: requestStatus("status").notNull().default("new"),
    priority: priority("priority"),
    impact: level("impact"),
    effort: level("effort"),
    requesterId: uuid("requester_id").references(() => users.id),
    assigneeId: uuid("assignee_id").references(() => users.id),
    targetReleaseId: uuid("target_release_id").references(() => releases.id),
    duplicateOfId: uuid("duplicate_of_id").references((): AnyPgColumn => requests.id),
    sourceProvider: originProvider("source_provider").notNull(),
    ...timestamps,
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("requests_workspace_number_key").on(t.workspaceId, t.requestNumber),
    index("requests_workspace_status_idx").on(t.workspaceId, t.status),
    index("requests_project_idx").on(t.projectId),
    index("requests_duplicate_of_idx")
      .on(t.duplicateOfId)
      .where(sql`${t.duplicateOfId} is not null`),
  ],
);

/** Where a request was filed (Discord message, Slack thread, web form...). */
export const requestOrigins = pgTable(
  "request_origins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    provider: originProvider("provider").notNull(),
    externalWorkspaceId: text("external_workspace_id"),
    externalChannelId: text("external_channel_id"),
    externalMessageId: text("external_message_id"),
    externalThreadId: text("external_thread_id"),
    externalUrl: text("external_url"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("request_origins_request_idx").on(t.requestId)],
);

/** One row per real occurrence of the demand. Request count = COUNT(request_sources). */
export const requestSources = pgTable(
  "request_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    sourceType: requestSourceType("source_type"),
    userId: uuid("user_id").references(() => users.id),
    externalUserId: text("external_user_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("request_sources_request_idx").on(t.requestId)],
);

/** Development artifacts linked to a request (GitHub Issue / PR / Release). */
export const requestLinks = pgTable(
  "request_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    linkType: requestLinkType("link_type").notNull(),
    url: text("url").notNull(),
    label: text("label"),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("request_links_request_idx").on(t.requestId)],
);

/** Activity timeline and audit log. Append-only. */
export const requestEvents = pgTable(
  "request_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    eventType: requestEventType("event_type").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    // clock_timestamp() (not now()) keeps events written in one transaction ordered.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [index("request_events_request_idx").on(t.requestId, t.createdAt)],
);
