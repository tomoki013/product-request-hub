import type { Database } from "@prh/database";
import type { Actor } from "./services/actor";
import type { Services } from "./services";
import type { DiscordRest } from "@prh/discord";
import type { DiscordSync } from "./discord/sync";

export interface Bindings {
  DB: D1Database;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_BOT_TOKEN: string;
  WEB_BASE_URL: string;
  /** Cloudflare Access team domain, e.g. "your-team.cloudflareaccess.com". */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application. */
  CF_ACCESS_AUD?: string;
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
