import { headers } from "next/headers";
import * as z from "zod";
import { env } from "~/env";

export const callbackPathSchema = z.string().transform((path, ctx) => {
  try {
    const url = new URL(String(path), env.BASE_URL);
    return url.toString().replace(url.origin, "");
  } catch {
    ctx.addIssue({
      code: "custom",
      message: "Provided string should be a path.",
      input: path,
    });
    return z.NEVER;
  }
});

/**
 * Extracts a callback path from either the `callbackPath` field in `formData` or the `referer` field in the incoming request headers.
 * @param fallback Used if `callbackPath` is not present in `formData` or `referer` is not present in `headers()`.
 * @param formData A `FormData` obect.
 * @returns The extracted callback path.
 */
export async function getCallbackPath(fallback: string, formData?: FormData) {
  const referer = (await headers()).get("referer");
  return await callbackPathSchema
    .parseAsync(formData?.get("callbackPath"))
    .catch(() => callbackPathSchema.parseAsync(referer).catch(() => fallback));
}

export function generateSecureString(byteCount: number) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(byteCount)))
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
