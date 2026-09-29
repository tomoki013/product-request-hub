import { externalIdentities, users, workspaces, type Database } from "@prh/database";
import type { IdentityProvider, Me } from "@prh/shared";
import { ROLE_PERMISSIONS } from "@prh/shared";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "../errors";
import type { Actor } from "./actor";

export class IdentityService {
  constructor(private readonly db: Database) {}

  async findByExternalId(
    provider: IdentityProvider,
    externalUserId: string,
    workspaceId?: string,
  ): Promise<Actor | null> {
    const [row] = await this.db
      .select({ userId: users.id, workspaceId: users.workspaceId, role: users.role })
      .from(externalIdentities)
      .innerJoin(users, eq(users.id, externalIdentities.userId))
      .where(
        and(
          eq(externalIdentities.provider, provider),
          eq(externalIdentities.externalUserId, externalUserId),
          workspaceId ? eq(users.workspaceId, workspaceId) : undefined,
        ),
      )
      .orderBy(asc(users.createdAt))
      .limit(1);
    return row ?? null;
  }

  /**
   * Discord users are provisioned on first use as Requesters of the workspace
   * that owns the channel mapping. Roles are raised from the admin screen.
   */
  async resolveDiscordUser(
    workspaceId: string,
    discordUser: { id: string; name: string },
  ): Promise<Actor> {
    const existing = await this.findByExternalId("discord", discordUser.id, workspaceId);
    if (existing) return existing;

    // D1 has no interactive transactions; batch() runs both inserts atomically.
    const userId = crypto.randomUUID();
    await this.db.batch([
      this.db.insert(users).values({ id: userId, workspaceId, name: discordUser.name, role: "requester" }),
      this.db
        .insert(externalIdentities)
        .values({ userId, provider: "discord", externalUserId: discordUser.id }),
    ]);
    return { userId, workspaceId, role: "requester" };
  }

  async findByEmail(email: string): Promise<Actor | null> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
      orderBy: asc(users.createdAt),
    });
    return user ? { userId: user.id, workspaceId: user.workspaceId, role: user.role } : null;
  }

  async discordIdOf(userId: string): Promise<string | null> {
    const row = await this.db.query.externalIdentities.findFirst({
      where: and(eq(externalIdentities.userId, userId), eq(externalIdentities.provider, "discord")),
    });
    return row?.externalUserId ?? null;
  }

  async me(actor: Actor): Promise<Me> {
    const [row] = await this.db
      .select({ user: users, workspace: workspaces })
      .from(users)
      .innerJoin(workspaces, eq(workspaces.id, users.workspaceId))
      .where(eq(users.id, actor.userId))
      .limit(1);
    if (!row) throw notFound("User");
    return {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      role: row.user.role,
      workspace: { id: row.workspace.id, name: row.workspace.name, slug: row.workspace.slug },
      permissions: [...ROLE_PERMISSIONS[row.user.role]],
    };
  }
}
