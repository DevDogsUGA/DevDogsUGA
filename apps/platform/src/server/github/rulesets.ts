/**
 * The branch rulesets that make competition team isolation real.
 *
 * Pure payload builders, separate from the API calls in `teamSync.ts`, because
 * every property that matters here is a property of the *shape*: which rules,
 * which refs, who bypasses. None of it is observable from a successful HTTP
 * response. A ruleset with the wrong `include` pattern, or with a bypass actor
 * that is not the team it is named for, returns 201 exactly like a correct one
 * and protects nothing.
 *
 * ## Why rulesets and not team permissions
 *
 * `provisionTeam` grants the GitHub team `push` on the repository, and GitHub
 * team permissions have NO BRANCH DIMENSION: the grant is repository-wide or
 * it does not exist. So joining any competition team means push access to every
 * other team's branch and to the integration branch judging reads from.
 *
 * That cannot be narrowed by adjusting the grant. The only mechanism GitHub
 * offers is a ruleset that restricts a ref pattern and names the team as the
 * one actor allowed past it.
 *
 * ## Three constraints that shape everything below
 *
 * 1. **Bypass actors are ruleset-scoped, not rule-scoped.** A team listed as a
 *    bypass actor bypasses every rule in that ruleset. There is no way to say
 *    "may push, may not delete" within one ruleset, which is why the per-team
 *    ruleset carries exactly the rules a team should be trusted with on its own
 *    branch.
 *
 * 2. **Rules AGGREGATE across rulesets, and bypass does not.** Two rulesets
 *    matching the same ref both apply, and bypassing one does not bypass the
 *    other. A broad `team/**` ruleset alongside the per-team ones would leave
 *    every team blocked by the broad one while bypassing its own. The branches
 *    would be readable but unpushable, and the cause would not appear in either
 *    ruleset read on its own. **Never run both at once.**
 *
 * 3. **75 rulesets per repository.** Fixed cost is 5: `main`, `production`,
 *    `~ALL`, `comp/**` and the tag ruleset, leaving 70 for teams. At ~4 teams
 *    a week over a 14-week semester (~56), one semester nearly exhausts it.
 *    `archiveRulesetPayload` is what makes the count come back down.
 */

/**
 * Literal types rather than `{ type: string }`.
 *
 * Octokit types `rules` as a discriminated union over every rule GitHub
 * supports, so a widened `string` is not assignable and the compiler says so.
 * That is the useful behaviour: a typo in a rule name would otherwise be sent,
 * accepted with a 201, and enforce nothing.
 */
export type RulesetRule = { type: "update" } | { type: "deletion" };

export interface RulesetBypassActor {
  actor_id: number;
  actor_type: "Team";
  bypass_mode: "always";
}

export interface RulesetPayload {
  name: string;
  target: "branch";
  enforcement: "active";
  bypass_actors: RulesetBypassActor[];
  conditions: { ref_name: { include: string[]; exclude: string[] } };
  rules: RulesetRule[];
}

/**
 * Deterministic, and derived from the same slugs as the branch.
 *
 * Rulesets are addressed by numeric id, which nothing here stores, so every
 * lookup is "list them and match by name". A name that cannot be recomputed
 * from the team would make the ruleset unfindable the moment provisioning
 * re-ran, and `createRepoRuleset` does not reject duplicate names, so the
 * second call would quietly leave two.
 */
export function teamRulesetName(
  competitionSlug: string,
  teamSlug: string,
): string {
  return `team/${competitionSlug}/${teamSlug}`;
}

/** One per competition, replacing its per-team rulesets once judging is done. */
export function archiveRulesetName(competitionSlug: string): string {
  return `archived/${competitionSlug}`;
}

/**
 * The live ruleset for one team's branch.
 *
 * `update` is the load-bearing rule: it restricts pushes to the matching ref to
 * bypass actors only, and the team is the only bypass actor. Every other
 * competition team holds the same repository-wide `push` grant and is stopped
 * here and nowhere else.
 *
 * `deletion` stops another team removing this branch. It does NOT stop the team
 * removing its own, because bypass is ruleset-scoped (constraint 1). That is
 * the right trade: the alternative is a second ruleset per team, at twice the
 * cost against a 75-ruleset ceiling, to stop a team deleting work that is only
 * theirs and whose pull request survives regardless.
 *
 * Deliberately NOT included:
 *
 *   * `creation`: the branch is cut by `cutTeamBranch` using the org token
 *     BEFORE this ruleset exists. A `creation` rule would be inert on an
 *     existing ref and would block re-provisioning after a branch was deleted.
 *   * `non_fast_forward`: rebasing your own feature branch is ordinary work,
 *     and the team would bypass it anyway.
 *   * `pull_request`: rules aggregate, so requiring reviews here would also
 *     require them on any other ruleset's count. The review gate belongs on the
 *     integration branch, which is what a team PRs *into*.
 *
 * An EXACT ref, not a pattern: `team/<comp>/<team>` is a prefix of
 * `team/<comp>/<team>-2`, so a `fnmatch` pattern would let one team's ruleset
 * govern another team's branch and, because that team is its bypass actor,
 * hand them push access to it.
 */
export function teamRulesetPayload(
  competitionSlug: string,
  teamSlug: string,
  githubTeamId: number,
): RulesetPayload {
  return {
    name: teamRulesetName(competitionSlug, teamSlug),
    target: "branch",
    enforcement: "active",
    bypass_actors: [
      { actor_id: githubTeamId, actor_type: "Team", bypass_mode: "always" },
    ],
    conditions: {
      ref_name: {
        include: [`refs/heads/team/${competitionSlug}/${teamSlug}`],
        exclude: [],
      },
    },
    rules: [{ type: "update" }, { type: "deletion" }],
  };
}

/**
 * One frozen ruleset covering every team branch of a finished competition.
 *
 * Replaces that competition's N per-team rulesets, taking the count from N to
 * 1, which keeps the 75-ruleset ceiling reachable across years rather than
 * across one semester.
 *
 * **Empty bypass list, and that is the entire point.** Deleting a per-team
 * ruleset does not freeze the branch, it OPENS it: every competition team holds
 * repository-wide `push`, so a branch governed by nothing is a branch anyone in
 * any team can rewrite. Teardown has to be replace-then-delete, never delete.
 *
 * This is also why `downgradeTeam` is not sufficient on its own. It sets the
 * team's repository permission to `pull`, which the plan's org base permission
 * of `write` overrides, because a floor cannot be lowered per-repository. After
 * that change the ruleset is the only thing still freezing the branch.
 */
export function archiveRulesetPayload(competitionSlug: string): RulesetPayload {
  return {
    name: archiveRulesetName(competitionSlug),
    target: "branch",
    enforcement: "active",
    bypass_actors: [],
    conditions: {
      ref_name: {
        include: [`refs/heads/team/${competitionSlug}/**`],
        exclude: [],
      },
    },
    rules: [{ type: "update" }, { type: "deletion" }],
  };
}
