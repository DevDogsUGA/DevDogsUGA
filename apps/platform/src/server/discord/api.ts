import { REST, type ResponseLike, type RESTOptions } from "@discordjs/rest";
import { env } from "~/env";

/**
 * The Workers runtime forbids `WebAssembly.compile()` at request time, and
 * @discordjs/rest's DEFAULT transport is undici — whose first request compiles
 * the llhttp parser's Wasm, which took down every staging page render as an
 * unhandled CompileError (2026-08-20). `makeRequest: fetch` is the library's
 * own documented escape hatch; the platform-native fetch needs no parser.
 * Bound in an arrow so the runtime, not module load, resolves `fetch`.
 */
const workersSafeTransport: Partial<RESTOptions> = {
  // The casts bridge undici's types to the platform ones — same shapes at
  // runtime; TS balks only at DOM-vs-undici ReadableStream generics.
  makeRequest: (url, init) =>
    fetch(url, init as globalThis.RequestInit) as Promise<ResponseLike>,
};

/**
 * @param accessToken The access token for the user.
 * @returns A discord.js REST API instance authenticated as a specific user.
 */
export function asUser(accessToken: string) {
  return new REST({
    authPrefix: "Bearer",
    version: "10",
    ...workersSafeTransport,
  }).setToken(accessToken);
}

/**
 * @returns A discord.js REST API instance authenticated as the RoboDog Discord bot.
 */
export function asBot() {
  return new REST({ version: "10", ...workersSafeTransport }).setToken(
    env.DISCORD_TOKEN,
  );
}
