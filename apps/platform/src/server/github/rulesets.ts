/**
 * The branch ruleset that makes team isolation real.
 *
 * Pure payload builder, separate from the API calls in `teamSync.ts`, because
 * every property that matters here is a property of the *shape*: which rules,
 * which refs, who bypasses. None of it is observable from a successful HTTP
 * response. A ruleset with the wrong `include` pattern, or with a bypass actor
 * that is not the team it is named for, returns 201 exactly like a correct one
 * and protects nothing.
 *
 * ## Why a ruleset and not team permissions
 *
 * `provisionTeam` grants the GitHub team `push` on the repository, and GitHub
 * team permissions have NO BRANCH DIMENSION: the grant is repository-wide or
 * it does not exist. So joining any team means push access to every other
 * team's branch.
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
 *    other. A broad `team/**` ruleset carrying `update` alongside the
 *    per-team ones would leave every team blocked by the broad one while
 *    bypassing only its own. The branches would be readable but unpushable,
 *    and the cause would not appear in either ruleset read on its own.
 *    **Never run an `update`-bearing `team/**` ruleset alongside the
 *    per-team ones.**
 *
 *    A `team/**` ruleset carrying `creation`, `deletion` and
 *    `non_fast_forward` — deliberately NOT `update` — is the one exception,
 *    and it does run alongside the per-team ones today (`devtools github
 *    rulesets` in Backstage's `packages/devtools/src/gh/rulesets/desired.ts`
 *    creates it). `update` is the one rule type a per-team ruleset itself
 *    carries and bypasses its own team for; leaving it out of the fixed
 *    ruleset is what keeps the two from aggregating into the exact failure
 *    above. The other three rule types are added there DELIBERATELY,
 *    because they aggregate the other direction: a team is a bypass actor on
 *    its OWN per-team ruleset, not on the fixed `team/**` one, so a team can
 *    no longer create, delete or force-push its own branch on its own say-so
 *    — TASK-324's access-control checklist requires exactly that refusal.
 *    (See `teamRulesetPayload`'s doc below for what this changed about that
 *    ruleset's own reasoning on `deletion` and `non_fast_forward`.) The
 *    front-running hole this also closes predates TASK-324: every team
 *    member holds the repository-wide `push` grant from `provisionTeam`, so
 *    before a team is provisioned, any member can front-run the platform's
 *    own `cutTeamBranch` and create `team/<slug>` themselves — restricting
 *    `creation` on `team/**` to the platform's own GitHub App (plus devops)
 *    closes that.
 *
 * 3. **75 rulesets per repository.** Fixed cost is 5, not 4: `main`,
 *    `production`, `~ALL`, the tag ruleset, and the fixed `team/**` ruleset
 *    from constraint 2 above, leaving 70 for teams. A team's ruleset is
 *    created when the team is and deleted when it is disbanded (see
 *    `teamSync.ts`'s `disbandTeam`), so the count tracks how many teams
 *    concurrently EXIST rather than accumulating forever the way one per
 *    competition-week did.
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
 * Deterministic, and derived from the same slug as the branch.
 *
 * Rulesets are addressed by numeric id, which nothing here stores, so every
 * lookup is "list them and match by name". A name that cannot be recomputed
 * from the team would make the ruleset unfindable the moment provisioning
 * re-ran, and `createRepoRuleset` does not reject duplicate names, so the
 * second call would quietly leave two.
 */
export function teamRulesetName(teamSlug: string): string {
  return `team/${teamSlug}`;
}

/**
 * The ruleset for one team's branch.
 *
 * `update` is the load-bearing rule: it restricts pushes to the matching ref to
 * bypass actors only. The competition team and the organization admins are
 * the only bypass actors. Every other team holds the same repository-wide
 * `push` grant and is stopped here and nowhere else.
 *
 * `deletion` stops another team removing this branch. It does NOT stop the team
 * removing its own, because bypass is ruleset-scoped (constraint 1) — THIS
 * ruleset alone would let a team delete its own work. That used to be an
 * accepted trade (a second ruleset per team, at twice the cost against a
 * 75-ruleset ceiling, just to stop a team deleting something only theirs,
 * was judged not worth it). TASK-324's access-control checklist closed it
 * anyway, one level up: the fixed `team/**` ruleset (constraint 2 above) now
 * carries its OWN `deletion` rule, bypassed by the App and devops but NOT by
 * any team, so the aggregate result is that a team can no longer delete its
 * own branch even though this ruleset alone would let it. Nothing changes
 * here — the fixed ruleset is what closed it, not this one.
 *
 * Deliberately NOT included:
 *
 *   * `creation`: the branch is cut by `cutTeamBranch` using the org token
 *     BEFORE this ruleset exists. A `creation` rule would be inert on an
 *     existing ref and would block re-provisioning after a branch was deleted.
 *     The front-running gap this leaves (any member can create `team/<slug>`
 *     themselves before the platform does) is closed one level up, by the
 *     fixed `team/**` ruleset in constraint 2 above — never by adding
 *     `creation` here.
 *   * `non_fast_forward`: rebasing your own feature branch used to be
 *     ordinary work this ruleset let a team bypass on its own branch. As of
 *     TASK-324, the fixed `team/**` ruleset (constraint 2) now carries its
 *     own `non_fast_forward` rule too, bypassed by the App and devops but
 *     not by any team, so a team can no longer force-push its own branch
 *     either — closed the same way `deletion` was, one level up, not by
 *     adding the rule here.
 *   * `pull_request`: there is no shared integration branch any team PRs into
 *     for a review gate to live on.
 *
 * An EXACT ref, not a pattern: `team/<slug>` is a prefix of `team/<slug>-2`,
 * so a `fnmatch` pattern would let one team's ruleset govern another team's
 * branch and, because that team is its bypass actor, hand them push access to
 * it.
 */
export function teamRulesetPayload(
  teamSlug: string,
  githubTeamId: number,
  adminsTeamId: number,
): RulesetPayload {
  return {
    name: teamRulesetName(teamSlug),
    target: "branch",
    enforcement: "active",
    bypass_actors: [
      { actor_id: githubTeamId, actor_type: "Team", bypass_mode: "always" },
      { actor_id: adminsTeamId, actor_type: "Team", bypass_mode: "always" },
    ],
    conditions: {
      ref_name: {
        include: [`refs/heads/team/${teamSlug}`],
        exclude: [],
      },
    },
    rules: [{ type: "update" }, { type: "deletion" }],
  };
}
