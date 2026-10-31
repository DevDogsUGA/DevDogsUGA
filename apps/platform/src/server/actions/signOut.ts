"use server";

import { publicAction } from "~/server/auth/access";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../supabase/server";
import { getCallbackPath } from "../utils";

export default async function signOut(formData: FormData) {
  // Public: Clears cookies even when the session has already expired.
  publicAction();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(await getCallbackPath("/", formData));
}
