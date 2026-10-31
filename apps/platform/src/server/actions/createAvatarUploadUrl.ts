"use server";

import { authorizeSession } from "~/server/auth/access";

import { supabaseAdmin } from "~/supabase/admin";
import { env } from "~/env";

export default async function createAvatarUploadUrl(): Promise<string> {
  const access = await authorizeSession();
  if (!access.ok) {
    throw new Error(access.message);
  }

  const userId = access.caller.userId;

  const { data, error } = await supabaseAdmin.storage
    .from(env.NEXT_PUBLIC_AVATARS_BUCKET)
    .createSignedUploadUrl(userId, { upsert: true });

  if (error ?? !data) {
    throw new Error("Failed to create avatar upload URL");
  }

  return data.token;
}
