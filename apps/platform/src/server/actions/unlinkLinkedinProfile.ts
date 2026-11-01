"use server";

import { authorizeSession } from "~/server/auth/access";

import { refresh } from "next/cache";
import { authenticate, expectSession } from "../auth";
import { unlinkProfile } from "../auth/providers/linkedin";

export default async function unlinkLinkedinProfile() {
  const access = await authorizeSession();
  if (!access.ok) {
    await expectSession().catch(() =>
      authenticate("google", "/dashboard/accounts"),
    );
    throw new Error(access.message);
  }

  await expectSession().catch(() =>
    authenticate("google", "/dashboard/accounts"),
  );
  await unlinkProfile();
  refresh();
}
