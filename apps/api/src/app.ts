import { createDb, type Database } from "@prh/database";
import { DiscordRest, verifyDiscordRequest, type Interaction } from "@prh/discord";
import type { ApiErrorBody } from "@prh/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireUser } from "./auth";
import { handleInteraction } from "./discord/interactions";
import { DiscordSync } from "./discord/sync";
import type { AppEnv, Bindings } from "./env";
import { AppError } from "./errors";
import { adminRoutes } from "./routes/admin";
import { requestRoutes } from "./routes/requests";
import { createServices, type Services } from "./services";

export interface AppDeps {
  /** Overrides for tests. */
  db?: (env: Bindings) => Database;
  fetch?: typeof fetch;
}

export function createApp(deps: AppDeps = {}) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json<ApiErrorBody>(
        { error: { code: err.code, message: err.message, details: err.details } },
        err.status,
      );
    }
    console.error(err);
    return c.json<ApiErrorBody>({ error: { code: "internal", message: "Internal Server Error" } }, 500);
  });

  // Per-request wiring. On Workers a DB connection must not outlive the request.
  app.use("*", async (c, next) => {
    const connectionString = c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL;
    const db = deps.db ? deps.db(c.env) : createDb(requireEnv(connectionString, "DATABASE_URL"));
    const defer = (task: Promise<unknown>) => {
      try {
        c.executionCtx.waitUntil(task);
      } catch {
        // No ExecutionContext (e.g. unit tests): let the promise run on its own.
        void task;
      }
    };
    const rest = new DiscordRest({
      botToken: c.env.DISCORD_BOT_TOKEN,
      applicationId: c.env.DISCORD_APPLICATION_ID,
      fetch: deps.fetch,
    });
    let services: Services | undefined;
    const sync = new DiscordSync({ rest, services: () => services!, webBaseUrl: c.env.WEB_BASE_URL, defer });
    services = createServices(db, sync);

    c.set("db", db);
    c.set("services", services);
    c.set("discord", { rest, sync, defer });
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/discord/interactions", async (c) => {
    const body = await c.req.text();
    const valid = await verifyDiscordRequest(
      body,
      c.req.header("x-signature-ed25519"),
      c.req.header("x-signature-timestamp"),
      c.env.DISCORD_PUBLIC_KEY,
    );
    if (!valid) return c.text("invalid request signature", 401);

    const { rest, sync, defer } = c.get("discord");
    const response = await handleInteraction(JSON.parse(body) as Interaction, {
      services: c.get("services"),
      rest,
      sync,
      defer,
    });
    return c.json(response);
  });

  const api = new Hono<AppEnv>();
  api.use("*", async (c, next) => {
    const origin = c.env.WEB_BASE_URL;
    return cors({ origin, credentials: true, allowHeaders: ["authorization", "content-type"] })(c, next);
  });
  api.use("*", requireUser);
  api.route("/requests", requestRoutes);
  api.route("/", adminRoutes);
  app.route("/api", api);

  return app;
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export type App = ReturnType<typeof createApp>;
