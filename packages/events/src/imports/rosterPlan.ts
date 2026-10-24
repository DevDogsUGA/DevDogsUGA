/**
 * What an import would do, worked out before anything is written.
 *
 * The roster is the whole truth about who is involved: everyone on it is
 * verified, and everyone verified who is not on it loses that status. So the
 * plan is four lists, and the preview prints them before the confirmation.
 *
 * Preferred names are never changed: the roster's spelling may not be the
 * name a member goes by, and the preferred name is what the site shows. A
 * difference is listed for an officer to follow up on.
 *
 * A roster email finds its account the way `production/accounts.ts` says:
 * the profile's `ugaEmail` first, then the sign-in address.
 */
import { accountFinder, type AccountRow } from "./accounts.js";
import type { InvolvementMember } from "./roster.js";

export type { AccountRow };

export interface Match {
  member: InvolvementMember;
  userId: string;
  /** No profile row yet: the import inserts one rather than updating it. */
  hasProfile: boolean;
  /** The profile's preferred name, which the import never changes. */
  preferredName: string | null;
}

export interface ImportPlan {
  /** On the roster with no account: one is created, then verified. */
  create: InvolvementMember[];
  /** Has an account, not verified until now. */
  verify: Match[];
  /** Already verified, still on the roster. */
  keep: Match[];
  /** Verified now, absent from the roster: loses involvement status. */
  drop: { userId: string; name: string }[];
  /** Roster emails that landed on an account another roster email already claimed. */
  sharedAccounts: { email: string; userId: string }[];
  /** Matched members whose preferred name is not the roster's name. Listed, never changed. */
  nameDiffers: Match[];
}

function nonBlank(value: string | null): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  return v;
}

export function planImport(
  members: readonly InvolvementMember[],
  accounts: readonly AccountRow[],
): ImportPlan {
  const find = accountFinder(accounts);
  const plan: ImportPlan = {
    create: [],
    verify: [],
    keep: [],
    drop: [],
    sharedAccounts: [],
    nameDiffers: [],
  };
  const claimed = new Set<string>();

  for (const member of members) {
    const account = find(member.email);
    if (!account) {
      plan.create.push(member);
      continue;
    }
    if (claimed.has(account.userId)) {
      plan.sharedAccounts.push({
        email: member.email,
        userId: account.userId,
      });
      continue;
    }
    claimed.add(account.userId);
    const match = {
      member,
      userId: account.userId,
      hasProfile: account.hasProfile,
      preferredName: account.preferredName,
    };
    const rosterName = `${member.firstName} ${member.lastName}`.toLowerCase();
    if (
      account.hasProfile &&
      account.preferredName?.trim().toLowerCase() !== rosterName
    ) {
      plan.nameDiffers.push(match);
    }
    if (account.involvementFirstName != null) plan.keep.push(match);
    else plan.verify.push(match);
  }

  for (const account of accounts) {
    if (account.involvementFirstName == null || claimed.has(account.userId)) {
      continue;
    }
    plan.drop.push({
      userId: account.userId,
      name:
        nonBlank(account.preferredName) ??
        `${account.involvementFirstName} ${account.involvementLastName ?? ""}`.trim(),
    });
  }
  plan.drop.sort((a, b) => a.name.localeCompare(b.name));
  return plan;
}

/** Everyone the import writes a profile for, created accounts excluded. */
export function matches(plan: ImportPlan): Match[] {
  return [...plan.verify, ...plan.keep];
}
