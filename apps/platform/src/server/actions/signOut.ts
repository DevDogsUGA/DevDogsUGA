"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../supabase/server";
import { getCallbackPath } from "../utils";

export default async function signOut(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(await getCallbackPath("/", formData));
}
