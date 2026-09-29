import {
  discordChannelMappings,
  discordIntegrations,
  externalIdentities,
  projects,
  releases,
  users,
  type Database,
} from "@prh/database";
import type {
  createChannelMappingSchema,
  createDiscordIntegrationSchema,
  createProjectSchema,
  createReleaseSchema,
  createUserSchema,
  updateChannelMappingSchema,
  updateProjectSchema,
  updateUserSchema,
} from "@prh/shared";
import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { AppError, notFound } from "../errors";
import { assertPermission, type Actor } from "./actor";

type In<T extends z.ZodType> = z.infer<T>;

/** Workspace configuration: projects, releases, Discord, users (design doc §35 Admin). */
export class AdminService {
  constructor(private readonly db: Database) {}

  // ---------------------------------------------------------------- projects

  listProjects(actor: Actor) {
    return this.db.query.projects.findMany({
      where: eq(projects.workspaceId, actor.workspaceId),
      orderBy: asc(projects.name),
    });
  }

  async createProject(actor: Actor, input: In<typeof createProjectSchema>) {
    assertPermission(actor, "admin:projects");
    try {
      const [row] = await this.db
        .insert(projects)
        .values({ ...input, workspaceId: actor.workspaceId })
        .returning();
      return row!;
    } catch (e) {
      throw uniqueViolation(e, "A project with this slug already exists");
    }
  }

  async updateProject(actor: Actor, id: string, input: In<typeof updateProjectSchema>) {
    assertPermission(actor, "admin:projects");
    const [row] = await this.db
      .update(projects)
      .set(input)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, actor.workspaceId)))
      .returning()
      .catch((e) => {
        throw uniqueViolation(e, "A project with this slug already exists");
      });
    if (!row) throw notFound("Project");
    return row;
  }

  // ---------------------------------------------------------------- releases

  listReleases(actor: Actor, projectId?: string) {
    return this.db.query.releases.findMany({
      where: and(
        eq(releases.workspaceId, actor.workspaceId),
        projectId ? eq(releases.projectId, projectId) : undefined,
      ),
      orderBy: asc(releases.createdAt),
    });
  }

  async createRelease(actor: Actor, input: In<typeof createReleaseSchema>) {
    assertPermission(actor, "request:set_target_release");
    await this.ownProject(actor, input.projectId);
    try {
      const [row] = await this.db
        .insert(releases)
        .values({ ...input, workspaceId: actor.workspaceId })
        .returning();
      return row!;
    } catch (e) {
      throw uniqueViolation(e, "A release with this name already exists");
    }
  }

  // ----------------------------------------------------------------- discord

  listDiscordIntegrations(actor: Actor) {
    assertPermission(actor, "admin:discord");
    return this.db.query.discordIntegrations.findMany({
      where: eq(discordIntegrations.workspaceId, actor.workspaceId),
      orderBy: asc(discordIntegrations.createdAt),
    });
  }

  async createDiscordIntegration(actor: Actor, input: In<typeof createDiscordIntegrationSchema>) {
    assertPermission(actor, "admin:discord");
    try {
      const [row] = await this.db
        .insert(discordIntegrations)
        .values({ workspaceId: actor.workspaceId, discordGuildId: input.discordGuildId, name: input.name })
        .returning();
      return row!;
    } catch (e) {
      throw uniqueViolation(e, "This Discord server is already connected");
    }
  }

  listChannelMappings(actor: Actor) {
    assertPermission(actor, "admin:discord");
    return this.db
      .select({
        id: discordChannelMappings.id,
        discordGuildId: discordChannelMappings.discordGuildId,
        discordChannelId: discordChannelMappings.discordChannelId,
        requestEnabled: discordChannelMappings.requestEnabled,
        projectId: projects.id,
        projectName: projects.name,
        integrationName: discordIntegrations.name,
        createdAt: discordChannelMappings.createdAt,
      })
      .from(discordChannelMappings)
      .innerJoin(projects, eq(projects.id, discordChannelMappings.projectId))
      .innerJoin(discordIntegrations, eq(discordIntegrations.id, discordChannelMappings.integrationId))
      .where(eq(discordChannelMappings.workspaceId, actor.workspaceId))
      .orderBy(asc(discordChannelMappings.createdAt));
  }

  async createChannelMapping(actor: Actor, input: In<typeof createChannelMappingSchema>) {
    assertPermission(actor, "admin:discord");
    await this.ownProject(actor, input.projectId);
    const integration = await this.db.query.discordIntegrations.findFirst({
      where: and(
        eq(discordIntegrations.discordGuildId, input.discordGuildId),
        eq(discordIntegrations.workspaceId, actor.workspaceId),
      ),
    });
    if (!integration) throw notFound("Discord integration for this server");
    try {
      const [row] = await this.db
        .insert(discordChannelMappings)
        .values({ ...input, integrationId: integration.id, workspaceId: actor.workspaceId })
        .returning();
      return row!;
    } catch (e) {
      throw uniqueViolation(e, "This channel is already mapped");
    }
  }

  async updateChannelMapping(actor: Actor, id: string, input: In<typeof updateChannelMappingSchema>) {
    assertPermission(actor, "admin:discord");
    if (input.projectId) await this.ownProject(actor, input.projectId);
    const [row] = await this.db
      .update(discordChannelMappings)
      .set(input)
      .where(and(eq(discordChannelMappings.id, id), eq(discordChannelMappings.workspaceId, actor.workspaceId)))
      .returning();
    if (!row) throw notFound("Channel mapping");
    return row;
  }

  async deleteChannelMapping(actor: Actor, id: string) {
    assertPermission(actor, "admin:discord");
    const [row] = await this.db
      .delete(discordChannelMappings)
      .where(and(eq(discordChannelMappings.id, id), eq(discordChannelMappings.workspaceId, actor.workspaceId)))
      .returning({ id: discordChannelMappings.id });
    if (!row) throw notFound("Channel mapping");
  }

  // ------------------------------------------------------------------- users

  /** Everyone can list users (needed for the assignee picker). */
  async listUsers(actor: Actor) {
    const rows = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        discordUserId: externalIdentities.externalUserId,
      })
      .from(users)
      .leftJoin(
        externalIdentities,
        and(eq(externalIdentities.userId, users.id), eq(externalIdentities.provider, "discord")),
      )
      .where(eq(users.workspaceId, actor.workspaceId))
      .orderBy(asc(users.name));
    return rows;
  }

  async createUser(actor: Actor, input: In<typeof createUserSchema>) {
    assertPermission(actor, "admin:users");
    try {
      const [row] = await this.db
        .insert(users)
        .values({ ...input, email: input.email.toLowerCase(), workspaceId: actor.workspaceId })
        .returning();
      return row!;
    } catch (e) {
      throw uniqueViolation(e, "A user with this email already exists");
    }
  }

  async updateUser(actor: Actor, id: string, input: In<typeof updateUserSchema>) {
    assertPermission(actor, "admin:users");
    if (id === actor.userId && input.role && input.role !== "admin") {
      throw new AppError("bad_request", "You cannot remove your own admin role");
    }
    const [row] = await this.db
      .update(users)
      .set({ ...input, ...(input.email ? { email: input.email.toLowerCase() } : {}) })
      .where(and(eq(users.id, id), eq(users.workspaceId, actor.workspaceId)))
      .returning()
      .catch((e) => {
        throw uniqueViolation(e, "A user with this email already exists");
      });
    if (!row) throw notFound("User");
    return row;
  }

  private async ownProject(actor: Actor, projectId: string) {
    const project = await this.db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.workspaceId, actor.workspaceId)),
    });
    if (!project) throw notFound("Project");
    return project;
  }
}

function uniqueViolation(e: unknown, message: string): unknown {
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "23505" ? new AppError("conflict", message) : e;
}
