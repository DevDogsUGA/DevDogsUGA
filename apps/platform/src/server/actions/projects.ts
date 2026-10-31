"use server";

import { authorizeSession, authorize, rules } from "~/server/auth/access";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  REPORT_PROBLEM_MESSAGE,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
} from "~/server/projects/policy";
import {
  addProjectMember,
  archiveProject,
  decideProject,
  deleteProjectReport,
  proposeProject,
  removeProjectMember,
  reviewProjectReport,
  setProjectAdvisor,
  submitProjectReport,
  updateProjectRepos,
  type DecideResult,
  type ManageResult,
  type ReviewResult,
  type SubmitResult,
} from "~/server/projects/store";

/**
 * The project actions. They parse input, name the actor, word the outcome and
 * revalidate; the rules and the audit rows live in `server/projects/store.ts`,
 * which re-checks the actor.
 */

export interface ProjectActionState {
  ok: boolean;
  message: string;
}

const uuid = z.string().uuid();

function refresh(projectId?: string) {
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/reviews");
  if (projectId) {
    revalidatePath(`/dashboard/reviews/${projectId}`);
    revalidatePath(`/dashboard/projects/${projectId}/report`);
  }
  revalidatePath("/dashboard/attendance");
}

const invalid: ProjectActionState = {
  ok: false,
  message: "That request is invalid.",
};

// ── Proposals and decisions ─────────────────────────────────────────────────

const proposeSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(5000),
  repos: z.string().max(2000),
});

const PROPOSE_MESSAGES = {
  name_invalid: `Give the project a name of 2 to ${PROJECT_NAME_MAX} characters.`,
  description_too_long: `Keep the description under ${PROJECT_DESCRIPTION_MAX} characters.`,
  too_many_open: "You already have three proposals waiting on leadership.",
  name_taken: "A project with that name already exists.",
} as const;

export async function proposeProjectAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const access = await authorizeSession();
  if (!access.ok) {
    throw new Error(access.message);
  }

  const parsed = proposeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  const userId = access.caller.userId;
  const result = await proposeProject(userId, parsed.data);
  if (result.status === "repos_invalid") {
    return { ok: false, message: result.message };
  }
  if (result.status !== "proposed") {
    return { ok: false, message: PROPOSE_MESSAGES[result.status] };
  }
  refresh();
  return {
    ok: true,
    message: "Proposal sent. Leadership will approve it and assign an advisor.",
  };
}

const DECIDE_MESSAGES: Record<
  Exclude<
    DecideResult["status"],
    "approved" | "declined" | "archived" | "advisor_set"
  >,
  string
> = {
  forbidden: "Only leadership can do that.",
  not_found: "That project was not found.",
  not_proposed: "That proposal was already decided.",
  not_active: "That project is not active.",
  unknown_advisor: "Choose a member as the advisor.",
};

function decided(
  result: DecideResult,
  done: string,
  projectId: string,
): ProjectActionState {
  if (
    result.status === "approved" ||
    result.status === "declined" ||
    result.status === "archived" ||
    result.status === "advisor_set"
  ) {
    refresh(projectId);
    return { ok: true, message: done };
  }
  return { ok: false, message: DECIDE_MESSAGES[result.status] };
}

const decideSchema = z.object({
  projectId: uuid,
  intent: z.enum(["approve", "decline"]),
  advisorId: z.string().max(40).optional(),
});

export async function decideProjectAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const access = await authorize(rules.officer);
  if (!access.ok) {
    return { ok: false, message: DECIDE_MESSAGES.forbidden };
  }

  const parsed = decideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  const officerId = access.caller.userId;
  if (parsed.data.intent === "decline") {
    return decided(
      await decideProject(officerId, parsed.data.projectId, {
        action: "decline",
      }),
      "Proposal declined.",
      parsed.data.projectId,
    );
  }
  const advisor = uuid.safeParse(parsed.data.advisorId);
  if (!advisor.success) {
    return { ok: false, message: DECIDE_MESSAGES.unknown_advisor };
  }
  return decided(
    await decideProject(officerId, parsed.data.projectId, {
      action: "approve",
      advisorId: advisor.data,
    }),
    "Project approved.",
    parsed.data.projectId,
  );
}

const advisorSchema = z.object({ projectId: uuid, advisorId: uuid });

export async function setProjectAdvisorAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const access = await authorize(rules.officer);
  if (!access.ok) {
    return { ok: false, message: DECIDE_MESSAGES.forbidden };
  }

  const parsed = advisorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  const officerId = access.caller.userId;
  return decided(
    await setProjectAdvisor(
      officerId,
      parsed.data.projectId,
      parsed.data.advisorId,
    ),
    "Advisor assigned.",
    parsed.data.projectId,
  );
}

const projectOnly = z.object({ projectId: uuid });

export async function archiveProjectAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const access = await authorize(rules.officer);
  if (!access.ok) {
    return { ok: false, message: DECIDE_MESSAGES.forbidden };
  }

  const parsed = projectOnly.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  const officerId = access.caller.userId;
  return decided(
    await archiveProject(officerId, parsed.data.projectId),
    "Project archived.",
    parsed.data.projectId,
  );
}

// ── Members and repositories ────────────────────────────────────────────────

const MANAGE_MESSAGES = {
  forbidden: "Only the project's advisor or leadership can do that.",
  not_found: "That project was not found.",
  not_active: "That project is not active.",
  unknown_member: "That member was not found.",
} as const;

function managed(
  result: ManageResult,
  done: string,
  projectId: string,
): ProjectActionState {
  if (result.status === "ok") {
    refresh(projectId);
    return { ok: true, message: done };
  }
  if (result.status === "repos_invalid") {
    return { ok: false, message: result.message };
  }
  return { ok: false, message: MANAGE_MESSAGES[result.status] };
}

const memberSchema = z.object({ projectId: uuid, userId: uuid });

export async function addProjectMemberAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const access = await authorizeSession();
  if (!access.ok) {
    throw new Error(access.message);
  }

  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  const actorId = access.caller.userId;
  return managed(
    await addProjectMember(actorId, parsed.data.projectId, parsed.data.userId),
    "Member added.",
    parsed.data.projectId,
  );
}

export async function removeProjectMemberAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const access = await authorizeSession();
  if (!access.ok) {
    throw new Error(access.message);
  }

  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  const actorId = access.caller.userId;
  return managed(
    await removeProjectMember(
      actorId,
      parsed.data.projectId,
      parsed.data.userId,
    ),
    "Member removed.",
    parsed.data.projectId,
  );
}

const reposSchema = z.object({ projectId: uuid, repos: z.string().max(2000) });

export async function updateProjectReposAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const access = await authorizeSession();
  if (!access.ok) {
    throw new Error(access.message);
  }

  const parsed = reposSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  const actorId = access.caller.userId;
  return managed(
    await updateProjectRepos(actorId, parsed.data.projectId, parsed.data.repos),
    "Repositories saved.",
    parsed.data.projectId,
  );
}

// ── Reports ─────────────────────────────────────────────────────────────────

const SUBMIT_MESSAGES = {
  not_found: "That project or report was not found.",
  not_member: "You are not on this project's member list. Ask its advisor.",
  not_active: "That project is not active.",
  leadership_separate:
    "Leadership's EL hours are handled separately, not through project reports.",
  locked: "An approved report cannot be changed.",
  pr_not_yours: "One of those pull requests is not yours.",
  pr_out_of_range: "A pull request was merged outside your date range.",
  pr_wrong_repo: "A pull request is not in one of the project's repositories.",
  pr_already_used: "A pull request is already cited by another report.",
} as const;

function submitMessage(result: SubmitResult): string {
  if (result.status === "invalid")
    return REPORT_PROBLEM_MESSAGE[result.problem];
  if (result.status === "submitted") return "Report submitted for review.";
  return SUBMIT_MESSAGES[result.status];
}

const reportSchema = z.object({
  reportId: uuid.optional(),
  projectId: uuid,
  startDate: z.string().max(10),
  endDate: z.string().max(10),
  hours: z.coerce.number(),
  content: z.string().max(20000),
});

export async function submitReportAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const access = await authorizeSession();
  if (!access.ok) {
    throw new Error(access.message);
  }

  const raw = Object.fromEntries(formData);
  if (raw.reportId === "") delete raw.reportId;
  const parsed = reportSchema.safeParse(raw);
  const ids = z
    .array(uuid)
    .max(200)
    .safeParse(formData.getAll("contributionId"));
  if (!parsed.success || !ids.success) return invalid;
  const userId = access.caller.userId;
  const result = await submitProjectReport(userId, {
    ...parsed.data,
    contributionIds: ids.data,
  });
  if (result.status === "submitted") refresh(parsed.data.projectId);
  return { ok: result.status === "submitted", message: submitMessage(result) };
}

const reportOnly = z.object({ reportId: uuid });

export async function deleteReportAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const access = await authorizeSession();
  if (!access.ok) {
    throw new Error(access.message);
  }

  const parsed = reportOnly.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  const userId = access.caller.userId;
  const result = await deleteProjectReport(userId, parsed.data.reportId);
  if (result === "deleted") {
    refresh();
    return { ok: true, message: "Report deleted." };
  }
  return {
    ok: false,
    message:
      result === "locked"
        ? "An approved report cannot be deleted."
        : "That report was not found.",
  };
}

const REVIEW_MESSAGES: Record<
  Exclude<ReviewResult["status"], "approved" | "returned">,
  string
> = {
  forbidden: "Only the project's advisor or leadership can review this.",
  own_report: "You cannot review your own report.",
  not_found: "That report was not found.",
  already_reviewed: "That report was already reviewed.",
  bad_hours: "Hours must be in quarter-hour steps, above 0 and up to 200.",
  note_required: "Say what the author should change.",
  note_too_long: "The note is too long.",
};

const reviewSchema = z.object({
  reportId: uuid,
  intent: z.enum(["approve", "return"]),
  hours: z.coerce.number().optional(),
  note: z.string().max(5000).optional(),
});

export async function reviewReportAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const access = await authorizeSession();
  if (!access.ok) {
    throw new Error(access.message);
  }

  const raw = Object.fromEntries(formData);
  if (raw.hours === "") delete raw.hours;
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return invalid;
  const actorId = access.caller.userId;
  const result = await reviewProjectReport(
    actorId,
    parsed.data.reportId,
    parsed.data.intent === "approve"
      ? { action: "approve", hours: parsed.data.hours ?? Number.NaN }
      : { action: "return", note: parsed.data.note ?? "" },
  );
  if (result.status === "approved" || result.status === "returned") {
    refresh();
    return {
      ok: true,
      message:
        result.status === "approved" ? "Report approved." : "Report returned.",
    };
  }
  return { ok: false, message: REVIEW_MESSAGES[result.status] };
}
