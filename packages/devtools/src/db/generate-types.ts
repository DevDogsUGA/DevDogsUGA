import { generateTypes, type TypesConnection } from "./run.js";

export async function runGenerateTypes(conn: TypesConnection): Promise<number> {
  return generateTypes(conn);
}
