import { type z } from "zod";

const PREFIX = "osb:";

export function readLocal<T>(key: string, schema: z.ZodType<T>): T {
  if (typeof window === "undefined") return schema.parse(undefined);
  try {
    return schema.parse(
      JSON.parse(window.localStorage.getItem(PREFIX + key) ?? "null"),
    );
  } catch {
    return schema.parse(undefined);
  }
}

export function writeLocal<T>(
  key: string,
  schema: z.ZodType<T>,
  value: T,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    PREFIX + key,
    JSON.stringify(schema.parse(value)),
  );
}

export function clearLocal(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PREFIX + key);
}
