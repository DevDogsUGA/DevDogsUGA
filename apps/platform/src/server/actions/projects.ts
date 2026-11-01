"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, type ActionResult } from "~/lib/actionResult";
import { authorize, authorizeSession, rules } from "~/server/auth/access";
import {
  addOwner,
  archiveProject,
  createProject,
  decideRepoLink,
  deleteProject,
  linkRepo,
  makeDevdogsOwned,
  removeOwner,
  setAdvisor,
  unarchiveProject,
  unlinkRepo,
  updateProject,
  type CreatedProject,
} from "~/server/projects/store";
import {
  deleteReport,
  fileReport,
  reviewReport,
} from "~/server/projects/reports";

/**
 * The project actions. Each authorizes through the Access module first, parses
 * its input, calls the domain module (which applies the Record rules and
 * returns an Action result) and revalidates on success. The rules live in
 * `server/projects/records.ts`; nothing here decides who may do what beyond
 * the session and officer gates.
 */

const uuid = z.string().uuid();
const repoId = z.string().regex(/^[1-9][0-9]{0,18}$/u);
const invalid = () => failure("That request is invalid.");

/** Every page a project change can show on. */
function refresh<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) {
    revalidatePath("/dashboard/projects");
    revalidatePath("/dashboard/projects/[idOrSlug]", "page");
    revalidatePath("/dashboard/reviews");
    revalidatePath("/dashboard/attendance");
  }
  return result;
}

const createSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(5000),
  tags: z.string().max(2000),
  repos: z.string().max(2000),
});

export async function createProjectAction(
  formData: FormData,
): Promise<ActionResult<CreatedProject>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid();
  return refresh(await createProject(access.caller, parsed.data));
}

const updateSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(5000),
  tags: z.string().max(2000),
});

/** The Draft's save: name, description and tags of one project. */
export async function updateProjectAction(
  projectId: string,
  values: { name: string; description: string; tags: string },
): Promise<ActionResult<void>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  const parsed = updateSchema.safeParse(values);
  if (!uuid.safeParse(projectId).success || !parsed.success) return invalid();
  return refresh(await updateProject(access.caller, projectId, parsed.data));
}

export async function linkRepoAction(
  formData: FormData,
): Promise<ActionResult<{ approval: "approved" | "pending" }>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  const parsed = z
    .object({ projectId: uuid, repo: z.string().max(300) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid();
  return refresh(
    await linkRepo(access.caller, parsed.data.projectId, parsed.data.repo),
  );
}

export async function unlinkRepoAction(
  projectId: string,
  githubRepoId: string,
): Promise<ActionResult<void>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  if (
    !uuid.safeParse(projectId).success ||
    !repoId.safeParse(githubRepoId).success
  )
    return invalid();
  return refresh(await unlinkRepo(access.caller, projectId, githubRepoId));
}

export async function addOwnerAction(
  projectId: string,
  userId: string,
): Promise<ActionResult<void>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(userId).success)
    return invalid();
  return refresh(await addOwner(access.caller, projectId, userId));
}

export async function removeOwnerAction(
  projectId: string,
  userId: string,
): Promise<ActionResult<void>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(userId).success)
    return invalid();
  return refresh(await removeOwner(access.caller, projectId, userId));
}

export async function archiveProjectAction(
  projectId: string,
): Promise<ActionResult<void>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  if (!uuid.safeParse(projectId).success) return invalid();
  return refresh(await archiveProject(access.caller, projectId));
}

export async function unarchiveProjectAction(
  projectId: string,
): Promise<ActionResult<void>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  if (!uuid.safeParse(projectId).success) return invalid();
  return refresh(await unarchiveProject(access.caller, projectId));
}

export async function deleteProjectAction(
  projectId: string,
): Promise<ActionResult<void>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  if (!uuid.safeParse(projectId).success) return invalid();
  return refresh(await deleteProject(access.caller, projectId));
}

// ── Officer-only ────────────────────────────────────────────────────────────

export async function decideRepoLinkAction(
  projectId: string,
  githubRepoId: string,
  decision: "approve" | "decline",
): Promise<ActionResult<void>> {
  const access = await authorize(rules.officer);
  if (!access.ok) return access;
  if (
    !uuid.safeParse(projectId).success ||
    !repoId.safeParse(githubRepoId).success ||
    (decision !== "approve" && decision !== "decline")
  )
    return invalid();
  return refresh(
    await decideRepoLink(access.caller, projectId, githubRepoId, decision),
  );
}

/** `advisorId` of `null` clears the advisor. */
export async function setAdvisorAction(
  projectId: string,
  advisorId: string | null,
): Promise<ActionResult<void>> {
  const access = await authorize(rules.officer);
  if (!access.ok) return access;
  if (
    !uuid.safeParse(projectId).success ||
    (advisorId !== null && !uuid.safeParse(advisorId).success)
  )
    return invalid();
  return refresh(await setAdvisor(access.caller, projectId, advisorId));
}

export async function makeDevdogsOwnedAction(
  projectId: string,
): Promise<ActionResult<void>> {
  const access = await authorize(rules.officer);
  if (!access.ok) return access;
  if (!uuid.safeParse(projectId).success) return invalid();
  return refresh(await makeDevdogsOwned(access.caller, projectId));
}

// ── Reports ─────────────────────────────────────────────────────────────────

const reportSchema = z.object({
  reportId: uuid.optional(),
  projectId: uuid,
  startDate: z.string().max(10),
  endDate: z.string().max(10),
  hours: z.coerce.number(),
  content: z.string().max(20000),
});

export async function fileReportAction(
  formData: FormData,
): Promise<ActionResult<{ reportId: string }>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  const raw = Object.fromEntries(formData);
  if (raw.reportId === "") delete raw.reportId;
  const parsed = reportSchema.safeParse(raw);
  const shas = z
    .array(z.string().max(64))
    .max(300)
    .safeParse(formData.getAll("sha"));
  if (!parsed.success || !shas.success) return invalid();
  return refresh(
    await fileReport(access.caller, { ...parsed.data, shas: shas.data }),
  );
}

export async function deleteReportAction(
  reportId: string,
): Promise<ActionResult<void>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  if (!uuid.safeParse(reportId).success) return invalid();
  return refresh(await deleteReport(access.caller, reportId));
}

const reviewSchema = z.object({
  reportId: uuid,
  intent: z.enum(["approve", "return"]),
  hours: z.coerce.number().optional(),
  note: z.string().max(5000).optional(),
});

/** Whether the caller may review this report is the Record rule `reviewVerdict` in `records.ts`. */
export async function reviewReportAction(
  formData: FormData,
): Promise<ActionResult<{ authorId: string }>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  const raw = Object.fromEntries(formData);
  if (raw.hours === "") delete raw.hours;
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  return refresh(
    await reviewReport(
      access.caller,
      parsed.data.reportId,
      parsed.data.intent === "approve"
        ? { action: "approve", hours: parsed.data.hours ?? Number.NaN }
        : { action: "return", note: parsed.data.note ?? "" },
    ),
  );
}
