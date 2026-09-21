import { seedBuckets, type BucketsConnection } from "./run.js";

export async function runSeedBuckets(conn: BucketsConnection): Promise<number> {
  return seedBuckets(conn);
}
