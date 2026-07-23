"use server";

import { notFound } from "next/navigation";
import { authenticate } from "../auth";
import { getCallbackPath } from "../utils";

/**
 * Begins an OAuth flow linking a GitHub profile to a signed-in user.
 * @param formData Allows one field.
 * - `callbackPath` is the path to redirect the user to after the action completes. Defaults to the value of the `referer` header if present or `/` if not.
 */
export default async function linkGithubProfile(formData: FormData) {
  const callbackPath = await getCallbackPath("/", formData);
  await authenticate("github", callbackPath);
  console.error("Redirect failed.");
  notFound();
}
