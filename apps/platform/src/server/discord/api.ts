import { REST } from "@discordjs/rest";
import { env } from "~/env";

/**
 * @param accessToken The access token for the user.
 * @returns A discord.js REST API instance authenticated as a specific user.
 */
export function asUser(accessToken: string) {
  return new REST({
    authPrefix: "Bearer",
    version: "10",
  }).setToken(accessToken);
}

/**
 * @returns A discord.js REST API instance authenticated as the RoboDog Discord bot.
 */
export function asBot() {
  return new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
}
