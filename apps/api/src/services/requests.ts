import {
  discordChannelMappings,
  discordIntegrations,
  projects,
  releases,
  requestEvents,
  requestLinks,
  requestNumberSequences,
  requestOrigins,
  requests,
  requestSources,
  users,
  type Database,
} from "@prh/database";
import {
  canTransition,
  createRequestSchema,
  formatRequestNumber,
  LINK_EVENT_TYPES,
  parseRequestNumber,
  statusPermission,
  type AddLinkInput,
  type AddSourceInput,
  type CreateRequestInput,
  type ListRequestsQuery,
  type RequestDetail,
  type RequestEventType,
  type RequestEventView,
  type RequestListItem,
  type UpdateRequestInput,
} from "@prh/shared";
import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { AppError, notFound } from "../errors";
import { assertPermission, type Actor } from "./actor";
import type { RequestNotifier } from "./notifier";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

interface EventInput {
  requestId: string;
  actorUserId: string | null;
  eventType: RequestEventType;
  oldValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown>;
}

/** Origin details the service needs beyond the validated API input. */
export interface CreateContext {
  /** Discord user ID etc. of the person who filed it, stored on the first source. */
  externalUserId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatedRequest {
  request: RequestDetail;
  originId: string;
}

const assignee = alias(users, "assignee");
const requester = alias(users, "requester");
const canonical = alias(requests, "canonical");

/**
 * Number of real occurrences: the request's own sources plus the sources of
 * every request merged into it as a duplicate.
 */
const requestCountSql = sql<number>`(
  select count(*)::int from ${requestSources} rs
  join ${requests} d on d.id = rs.request_id
  where d.id = ${requests.id} or d.duplicate_of_id = ${requests.id}
)`;

/**
 * Request business logic. Every input channel (Discord, Web, future Slack/API)
 * goes through this service; nothing else writes to the requests tables.
 */
export class RequestService {
  constructor(
    private readonly db: Database,
    private readonly notifier: RequestNotifier,
  ) {}

  // ---------------------------------------------------------------- create

  async create(actor: Actor, raw: CreateRequestInput, ctx: CreateContext = {}): Promise<CreatedRequest> {
    assertPermission(actor, "request:create");
    const input = validate(createRequestSchema, raw);
    const target = await this.resolveTarget(actor, input.origin);

    const { requestId, originId } = await this.db.transaction(async (tx) => {
      const [seq] = await tx
        .insert(requestNumberSequences)
        .values({ workspaceId: actor.workspaceId, lastNumber: 1 })
        .onConflictDoUpdate({
          target: requestNumberSequences.workspaceId,
          set: { lastNumber: sql`${requestNumberSequences.lastNumber} + 1` },
        })
        .returning({ n: requestNumberSequences.lastNumber });
      if (!seq) throw new Error("failed to allocate request number");

      const [created] = await tx
        .insert(requests)
        .values({
          workspaceId: actor.workspaceId,
          projectId: target.projectId,
          requestNumber: seq.n,
          title: input.title,
          description: input.description,
          requesterId: actor.userId,
          sourceProvider: input.origin.provider,
        })
        .returning({ id: requests.id });
      if (!created) throw new Error("failed to insert request");

      const [origin] = await tx
        .insert(requestOrigins)
        .values({
          requestId: created.id,
          provider: input.origin.provider,
          externalWorkspaceId: target.externalWorkspaceId,
          externalChannelId: target.externalChannelId,
          externalUrl: target.externalUrl,
          metadata: { ...target.metadata, ...ctx.metadata },
        })
        .returning({ id: requestOrigins.id });
      if (!origin) throw new Error("failed to insert origin");

      // The filer's own occurrence is the first source (Requests = 1).
      await tx.insert(requestSources).values({
        requestId: created.id,
        sourceType: input.sourceType ?? null,
        userId: actor.userId,
        externalUserId: ctx.externalUserId ?? null,
      });

      await this.logEvent(tx, {
        requestId: created.id,
        actorUserId: actor.userId,
        eventType: "request_created",
        newValue: formatRequestNumber(seq.n),
        metadata: { provider: input.origin.provider, sourceType: input.sourceType ?? null },
      });

      return { requestId: created.id, originId: origin.id };
    });

    return { request: await this.getById(actor, requestId), originId };
  }

  /**
   * Active mapping for a Discord channel, or null when requests are not
   * enabled there. Integrations use it to find the workspace of the caller.
   */
  async discordMapping(guildId: string, channelId: string) {
    const [mapping] = await this.db
      .select({
        workspaceId: discordChannelMappings.workspaceId,
        projectId: discordChannelMappings.projectId,
      })
      .from(discordChannelMappings)
      .innerJoin(discordIntegrations, eq(discordIntegrations.id, discordChannelMappings.integrationId))
      .innerJoin(projects, eq(projects.id, discordChannelMappings.projectId))
      .where(
        and(
          eq(discordChannelMappings.discordGuildId, guildId),
          eq(discordChannelMappings.discordChannelId, channelId),
          eq(discordChannelMappings.requestEnabled, true),
          eq(discordIntegrations.status, "active"),
          eq(projects.isActive, true),
        ),
      )
      .limit(1);
    return mapping ?? null;
  }

  /** The project always comes from server-side configuration, never from a Discord client. */
  private async resolveTarget(actor: Actor, origin: CreateRequestInput["origin"]) {
    if (origin.provider === "discord") {
      const mapping = await this.discordMapping(origin.guildId, origin.channelId);
      if (!mapping || mapping.workspaceId !== actor.workspaceId) {
        throw new AppError("channel_not_mapped", "This channel is not configured for requests");
      }
      return {
        projectId: mapping.projectId,
        externalWorkspaceId: origin.guildId,
        externalChannelId: origin.channelId,
        externalUrl: origin.sourceMessageUrl ?? null,
        metadata: origin.sourceMessageId ? { sourceMessageId: origin.sourceMessageId } : {},
      };
    }

    const project = await this.db.query.projects.findFirst({
      where: and(eq(projects.id, origin.projectId), eq(projects.workspaceId, actor.workspaceId)),
    });
    if (!project || !project.isActive) throw notFound("Project");
    return {
      projectId: project.id,
      externalWorkspaceId: null,
      externalChannelId: null,
      externalUrl: null,
      metadata: {},
    };
  }

  /** Records the Discord message / thread created for a request after the fact. */
  async attachOriginMessage(
    originId: string,
    data: { messageId: string; threadId: string | null; url: string },
  ): Promise<void> {
    await this.db
      .update(requestOrigins)
      .set({
        externalMessageId: data.messageId,
        externalThreadId: data.threadId,
        // Keep the source message URL for message-command requests.
        externalUrl: sql`coalesce(${requestOrigins.externalUrl}, ${data.url})`,
        metadata: sql`${requestOrigins.metadata} || ${JSON.stringify({ botMessageUrl: data.url })}::jsonb`,
      })
      .where(eq(requestOrigins.id, originId));
  }

  // ------------------------------------------------------------------ read

  async list(actor: Actor, query: ListRequestsQuery): Promise<{ items: RequestListItem[]; total: number }> {
    assertPermission(actor, "request:read");
    const conditions: SQL[] = [eq(requests.workspaceId, actor.workspaceId)];
    if (query.status) conditions.push(eq(requests.status, query.status));
    if (query.projectId) conditions.push(eq(requests.projectId, query.projectId));
    if (query.priority) conditions.push(eq(requests.priority, query.priority));
    if (query.assigneeId) conditions.push(eq(requests.assigneeId, query.assigneeId));
    if (!query.includeDuplicates) conditions.push(isNull(requests.duplicateOfId));
    if (query.q) {
      const n = parseRequestNumber(query.q);
      const text = or(
        ilike(requests.title, `%${escapeLike(query.q)}%`),
        ilike(requests.description, `%${escapeLike(query.q)}%`),
      )!;
      conditions.push(n ? or(eq(requests.requestNumber, n), text)! : text);
    }
    const where = and(...conditions);

    const [rows, [count]] = await Promise.all([
      this.baseSelect()
        .where(where)
        .orderBy(desc(requests.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: sql<number>`count(*)::int` }).from(requests).where(where),
    ]);
    return { items: rows.map(toListItem), total: count?.total ?? 0 };
  }

  /** Accepts a UUID or a request key such as "REQ-0023". */
  async get(actor: Actor, idOrKey: string): Promise<RequestDetail> {
    assertPermission(actor, "request:read");
    const n = parseRequestNumber(idOrKey);
    if (n !== null) {
      const row = await this.db.query.requests.findFirst({
        columns: { id: true },
        where: and(eq(requests.workspaceId, actor.workspaceId), eq(requests.requestNumber, n)),
      });
      if (!row) throw notFound("Request");
      return this.getById(actor, row.id);
    }
    if (!isUuid(idOrKey)) throw notFound("Request");
    return this.getById(actor, idOrKey);
  }

  private async getById(actor: Actor, id: string): Promise<RequestDetail> {
    const [row] = await this.baseSelect()
      .where(and(eq(requests.id, id), eq(requests.workspaceId, actor.workspaceId)))
      .limit(1);
    if (!row) throw notFound("Request");

    const [sources, origins, links, duplicates] = await Promise.all([
      this.db
        .select({ sourceType: requestSources.sourceType, count: sql<number>`count(*)::int` })
        .from(requestSources)
        .innerJoin(requests, eq(requests.id, requestSources.requestId))
        .where(or(eq(requests.id, id), eq(requests.duplicateOfId, id)))
        .groupBy(requestSources.sourceType),
      this.db.query.requestOrigins.findMany({
        where: eq(requestOrigins.requestId, id),
        orderBy: asc(requestOrigins.createdAt),
      }),
      this.db.query.requestLinks.findMany({
        where: eq(requestLinks.requestId, id),
        orderBy: asc(requestLinks.createdAt),
      }),
      this.db
        .select({ id: requests.id, number: requests.requestNumber, title: requests.title })
        .from(requests)
        .where(eq(requests.duplicateOfId, id))
        .orderBy(asc(requests.requestNumber)),
    ]);

    return {
      ...toListItem(row),
      description: row.description,
      impact: row.impact,
      effort: row.effort,
      requester: row.requesterId ? { id: row.requesterId, name: row.requesterName ?? "" } : null,
      targetRelease: row.targetReleaseId
        ? { id: row.targetReleaseId, name: row.targetReleaseName ?? "" }
        : null,
      sourceProvider: row.sourceProvider,
      sources: sources
        .map((s) => ({ sourceType: s.sourceType ?? ("unspecified" as const), count: s.count }))
        .sort((a, b) => b.count - a.count),
      origins: origins.map((o) => ({
        provider: o.provider,
        externalChannelId: o.externalChannelId,
        externalUrl: o.externalUrl,
        metadata: o.metadata,
      })),
      links: links.map((l) => ({
        id: l.id,
        linkType: l.linkType,
        url: l.url,
        label: l.label,
        createdAt: l.createdAt.toISOString(),
      })),
      duplicates: duplicates.map((d) => ({
        id: d.id,
        key: formatRequestNumber(d.number),
        title: d.title,
      })),
      releasedAt: row.releasedAt?.toISOString() ?? null,
    };
  }

  private baseSelect() {
    return this.db
      .select({
        id: requests.id,
        requestNumber: requests.requestNumber,
        title: requests.title,
        description: requests.description,
        status: requests.status,
        priority: requests.priority,
        impact: requests.impact,
        effort: requests.effort,
        sourceProvider: requests.sourceProvider,
        createdAt: requests.createdAt,
        updatedAt: requests.updatedAt,
        releasedAt: requests.releasedAt,
        projectId: projects.id,
        projectName: projects.name,
        projectSlug: projects.slug,
        assigneeId: requests.assigneeId,
        assigneeName: assignee.name,
        requesterId: requests.requesterId,
        requesterName: requester.name,
        targetReleaseId: requests.targetReleaseId,
        targetReleaseName: releases.name,
        duplicateOfId: requests.duplicateOfId,
        duplicateOfNumber: canonical.requestNumber,
        requestCount: requestCountSql,
      })
      .from(requests)
      .innerJoin(projects, eq(projects.id, requests.projectId))
      .leftJoin(assignee, eq(assignee.id, requests.assigneeId))
      .leftJoin(requester, eq(requester.id, requests.requesterId))
      .leftJoin(releases, eq(releases.id, requests.targetReleaseId))
      .leftJoin(canonical, eq(canonical.id, requests.duplicateOfId))
      .$dynamic();
  }

  async events(actor: Actor, id: string): Promise<RequestEventView[]> {
    const request = await this.get(actor, id);
    const rows = await this.db
      .select({
        id: requestEvents.id,
        eventType: requestEvents.eventType,
        oldValue: requestEvents.oldValue,
        newValue: requestEvents.newValue,
        metadata: requestEvents.metadata,
        createdAt: requestEvents.createdAt,
        actorId: users.id,
        actorName: users.name,
      })
      .from(requestEvents)
      .leftJoin(users, eq(users.id, requestEvents.actorUserId))
      .where(eq(requestEvents.requestId, request.id))
      .orderBy(asc(requestEvents.createdAt), asc(requestEvents.id));
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      actor: r.actorId ? { id: r.actorId, name: r.actorName ?? "" } : null,
      oldValue: r.oldValue,
      newValue: r.newValue,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ---------------------------------------------------------------- update

  async update(actor: Actor, id: string, patch: UpdateRequestInput): Promise<RequestDetail> {
    const current = await this.get(actor, id);

    if (patch.title !== undefined || patch.description !== undefined) {
      assertPermission(actor, "request:update_status");
    }
    if (patch.priority !== undefined) assertPermission(actor, "request:set_priority");
    if (patch.impact !== undefined) assertPermission(actor, "request:set_impact");
    if (patch.effort !== undefined) assertPermission(actor, "request:set_effort");
    if (patch.assigneeId !== undefined) assertPermission(actor, "request:assign");
    if (patch.targetReleaseId !== undefined) assertPermission(actor, "request:set_target_release");

    const statusChange =
      patch.status !== undefined && patch.status !== current.status
        ? { from: current.status, to: patch.status }
        : null;
    if (statusChange) {
      assertPermission(actor, statusPermission(statusChange.to));
      if (!canTransition(statusChange.from, statusChange.to)) {
        throw new AppError(
          "invalid_transition",
          `Cannot change status from ${statusChange.from} to ${statusChange.to}`,
        );
      }
    }

    if (patch.assigneeId) {
      const user = await this.db.query.users.findFirst({
        where: and(eq(users.id, patch.assigneeId), eq(users.workspaceId, actor.workspaceId)),
      });
      if (!user) throw notFound("Assignee");
    }
    if (patch.targetReleaseId) {
      const release = await this.db.query.releases.findFirst({
        where: and(eq(releases.id, patch.targetReleaseId), eq(releases.projectId, current.project.id)),
      });
      if (!release) throw notFound("Release");
    }

    const events: EventInput[] = [];
    const base = { requestId: current.id, actorUserId: actor.userId };
    const changed = <T>(next: T | undefined, prev: T) => next !== undefined && next !== prev;

    if (statusChange) {
      events.push({ ...base, eventType: "status_changed", oldValue: statusChange.from, newValue: statusChange.to });
      if (statusChange.to === "released") events.push({ ...base, eventType: "released" });
    }
    if (changed(patch.priority, current.priority)) {
      events.push({ ...base, eventType: "priority_changed", oldValue: current.priority, newValue: patch.priority });
    }
    if (changed(patch.impact, current.impact)) {
      events.push({ ...base, eventType: "impact_changed", oldValue: current.impact, newValue: patch.impact });
    }
    if (changed(patch.effort, current.effort)) {
      events.push({ ...base, eventType: "effort_changed", oldValue: current.effort, newValue: patch.effort });
    }
    if (changed(patch.assigneeId, current.assignee?.id ?? null)) {
      events.push({ ...base, eventType: "assigned", oldValue: current.assignee?.id ?? null, newValue: patch.assigneeId });
    }
    if (changed(patch.targetReleaseId, current.targetRelease?.id ?? null)) {
      events.push({
        ...base,
        eventType: "target_release_changed",
        oldValue: current.targetRelease?.id ?? null,
        newValue: patch.targetReleaseId,
      });
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(requests)
        .set({
          ...patch,
          ...(statusChange?.to === "released" ? { releasedAt: new Date() } : {}),
          ...(statusChange?.from === "released" ? { releasedAt: null } : {}),
        })
        .where(eq(requests.id, current.id));
      for (const e of events) await this.logEvent(tx, e);
    });

    const updated = await this.getById(actor, current.id);
    if (statusChange) {
      this.notifier.notify({ kind: "status_changed", request: updated, ...statusChange });
    }
    return updated;
  }

  // ----------------------------------------------------- same request / dup

  /**
   * "同じ要望あり": records another real occurrence of the demand.
   * Added to the canonical request when the target was merged as a duplicate.
   */
  async addSource(
    actor: Actor,
    id: string,
    input: AddSourceInput,
    ctx: { externalUserId?: string } = {},
  ): Promise<RequestDetail> {
    assertPermission(actor, "request:add_source");
    const target = await this.get(actor, id);
    const rootId = target.duplicateOf?.id ?? target.id;

    await this.db.transaction(async (tx) => {
      await tx.insert(requestSources).values({
        requestId: rootId,
        sourceType: input.sourceType,
        userId: actor.userId,
        externalUserId: ctx.externalUserId ?? null,
        note: input.note ?? null,
      });
      await this.logEvent(tx, {
        requestId: rootId,
        actorUserId: actor.userId,
        eventType: "request_added",
        newValue: input.sourceType,
        metadata: input.note ? { note: input.note } : {},
      });
    });

    const updated = await this.getById(actor, rootId);
    this.notifier.notify({ kind: "source_added", request: updated });
    return updated;
  }

  /**
   * Marks `id` as a duplicate of `duplicateOfId`. The duplicate is kept (not
   * deleted) together with its activity log; its sources count toward the
   * canonical request.
   */
  async mergeDuplicate(actor: Actor, id: string, duplicateOfId: string): Promise<RequestDetail> {
    assertPermission(actor, "request:merge_duplicate");
    const duplicate = await this.get(actor, id);
    const target = await this.get(actor, duplicateOfId);
    const rootId = target.duplicateOf?.id ?? target.id;

    if (rootId === duplicate.id) throw new AppError("bad_request", "A request cannot be a duplicate of itself");
    if (duplicate.duplicateOf) throw new AppError("conflict", `${duplicate.key} is already merged`);
    const root = rootId === target.id ? target : await this.getById(actor, rootId);

    await this.db.transaction(async (tx) => {
      await tx.update(requests).set({ duplicateOfId: root.id }).where(eq(requests.id, duplicate.id));
      // Flatten: anything merged into the duplicate now points at the root.
      const children = await tx
        .update(requests)
        .set({ duplicateOfId: root.id })
        .where(eq(requests.duplicateOfId, duplicate.id))
        .returning({ id: requests.id });

      const metadata = { duplicateId: duplicate.id, canonicalId: root.id };
      await this.logEvent(tx, {
        requestId: duplicate.id,
        actorUserId: actor.userId,
        eventType: "duplicate_merged",
        newValue: root.key,
        metadata,
      });
      await this.logEvent(tx, {
        requestId: root.id,
        actorUserId: actor.userId,
        eventType: "duplicate_merged",
        oldValue: duplicate.key,
        metadata: { ...metadata, reparented: children.map((c) => c.id) },
      });
    });

    const updatedRoot = await this.getById(actor, root.id);
    this.notifier.notify({ kind: "source_added", request: updatedRoot });
    return this.getById(actor, duplicate.id);
  }

  // ------------------------------------------------------------------ links

  async addLink(actor: Actor, id: string, input: AddLinkInput): Promise<RequestDetail> {
    assertPermission(actor, "request:link_development");
    const request = await this.get(actor, id);
    await this.db.transaction(async (tx) => {
      await tx.insert(requestLinks).values({
        requestId: request.id,
        linkType: input.linkType,
        url: input.url,
        label: input.label ?? null,
        createdById: actor.userId,
      });
      await this.logEvent(tx, {
        requestId: request.id,
        actorUserId: actor.userId,
        eventType: LINK_EVENT_TYPES[input.linkType],
        newValue: input.label ?? input.url,
        metadata: { url: input.url },
      });
    });
    return this.getById(actor, request.id);
  }

  async removeLink(actor: Actor, id: string, linkId: string): Promise<RequestDetail> {
    assertPermission(actor, "request:link_development");
    const request = await this.get(actor, id);
    await this.db
      .delete(requestLinks)
      .where(and(eq(requestLinks.id, linkId), eq(requestLinks.requestId, request.id)));
    return this.getById(actor, request.id);
  }

  // ---------------------------------------------------------------- helpers

  /** Discord message/thread for a request, used by integrations to sync state. */
  async discordOrigin(requestId: string) {
    return this.db.query.requestOrigins.findFirst({
      where: and(eq(requestOrigins.requestId, requestId), eq(requestOrigins.provider, "discord")),
      orderBy: asc(requestOrigins.createdAt),
    });
  }

  private async logEvent(tx: Executor, e: EventInput): Promise<void> {
    await tx.insert(requestEvents).values({
      requestId: e.requestId,
      actorUserId: e.actorUserId,
      eventType: e.eventType,
      oldValue: e.oldValue ?? null,
      newValue: e.newValue ?? null,
      metadata: e.metadata ?? {},
    });
  }
}

type BaseRow = Awaited<ReturnType<ReturnType<RequestService["baseSelect"]>["execute"]>>[number];

function toListItem(row: BaseRow): RequestListItem {
  return {
    id: row.id,
    requestNumber: row.requestNumber,
    key: formatRequestNumber(row.requestNumber),
    title: row.title,
    status: row.status,
    priority: row.priority,
    project: { id: row.projectId, name: row.projectName, slug: row.projectSlug },
    assignee: row.assigneeId ? { id: row.assigneeId, name: row.assigneeName ?? "" } : null,
    requestCount: Number(row.requestCount),
    duplicateOf:
      row.duplicateOfId && row.duplicateOfNumber !== null
        ? { id: row.duplicateOfId, key: formatRequestNumber(row.duplicateOfNumber) }
        : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function validate<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("bad_request", "Invalid input", z.treeifyError(result.error));
  }
  return result.data;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
