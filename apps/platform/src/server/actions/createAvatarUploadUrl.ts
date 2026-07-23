"use server";

import { expectSession } from "~/server/auth";
import { supabaseAdmin } from "~/supabase/admin";
import { env } from "~/env";

export default async function createAvatarUploadUrl(): Promise<string> {
  const userId = await expectSession();

  const { data, error } = await supabaseAdmin.storage
    .from(env.NEXT_PUBLIC_AVATARS_BUCKET)
    .createSignedUploadUrl(userId, { upsert: true });

  if (error ?? !data) {
    throw new Error("Failed to create avatar upload URL");
  }

  return data.token;
}
