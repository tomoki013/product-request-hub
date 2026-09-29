import { PGlite } from "@electric-sql/pglite";
import {
  discordChannelMappings,
  discordIntegrations,
  projects,
  schema,
  users,
  workspaces,
  type Database,
} from "@prh/database";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { Bindings } from "../src/env";

const GUILD = "guild-1";
const CHANNEL = "channel-dev";
const migrationsFolder = new URL("../../../packages/database/migrations", import.meta.url).pathname;

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

let keys: CryptoKeyPair;
let env: Bindings;
let db: Database;
let pg: PGlite;
let ids: { workspace: string; project: string; admin: string; pm: string; dev: string };

interface DiscordCall {
  method: string;
  path: string;
  body: unknown;
}
let discordCalls: DiscordCall[] = [];
let pending: Promise<unknown>[] = [];
let messageSeq = 0;

const fakeFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname.replace("/api/v10", "");
  discordCalls.push({ method: init?.method ?? "GET", path, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (path.endsWith("/threads")) return Response.json({ id: "thread-1" });
  return Response.json({ id: `msg-${++messageSeq}`, channel_id: CHANNEL });
};

const executionCtx = {
  waitUntil: (p: Promise<unknown>) => void pending.push(p),
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

async function flush() {
  while (pending.length) {
    const batch = pending;
    pending = [];
    await Promise.all(batch);
  }
}

const app = createApp({ db: () => db, fetch: fakeFetch });

async function api(email: string, method: string, path: string, body?: unknown) {
  const res = await app.request(
    `/api${path}`,
    {
      method,
      headers: { "x-dev-user-email": email, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
    executionCtx,
  );
  await flush();
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function interact(payload: Record<string, unknown>) {
  const body = JSON.stringify({
    id: "i-1",
    application_id: "app-1",
    token: "tok-1",
    guild_id: GUILD,
    channel_id: CHANNEL,
    member: { user: { id: "discord-tanaka", username: "tanaka", global_name: "田中" } },
    ...payload,
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = toHex(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(ts + body)));
  const res = await app.request(
    "/discord/interactions",
    {
      method: "POST",
      headers: { "x-signature-ed25519": sig, "x-signature-timestamp": ts, "content-type": "application/json" },
      body,
    },
    env,
    executionCtx,
  );
  const json = res.status === 200 ? await res.json() : null;
  await flush();
  return { status: res.status, body: json as { type: number; data?: Record<string, unknown> } | null };
}

function modalSubmit(title: string, description: string, source?: string, customId = "prh:req") {
  return interact({
    type: 5,
    data: {
      custom_id: customId,
      components: [
        { type: 18, component: { type: 4, custom_id: "title", value: title } },
        { type: 18, component: { type: 4, custom_id: "description", value: description } },
        { type: 18, component: { type: 3, custom_id: "source", values: source ? [source] : [] } },
      ],
    },
  });
}

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  env = {
    DISCORD_PUBLIC_KEY: toHex((await crypto.subtle.exportKey("raw", keys.publicKey)) as ArrayBuffer),
    DISCORD_APPLICATION_ID: "app-1",
    DISCORD_BOT_TOKEN: "bot-token",
    WEB_BASE_URL: "https://hub.example.com",
    AUTH_DEV_BYPASS: "true",
  };
});

beforeEach(async () => {
  pg = new PGlite();
  const d = drizzle(pg, { schema });
  await migrate(d, { migrationsFolder });
  db = d as unknown as Database;
  discordCalls = [];
  pending = [];
  messageSeq = 0;

  const [ws] = await db.insert(workspaces).values({ name: "Tomokichi", slug: "tomokichi" }).returning();
  const [project] = await db
    .insert(projects)
    .values({ workspaceId: ws!.id, name: "Zakkary", slug: "zakkary" })
    .returning();
  const [integration] = await db
    .insert(discordIntegrations)
    .values({ workspaceId: ws!.id, name: "Zakkary Discord", discordGuildId: GUILD })
    .returning();
  await db.insert(discordChannelMappings).values({
    integrationId: integration!.id,
    workspaceId: ws!.id,
    projectId: project!.id,
    discordGuildId: GUILD,
    discordChannelId: CHANNEL,
  });
  const inserted = await db
    .insert(users)
    .values([
      { workspaceId: ws!.id, name: "Admin", email: "admin@example.com", role: "admin" },
      { workspaceId: ws!.id, name: "PM", email: "pm@example.com", role: "product_manager" },
      { workspaceId: ws!.id, name: "Dev", email: "dev@example.com", role: "developer" },
    ])
    .returning();
  ids = {
    workspace: ws!.id,
    project: project!.id,
    admin: inserted[0]!.id,
    pm: inserted[1]!.id,
    dev: inserted[2]!.id,
  };
});

describe("Discord interactions", () => {
  it("rejects bad signatures", async () => {
    const res = await app.request(
      "/discord/interactions",
      { method: "POST", body: "{}", headers: { "x-signature-ed25519": "00", "x-signature-timestamp": "1" } },
      env,
      executionCtx,
    );
    expect(res.status).toBe(401);
  });

  it("answers PING", async () => {
    const res = await interact({ type: 1 });
    expect(res.body).toEqual({ type: 1 });
  });

  it("opens the modal without a project field", async () => {
    const res = await interact({ type: 2, data: { name: "request", type: 1 } });
    expect(res.body?.type).toBe(9);
    const labels = (res.body?.data?.components as { label: string }[]).map((c) => c.label);
    expect(labels).toEqual(["タイトル", "内容", "要望元"]);
  });

  it("refuses unmapped channels", async () => {
    const res = await interact({ type: 2, channel_id: "random", data: { name: "request", type: 1 } });
    expect(res.body?.type).toBe(4);
    expect(String(res.body?.data?.content)).toContain("設定されていません");
  });

  it("creates REQ-0001 with message and thread, project from the channel mapping", async () => {
    const res = await modalSubmit("店舗をお気に入り保存したい", "顧客から要望があった", "customer");
    expect(res.body?.type).toBe(5);

    const created = discordCalls.find((c) => c.method === "POST" && c.path === `/channels/${CHANNEL}/messages`);
    const embed = (created?.body as { embeds: { title: string; fields: { name: string; value: string }[] }[] })
      .embeds[0]!;
    expect(embed.title).toBe("🎫 REQ-0001");
    expect(embed.fields.find((f) => f.name === "Project")?.value).toBe("Zakkary");
    expect(embed.fields.find((f) => f.name === "Requested by")?.value).toBe("<@discord-tanaka>");
    expect(discordCalls.some((c) => c.path.endsWith("/threads"))).toBe(true);
    const ack = discordCalls.find((c) => c.path.endsWith("/messages/@original"));
    expect(JSON.stringify(ack?.body)).toContain("REQ-0001");

    const detail = await api("admin@example.com", "GET", "/requests/REQ-0001");
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      key: "REQ-0001",
      status: "new",
      priority: null,
      project: { name: "Zakkary" },
      requester: { name: "田中" },
      requestCount: 1,
      sources: [{ sourceType: "customer", count: 1 }],
    });
    expect(detail.body.origins[0]).toMatchObject({
      provider: "discord",
      externalChannelId: CHANNEL,
      externalUrl: `https://discord.com/channels/${GUILD}/${CHANNEL}/msg-1`,
    });
  });

  it("creates from a message command and links the source message", async () => {
    const cmd = await interact({
      type: 2,
      data: {
        name: "機能要望として登録",
        type: 3,
        target_id: "m-99",
        resolved: {
          messages: { "m-99": { id: "m-99", channel_id: CHANNEL, content: "お気に入り欲しい", author: { id: "u", username: "sato" } } },
        },
      },
    });
    expect(cmd.body?.type).toBe(9);
    expect(cmd.body?.data?.custom_id).toBe("prh:req:msg:m-99");
    expect(JSON.stringify(cmd.body)).toContain("お気に入り欲しい");

    await modalSubmit("お気に入り", "お気に入り欲しい", undefined, "prh:req:msg:m-99");
    const detail = await api("admin@example.com", "GET", "/requests/REQ-0001");
    expect(detail.body.origins[0].externalUrl).toBe(`https://discord.com/channels/${GUILD}/${CHANNEL}/m-99`);
    expect(detail.body.origins[0].metadata.sourceMessageId).toBe("m-99");
    expect(detail.body.sources).toEqual([{ sourceType: "unspecified", count: 1 }]);
  });

  it("counts 同じ要望あり as another occurrence and refreshes the message", async () => {
    await modalSubmit("お気に入り", "内容", "customer");
    const { body: req } = await api("admin@example.com", "GET", "/requests/REQ-0001");

    const prompt = await interact({ type: 3, data: { custom_id: `prh:same:${req.id}`, component_type: 2 } });
    expect(prompt.body?.type).toBe(4);

    discordCalls = [];
    const select = await interact({
      type: 3,
      member: { user: { id: "discord-suzuki", username: "suzuki" } },
      data: { custom_id: `prh:same_src:${req.id}`, component_type: 3, values: ["sales"] },
    });
    expect(select.body?.type).toBe(6);
    expect(discordCalls.some((c) => c.method === "PATCH" && c.path === `/channels/${CHANNEL}/messages/msg-1`)).toBe(true);

    const detail = await api("admin@example.com", "GET", "/requests/REQ-0001");
    expect(detail.body.requestCount).toBe(2);
    expect(detail.body.sources).toHaveLength(2);
  });
});

describe("Request API", () => {
  it("creates from the web and numbers sequentially", async () => {
    const a = await api("pm@example.com", "POST", "/requests", {
      title: "A",
      description: "a",
      origin: { provider: "web", projectId: ids.project },
    });
    const b = await api("pm@example.com", "POST", "/requests", {
      title: "B",
      description: "b",
      sourceType: "internal",
      origin: { provider: "web", projectId: ids.project },
    });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect([a.body.key, b.body.key]).toEqual(["REQ-0001", "REQ-0002"]);

    const list = await api("pm@example.com", "GET", "/requests?status=new");
    expect(list.body.total).toBe(2);
    const search = await api("pm@example.com", "GET", "/requests?q=REQ-0002");
    expect(search.body.items.map((i: { key: string }) => i.key)).toEqual(["REQ-0002"]);
  });

  it("does not accept a Discord origin from web clients", async () => {
    const res = await api("pm@example.com", "POST", "/requests", {
      title: "A",
      description: "a",
      origin: { provider: "discord", guildId: GUILD, channelId: CHANNEL },
    });
    expect(res.status).toBe(400);
  });

  it("enforces role permissions and status transitions", async () => {
    await modalSubmit("お気に入り", "内容", "customer");
    const requesterEmail = "req@example.com";
    await api("admin@example.com", "POST", "/users", { name: "Req", email: requesterEmail, role: "requester" });

    expect((await api(requesterEmail, "PATCH", "/requests/REQ-0001", { priority: "high" })).status).toBe(403);
    expect((await api("dev@example.com", "PATCH", "/requests/REQ-0001", { status: "reviewing" })).status).toBe(200);
    expect((await api("dev@example.com", "PATCH", "/requests/REQ-0001", { status: "planned" })).status).toBe(403);
    expect((await api("pm@example.com", "PATCH", "/requests/REQ-0001", { status: "released" })).status).toBe(422);

    discordCalls = [];
    const planned = await api("pm@example.com", "PATCH", "/requests/REQ-0001", {
      status: "planned",
      priority: "medium",
      impact: "high",
      assigneeId: ids.dev,
    });
    expect(planned.status).toBe(200);
    expect(planned.body).toMatchObject({ status: "planned", priority: "medium", impact: "high", assignee: { name: "Dev" } });
    // Planned is synced to Discord: embed refreshed + notice in the thread.
    expect(discordCalls.some((c) => c.method === "PATCH" && c.path.startsWith(`/channels/${CHANNEL}/messages/`))).toBe(true);
    expect(discordCalls.find((c) => c.path === "/channels/thread-1/messages")?.body).toMatchObject({
      content: expect.stringContaining("Reviewing → Planned"),
    });

    discordCalls = [];
    await api("dev@example.com", "PATCH", "/requests/REQ-0001", { effort: "medium" });
    expect(discordCalls).toHaveLength(0); // non-status edits are not pushed to Discord

    await api("dev@example.com", "PATCH", "/requests/REQ-0001", { status: "in_progress" });
    const released = await api("dev@example.com", "PATCH", "/requests/REQ-0001", { status: "released" });
    expect(released.body.releasedAt).not.toBeNull();

    const events = await api("admin@example.com", "GET", "/requests/REQ-0001/events");
    expect(events.body.items.map((e: { eventType: string }) => e.eventType)).toEqual([
      "request_created",
      "status_changed",
      "status_changed",
      "priority_changed",
      "impact_changed",
      "assigned",
      "effort_changed",
      "status_changed",
      "status_changed",
      "released",
    ]);
  });

  it("merges duplicates without deleting them and aggregates the count", async () => {
    const mk = (title: string) =>
      api("pm@example.com", "POST", "/requests", { title, description: "x", sourceType: "customer", origin: { provider: "web", projectId: ids.project } });
    const canonical = (await mk("お気に入り")).body;
    const dup = (await mk("お気に入り機能")).body;
    const dup2 = (await mk("ブックマーク")).body;
    await api("pm@example.com", "POST", `/requests/${dup2.id}/sources`, { sourceType: "sales" });

    // dup2 → dup, then dup → canonical: dup2 is re-parented to canonical.
    expect((await api("dev@example.com", "POST", `/requests/${dup2.id}/merge`, { duplicateOfId: dup.id })).status).toBe(403);
    await api("pm@example.com", "POST", `/requests/${dup2.id}/merge`, { duplicateOfId: dup.id });
    const merged = await api("pm@example.com", "POST", `/requests/${dup.id}/merge`, { duplicateOfId: canonical.id });
    expect(merged.body.duplicateOf).toEqual({ id: canonical.id, key: "REQ-0001" });

    const root = await api("pm@example.com", "GET", `/requests/${canonical.id}`);
    expect(root.body.requestCount).toBe(4);
    expect(root.body.duplicates.map((d: { key: string }) => d.key)).toEqual(["REQ-0002", "REQ-0003"]);

    const list = await api("pm@example.com", "GET", "/requests");
    expect(list.body.items.map((i: { key: string }) => i.key)).toEqual(["REQ-0001"]);

    // Adding to a duplicate goes to the canonical request.
    const added = await api("pm@example.com", "POST", `/requests/${dup.id}/sources`, { sourceType: "support" });
    expect(added.body).toMatchObject({ key: "REQ-0001", requestCount: 5 });

    expect((await api("pm@example.com", "POST", `/requests/${canonical.id}/merge`, { duplicateOfId: dup.id })).status).toBe(400);

    const dupEvents = await api("pm@example.com", "GET", `/requests/${dup.id}/events`);
    expect(dupEvents.body.items.at(-1)).toMatchObject({ eventType: "duplicate_merged", newValue: "REQ-0001" });
  });

  it("links development artifacts", async () => {
    const { body: req } = await api("pm@example.com", "POST", "/requests", {
      title: "A",
      description: "a",
      origin: { provider: "web", projectId: ids.project },
    });
    const linked = await api("dev@example.com", "POST", `/requests/${req.id}/links`, {
      linkType: "github_issue",
      url: "https://github.com/tomoki013/zakkary/issues/84",
      label: "#84",
    });
    expect(linked.status).toBe(201);
    expect(linked.body.links[0]).toMatchObject({ linkType: "github_issue", label: "#84" });
  });

  it("manages channel mappings as admin only", async () => {
    const list = await api("admin@example.com", "GET", "/channel-mappings");
    expect(list.body.items).toHaveLength(1);
    expect((await api("pm@example.com", "GET", "/channel-mappings")).status).toBe(403);

    const project = await api("admin@example.com", "POST", "/projects", { name: "Remeet", slug: "remeet" });
    const mapping = await api("admin@example.com", "POST", "/channel-mappings", {
      projectId: project.body.id,
      discordGuildId: GUILD,
      discordChannelId: "channel-remeet",
    });
    expect(mapping.status).toBe(201);
    const dup = await api("admin@example.com", "POST", "/channel-mappings", {
      projectId: project.body.id,
      discordGuildId: GUILD,
      discordChannelId: "channel-remeet",
    });
    expect(dup.status).toBe(409);

    await interact({ type: 5, channel_id: "channel-remeet", data: { custom_id: "prh:req", components: [
      { type: 18, component: { type: 4, custom_id: "title", value: "T" } },
      { type: 18, component: { type: 4, custom_id: "description", value: "D" } },
    ] } });
    const detail = await api("admin@example.com", "GET", "/requests/REQ-0001");
    expect(detail.body.project.name).toBe("Remeet");

    await api("admin@example.com", "PATCH", `/channel-mappings/${mapping.body.id}`, { requestEnabled: false });
    const refused = await interact({ type: 2, channel_id: "channel-remeet", data: { name: "request", type: 1 } });
    expect(refused.body?.type).toBe(4);
  });

  it("requires authentication", async () => {
    const res = await app.request("/api/requests", {}, { ...env, SUPABASE_JWT_SECRET: "s" }, executionCtx);
    expect(res.status).toBe(401);
  });
});
