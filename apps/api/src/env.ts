import type { Database } from "@prh/database";
import type { Actor } from "./services/actor";
import type { Services } from "./services";
import type { DiscordRest } from "@prh/discord";
import type { DiscordSync } from "./discord/sync";

export interface Bindings {
  DATABASE_URL?: string;
  HYPERDRIVE?: { connectionString: string };
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_BOT_TOKEN: string;
  WEB_BASE_URL: string;
  SUPABASE_URL?: string;
  SUPABASE_JWT_SECRET?: string;
  AUTH_DEV_BYPASS?: string;
}

export interface Variables {
  db: Database;
  services: Services;
  actor: Actor;
  discord: { rest: DiscordRest; sync: DiscordSync; defer: (task: Promise<unknown>) => void };
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: Variables;
}
