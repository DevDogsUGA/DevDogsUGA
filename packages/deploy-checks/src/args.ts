import type { Tier } from "./config.js";

export function requireArg(argv: readonly string[], flag: string): string {
  const index = argv.indexOf(flag);
  const value = index === -1 ? undefined : argv[index + 1];
  if (!value) {
    throw new Error(`Missing required ${flag} argument.`);
  }
  return value;
}

export function requireTier(argv: readonly string[]): Tier {
  const tier = requireArg(argv, "--tier");
  if (tier !== "staging" && tier !== "production") {
    throw new Error(`--tier must be "staging" or "production", got "${tier}".`);
  }
  return tier;
}
