"use server";

import { refresh } from "next/cache";
import { authenticate, expectSession } from "../auth";
import { unlinkProfile } from "../auth/providers/linkedin";

export default async function unlinkLinkedinProfile() {
  await expectSession().catch(() => authenticate("google", "/console/profile"));
  await unlinkProfile();
  refresh();
}
