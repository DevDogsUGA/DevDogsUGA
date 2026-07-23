import type { NextRequest } from "next/server";
import { authenticate } from "~/server/auth";
import { callbackPathSchema } from "~/server/utils";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("callbackPath");
  const callbackPath = raw
    ? await callbackPathSchema.parseAsync(raw).catch(() => "/")
    : "/";
  await authenticate("google", callbackPath);
}
