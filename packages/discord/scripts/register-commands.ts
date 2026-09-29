/**
 * Registers /request and the "機能要望として登録" message command.
 *
 *   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... [DISCORD_GUILD_ID=...] pnpm discord:register
 *
 * With DISCORD_GUILD_ID the commands are registered to that guild only (instant update).
 */
import { COMMANDS } from "../src/commands";
import { DiscordRest } from "../src/rest";

const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
if (!applicationId || !botToken) {
  throw new Error("DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN are required");
}

const rest = new DiscordRest({ applicationId, botToken });
const result = await rest.bulkOverwriteCommands(COMMANDS, process.env.DISCORD_GUILD_ID);
console.log(`Registered ${result.length} command(s)`);
