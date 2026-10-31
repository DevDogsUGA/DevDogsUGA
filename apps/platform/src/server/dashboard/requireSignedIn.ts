import "server-only";
import { redirect } from "next/navigation";
import { expectUserWith } from "~/server/auth";

/** Preserve the settings sign-in callback until B2 supplies a layout gate. */
export async function requireSignedIn(path: string) {
  await expectUserWith({ profile: true }).catch(() => {
    redirect(`/auth?callbackPath=${encodeURIComponent(path)}`);
  });
}
