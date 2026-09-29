/**
 * Initial setup (design doc §36).
 *
 *   Workspace:           Tomokichi
 *   Project:             Zakkary
 *   Discord Integration: Zakkary Discord
 *   Channel Mapping:     #development → Zakkary
 *
 * Generates an idempotent SQL file and runs it against D1 with `wrangler d1 execute`.
 *
 *   pnpm db:seed            # remote D1
 *   pnpm db:seed:local      # local (wrangler dev) D1
 *
 * Environment: SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, SEED_DISCORD_GUILD_ID, SEED_DISCORD_CHANNEL_ID
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const local = process.argv.includes("--local");
const apiDir = new URL("../../../apps/api", import.meta.url).pathname;

const str = (v: string) => `'${v.replaceAll("'", "''")}'`;
const uuid = () => str(crypto.randomUUID());
const now = String(Date.now());

function snowflake(name: string, value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (!/^\d{5,25}$/.test(value)) throw new Error(`${name} must be a Discord ID (digits only)`);
  return value;
}

const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
if (adminEmail && !/^[^\s@']+@[^\s@']+$/.test(adminEmail)) throw new Error("SEED_ADMIN_EMAIL is not a valid email");
const guildId = snowflake("SEED_DISCORD_GUILD_ID", process.env.SEED_DISCORD_GUILD_ID);
const channelId = snowflake("SEED_DISCORD_CHANNEL_ID", process.env.SEED_DISCORD_CHANNEL_ID);

const WS = `(select id from workspaces where slug = 'tomokichi')`;
const PROJECT = `(select id from projects where workspace_id = ${WS} and slug = 'zakkary')`;

const sql: string[] = [
  `INSERT INTO workspaces (id, name, slug, created_at, updated_at)
   VALUES (${uuid()}, 'Tomokichi', 'tomokichi', ${now}, ${now})
   ON CONFLICT (slug) DO UPDATE SET name = excluded.name;`,
  `INSERT INTO request_number_sequences (workspace_id, last_number)
   VALUES (${WS}, 0) ON CONFLICT (workspace_id) DO NOTHING;`,
  `INSERT INTO projects (id, workspace_id, name, slug, created_at, updated_at)
   VALUES (${uuid()}, ${WS}, 'Zakkary', 'zakkary', ${now}, ${now})
   ON CONFLICT (workspace_id, slug) DO UPDATE SET name = excluded.name;`,
];

if (adminEmail) {
  sql.push(
    `INSERT INTO users (id, workspace_id, name, email, role, created_at, updated_at)
     VALUES (${uuid()}, ${WS}, ${str(process.env.SEED_ADMIN_NAME ?? "Admin")}, ${str(adminEmail)}, 'admin', ${now}, ${now})
     ON CONFLICT (workspace_id, email) DO UPDATE SET role = 'admin';`,
  );
}

if (guildId) {
  sql.push(
    `INSERT INTO discord_integrations (id, workspace_id, name, discord_guild_id, created_at, updated_at)
     VALUES (${uuid()}, ${WS}, 'Zakkary Discord', ${str(guildId)}, ${now}, ${now})
     ON CONFLICT (discord_guild_id) DO UPDATE SET status = 'active';`,
  );
  if (channelId) {
    sql.push(
      `INSERT INTO discord_channel_mappings
         (id, integration_id, workspace_id, project_id, discord_guild_id, discord_channel_id, created_at, updated_at)
       VALUES (${uuid()}, (select id from discord_integrations where discord_guild_id = ${str(guildId)}),
         ${WS}, ${PROJECT}, ${str(guildId)}, ${str(channelId)}, ${now}, ${now})
       ON CONFLICT (discord_guild_id, discord_channel_id) DO NOTHING;`,
    );
  }
}

const file = join(mkdtempSync(join(tmpdir(), "prh-seed-")), "seed.sql");
writeFileSync(file, sql.join("\n") + "\n");

const result = spawnSync(
  "pnpm",
  ["exec", "wrangler", "d1", "execute", "DB", local ? "--local" : "--remote", "--file", file],
  { cwd: apiDir, stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);

if (adminEmail) console.log(`Admin user: ${adminEmail}`);
if (guildId && channelId) console.log(`Channel mapping: ${channelId} → Zakkary`);
console.log("Workspace tomokichi / Project zakkary ready");
