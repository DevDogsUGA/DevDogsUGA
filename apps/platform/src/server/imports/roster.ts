import {
  createAccounts,
  ImportInputError,
  matches,
  parseRoster,
  planImport,
  type ImportPlan,
} from "@devdogsuga/events/imports";
import type {
  ImportMapping,
  ImportPreview,
  ImportResult,
  InvalidRow,
  MappingField,
  SummaryLine,
} from "~/lib/imports";
import { fingerprintOf } from "./fingerprint";
import {
  auditFileName,
  capInvalid,
  sample,
  who,
  type Analysis,
} from "./shared";
import type { AuditDraft, ImportDeps, ImportRequest } from "./types";

/** The organization a roster must be for. Compared case-insensitively. */
export const ORGANIZATION = "DevDogs";

export const ROSTER_FIELDS: MappingField[] = [
  { key: "firstName", label: "First name column", required: true },
  { key: "lastName", label: "Last name column", required: true },
  { key: "email", label: "UGA email column", required: true },
];

export interface RosterPlanned {
  plan: ImportPlan;
  snapshot: boolean;
  invalidCount: number;
}

export async function analyzeRoster(
  req: ImportRequest,
  deps: ImportDeps,
): Promise<Analysis<RosterPlanned>> {
  const picked = (key: string) =>
    req.mapping[key] === "" ? undefined : req.mapping[key];
  const roster = parseRoster(req.text, {
    ugaOnly: true,
    columns: {
      firstName: picked("firstName"),
      lastName: picked("lastName"),
      email: picked("email"),
    },
  });
  const wrongOrg = roster.organizations.filter(
    (o) => o.toLowerCase() !== ORGANIZATION.toLowerCase(),
  );
  if (wrongOrg.length > 0) {
    throw new ImportInputError(
      `This roster is for ${wrongOrg.join(", ")}, not ${ORGANIZATION}.`,
    );
  }

  const snapshot = req.mode === "replace";
  const accounts = await deps.accounts();
  const plan = planImport(roster.members, accounts);

  const invalid: InvalidRow[] = [
    ...roster.skippedLines.map((line) => ({
      line,
      value: "",
      reason: "Missing a first name, last name or email",
    })),
    ...roster.notUga.map((n) => ({
      line: n.line,
      value: n.email,
      reason: "Not a UGA (@uga.edu) address",
    })),
  ];

  const mapping: ImportMapping = { ...roster.columns };
  const summary: SummaryLine[] = [
    { label: "On the roster", count: roster.members.length },
    { label: "Already verified", count: plan.keep.length },
    { label: "Newly verified (have an account)", count: plan.verify.length },
    { label: "Accounts to create, then verify", count: plan.create.length },
  ];
  if (snapshot) {
    summary.push({
      label: "Verified now but not on the roster, to lose verification",
      count: plan.drop.length,
      tone: "remove",
    });
  }
  const warnings: string[] = [];
  if (roster.conflictingNames.length > 0) {
    warnings.push(
      `${roster.conflictingNames.length} ${roster.conflictingNames.length === 1 ? "address is" : "addresses are"} listed under two names; the first is kept.`,
    );
  }
  if (plan.sharedAccounts.length > 0) {
    warnings.push(
      `${plan.sharedAccounts.length} roster ${plan.sharedAccounts.length === 1 ? "email" : "emails"} matched an account another roster email already claimed, and ${plan.sharedAccounts.length === 1 ? "is" : "are"} skipped.`,
    );
  }
  if (plan.nameDiffers.length > 0) {
    warnings.push(
      `${plan.nameDiffers.length} ${plan.nameDiffers.length === 1 ? "member goes" : "members go"} by a preferred name that differs from the roster. Preferred names are never changed.`,
    );
  }

  let blocked: string | null = null;
  if (roster.members.length === 0) {
    blocked = "The roster has no valid members.";
  } else if (snapshot && invalid.length > 0) {
    blocked =
      "Snapshot mode cannot run while rows are invalid, because anyone only on those rows would lose verification. Correct the file, or use add-only.";
  } else if (
    plan.create.length + plan.verify.length === 0 &&
    !(snapshot && plan.drop.length > 0)
  ) {
    blocked = "Nothing to change: everyone on the roster is already verified.";
  }

  const preview: ImportPreview = {
    kind: "roster",
    mode: req.mode,
    fileName: req.fileName,
    headers: roster.headers,
    mappingFields: ROSTER_FIELDS,
    mapping,
    meeting: null,
    summary,
    samples: [
      ...sample(
        "Newly verified",
        plan.verify.map((m) =>
          who({
            ...m.member,
            name: `${m.member.firstName} ${m.member.lastName}`,
          }),
        ),
      ),
      ...sample(
        "New accounts",
        plan.create.map((m) =>
          who({ email: m.email, name: `${m.firstName} ${m.lastName}` }),
        ),
      ),
      ...(snapshot
        ? sample(
            "Losing verification",
            plan.drop.map((d) => d.name),
          )
        : []),
    ],
    warnings,
    ...capInvalid(invalid),
    blocked,
    fingerprint: await fingerprintOf({
      kind: "roster",
      mode: req.mode,
      mapping,
      create: plan.create.map((m) => m.email).sort(),
      verify: plan.verify.map((m) => m.userId).sort(),
      keep: plan.keep.map((m) => m.userId).sort(),
      drop: snapshot ? plan.drop.map((d) => d.userId).sort() : [],
      invalid: invalid.map((r) => `${r.line}:${r.value}`).sort(),
    }),
  };
  return { preview, plan: { plan, snapshot, invalidCount: invalid.length } };
}

function result(
  req: ImportRequest,
  a: Analysis<RosterPlanned>,
  status: ImportResult["status"],
  message: string,
  counts: SummaryLine[],
  failures: ImportResult["failures"],
): ImportResult {
  return {
    status,
    kind: "roster",
    mode: req.mode,
    message,
    counts,
    failures,
    invalid: a.preview.invalid,
    invalidMore: a.preview.invalidMore,
  };
}

/**
 * Writes a confirmed roster import (Q74, Q81). Accounts first; in snapshot
 * mode a single failed account stops everything before any verification is
 * removed, and the retry uses the whole file.
 */
export async function applyRoster(
  req: ImportRequest,
  a: Analysis<RosterPlanned>,
  actorUserId: string,
  deps: ImportDeps,
): Promise<ImportResult> {
  const { plan, snapshot } = a.plan;
  const { created, failed } = await createAccounts(
    plan.create.map((m) => m.email),
    deps.createAccount,
  );
  const failures = failed.map((f) => ({ email: f.email, reason: f.reason }));
  const targetId = crypto.randomUUID();
  const base = {
    mode: req.mode,
    fileName: auditFileName(req.fileName),
    invalidRows: a.plan.invalidCount,
    accountsCreated: created.size,
    accountFailures: failures.length,
  };
  const draft = (extra: Record<string, unknown>): AuditDraft => ({
    actorUserId,
    action: "import.roster",
    targetId,
    metadata: { ...base, ...extra },
  });

  if (snapshot && failures.length > 0) {
    await deps.audit(draft({ outcome: "stopped", verified: 0, cleared: 0 }));
    return result(
      req,
      a,
      "stopped",
      `${failures.length} ${failures.length === 1 ? "account" : "accounts"} could not be created, so no one was unverified. Fix the problem and run the snapshot again with the complete file; accounts that were made are reused.`,
      [{ label: "Accounts created", count: created.size }],
      failures,
    );
  }

  const members = [
    ...matches(plan).map((m) => ({
      userId: m.userId,
      email: m.member.email,
      firstName: m.member.firstName,
      lastName: m.member.lastName,
    })),
    ...plan.create.flatMap((m) => {
      const userId = created.get(m.email);
      return userId
        ? [
            {
              userId,
              email: m.email,
              firstName: m.firstName,
              lastName: m.lastName,
            },
          ]
        : [];
    }),
  ];
  const written = await deps.writeRoster(
    { members, snapshot },
    draft({ outcome: failures.length > 0 ? "partial" : "done" }),
  );
  const counts: SummaryLine[] = [
    { label: "Profiles verified", count: written.written },
    { label: "Accounts created", count: created.size },
  ];
  if (snapshot) {
    counts.push({ label: "Verification removed", count: written.cleared });
  }
  const partial = failures.length > 0 || a.plan.invalidCount > 0;
  return result(
    req,
    a,
    partial ? "partial" : "done",
    failures.length > 0
      ? `Verified ${written.written}; ${failures.length} ${failures.length === 1 ? "account" : "accounts"} could not be created. Run the import again to add them.`
      : a.plan.invalidCount > 0
        ? `Verified ${written.written}; ${a.plan.invalidCount} ${a.plan.invalidCount === 1 ? "row was" : "rows were"} skipped.`
        : `Verified ${written.written}${snapshot ? `, removed ${written.cleared}` : ""}.`,
    counts,
    failures,
  );
}
