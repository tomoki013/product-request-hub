/**
 * Initial setup (design doc §36).
 *
 *   Workspace:           Tomokichi
 *   Project:             Zakkary
 *   Discord Integration: Zakkary Discord
 *   Channel Mapping:     #development → Zakkary
 *
 * Idempotent. Configure with environment variables:
 *   DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_NAME,
 *   SEED_DISCORD_GUILD_ID, SEED_DISCORD_CHANNEL_ID
 */
import { and, eq } from "drizzle-orm";
import { createDb } from "../src/client";
import {
  discordChannelMappings,
  discordIntegrations,
  projects,
  requestNumberSequences,
  users,
  workspaces,
} from "../src/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const db = createDb(url, { max: 1 });

const [workspace] = await db
  .insert(workspaces)
  .values({ name: "Tomokichi", slug: "tomokichi" })
  .onConflictDoUpdate({ target: workspaces.slug, set: { name: "Tomokichi" } })
  .returning();
if (!workspace) throw new Error("workspace upsert failed");

await db
  .insert(requestNumberSequences)
  .values({ workspaceId: workspace.id })
  .onConflictDoNothing();

const [project] = await db
  .insert(projects)
  .values({ workspaceId: workspace.id, name: "Zakkary", slug: "zakkary" })
  .onConflictDoUpdate({ target: [projects.workspaceId, projects.slug], set: { name: "Zakkary" } })
  .returning();
if (!project) throw new Error("project upsert failed");

const adminEmail = process.env.SEED_ADMIN_EMAIL;
if (adminEmail) {
  await db
    .insert(users)
    .values({
      workspaceId: workspace.id,
      name: process.env.SEED_ADMIN_NAME ?? "Admin",
      email: adminEmail.toLowerCase(),
      role: "admin",
    })
    .onConflictDoUpdate({ target: [users.workspaceId, users.email], set: { role: "admin" } });
  console.log(`Admin user: ${adminEmail}`);
}

const guildId = process.env.SEED_DISCORD_GUILD_ID;
const channelId = process.env.SEED_DISCORD_CHANNEL_ID;
if (guildId) {
  const [integration] = await db
    .insert(discordIntegrations)
    .values({ workspaceId: workspace.id, name: "Zakkary Discord", discordGuildId: guildId })
    .onConflictDoUpdate({ target: discordIntegrations.discordGuildId, set: { status: "active" } })
    .returning();
  if (!integration) throw new Error("integration upsert failed");

  if (channelId) {
    const existing = await db.query.discordChannelMappings.findFirst({
      where: and(
        eq(discordChannelMappings.discordGuildId, guildId),
        eq(discordChannelMappings.discordChannelId, channelId),
      ),
    });
    if (!existing) {
      await db.insert(discordChannelMappings).values({
        integrationId: integration.id,
        workspaceId: workspace.id,
        projectId: project.id,
        discordGuildId: guildId,
        discordChannelId: channelId,
      });
    }
    console.log(`Channel mapping: ${channelId} → Zakkary`);
  }
}

console.log(`Workspace ${workspace.slug} / Project ${project.slug} ready`);
process.exit(0);
