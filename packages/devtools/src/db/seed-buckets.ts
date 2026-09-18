import { type Target } from "../stack.js";
import { seedBuckets } from "./run.js";

export async function runSeedBuckets(target: Target): Promise<number> {
  return seedBuckets(target.kind === "remote");
}
