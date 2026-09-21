import { generateTypes } from "./run.js";

export async function runGenerateTypes(dbUrl: string): Promise<number> {
  return generateTypes(dbUrl);
}
