"use server";

import { publicAction } from "~/server/auth/access";

import { notFound } from "next/navigation";
import { authenticate } from "../auth";
import { getCallbackPath } from "../utils";

/**
 * Begins the authentication flow for a user.
 * @param formData Allows one field.
 * - `callbackPath` is the path to redirect the user to after the action completes. Defaults to the value of the `referer` header if present or `/` if not.
 */
export default async function signIn(formData?: FormData) {
  // Public: Starts authentication for signed-out visitors.
  publicAction();
  const callbackPath = await getCallbackPath("/", formData);
  await authenticate("google", callbackPath);
  console.error("Redirect failed.");
  notFound();
}
