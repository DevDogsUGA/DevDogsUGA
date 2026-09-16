import { type Target } from "../stack.js";
import { generateTypes } from "./run.js";

export async function runGenerateTypes(target: Target): Promise<number> {
  return generateTypes(target.kind === "remote");
}
