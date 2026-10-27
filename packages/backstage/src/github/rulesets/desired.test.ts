import { describe, expect, it } from "vitest";
import { applyGates, hasMergeGroupTrigger } from "./gates.js";
import type { LiveRuleset } from "./types.js";
import { planRulesets } from "./diff.js";
import {
  BACKSTAGE_MERGE_QUEUE,
  DELETE_RULESET_NAMES,
  LEGACY_NAME_ALIASES,
  buildDesiredRulesets,
  isPerTeamRulesetName,
} from "./desired.js";

const actors = {
  devopsTeamId: 9002,
  focusLeadsTeamId: 9004,
  adminsTeamId: 9001,
};

describe("buildDesiredRulesets", () => {
  const desired = buildDesiredRulesets(actors);

  it("splits main rules so direct-push bypass never bypasses integrity", () => {
    expect(desired.map((rule) => rule.name)).toEqual([
      "main-integrity",
      "main-reviews",
      "main-ci",
      "main-merge-queue",
      "~ALL",
      "tag-protection",
      "release-tags",
    ]);
    expect(
      desired.find((rule) => rule.name === "main-integrity"),
    ).toMatchObject({
      bypass_actors: [],
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        { type: "required_signatures" },
      ],
    });
  });

  it("lets Renovate bypass main-reviews only via pull request, when resolved", () => {
    const withRenovate = buildDesiredRulesets({
      ...actors,
      renovateAppId: 2740,
    });
    expect(
      withRenovate.find((r) => r.name === "main-reviews")!.bypass_actors,
    ).toContainEqual({
      actor_id: 2740,
      actor_type: "Integration",
      bypass_mode: "pull_request",
    });
    const without = desired.find((r) => r.name === "main-reviews")!;
    expect(
      without.bypass_actors.some((a) => a.actor_type === "Integration"),
    ).toBe(false);
  });

  it("leaves the merge queue's own branches out of ~ALL", () => {
    const all = desired.find((rule) => rule.name === "~ALL")!;
    expect(all.conditions.ref_name.exclude).toContain(
      "refs/heads/gh-readonly-queue/**",
    );
  });

  it("has no update restriction on main, which would refuse the merge queue's push", () => {
    expect(desired.map((rule) => rule.name)).not.toContain("main-updates");
    for (const r of desired.filter((rule) => rule.name.startsWith("main-"))) {
      expect(r.rules.map((rule) => rule.type)).not.toContain("update");
    }
  });

  it("requires one code-owner approval from someone other than the last pusher", () => {
    const reviews = desired.find((rule) => rule.name === "main-reviews")!;
    expect(reviews.rules[0]).toMatchObject({
      type: "pull_request",
      parameters: {
        allowed_merge_methods: ["squash"],
        require_code_owner_review: true,
        require_last_push_approval: true,
        required_approving_review_count: 1,
        required_review_thread_resolution: true,
      },
    });
    expect(reviews.bypass_actors).toEqual([
      { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
    ]);
  });

  it("requires CI for everyone except the admin break-glass team", () => {
    const ci = desired.find((rule) => rule.name === "main-ci")!;
    expect(ci.bypass_actors).toEqual([
      { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
    ]);
    expect(ci.rules[0]).toMatchObject({
      type: "required_status_checks",
      parameters: {
        required_status_checks: [
          { context: "validate" },
          { context: "database" },
          { context: "toolchain" },
          { context: "dart-sdk" },
          { context: "destructive-sql" },
          { context: "destructive-gate" },
        ],
      },
    });
  });

  it("excludes only main and the merge queue's branches from the broad backstop, so team/* branches are locked down", () => {
    const all = desired.find((rule) => rule.name === "~ALL")!;
    expect(all.conditions.ref_name).toEqual({
      include: ["~ALL"],
      exclude: ["refs/heads/main", "refs/heads/gh-readonly-queue/**"],
    });
    expect(all.bypass_actors).toContainEqual({
      actor_id: 9004,
      actor_type: "Team",
      bypass_mode: "always",
    });
    expect(all.bypass_actors).toContainEqual({
      actor_id: 9002,
      actor_type: "Team",
      bypass_mode: "always",
    });
  });

  it("declares no team/** ruleset and no platform App bypass anywhere", () => {
    expect(desired.map((rule) => rule.name)).not.toContain("team/**");
    const withRenovate = buildDesiredRulesets({
      ...actors,
      renovateAppId: 2740,
    });
    for (const rule of withRenovate) {
      for (const actor of rule.bypass_actors) {
        if (actor.actor_type === "Integration") {
          expect(actor.actor_id).toBe(2740);
        }
      }
    }
  });
});

describe("release tags", () => {
  it("lets the publish job create @devdogsuga/** tags, which are never moved or deleted", () => {
    const rules = buildDesiredRulesets(actors);
    const tags = rules.find((r) => r.name === "tag-protection")!;
    const release = rules.find((r) => r.name === "release-tags")!;
    expect(tags.conditions.ref_name.exclude).toEqual(
      release.conditions.ref_name.include,
    );
    expect(release.rules.map((r) => r.type)).toEqual(["update", "deletion"]);
    expect(release.conditions.ref_name.include).toContain(
      "refs/tags/workshops-vscode@*",
    );
  });
});

describe("migration names", () => {
  it("renames the old combined main ruleset and removes production", () => {
    expect(LEGACY_NAME_ALIASES["main-reviews"]).toContain("main");
    expect(DELETE_RULESET_NAMES).toContain("production");
  });

  it("deletes the retired team/** ruleset, and plans ~ALL's widening before that delete", () => {
    expect(DELETE_RULESET_NAMES).toContain("team/**");
    const all = buildDesiredRulesets(actors).find((r) => r.name === "~ALL")!;
    const liveAll: LiveRuleset = {
      id: 1,
      ...all,
      conditions: {
        ref_name: {
          include: ["~ALL"],
          exclude: ["refs/heads/main", "refs/heads/team/**"],
        },
      },
    };
    const plan = planRulesets(
      [
        { id: 1, name: "~ALL", target: "branch" },
        { id: 2, name: "team/**", target: "branch" },
      ],
      new Map([[1, liveAll]]),
      actors,
      [all],
    );
    expect(plan.updates).toEqual([expect.objectContaining({ id: 1 })]);
    expect(plan.deletes).toEqual([
      expect.objectContaining({ id: 2, name: "team/**" }),
    ]);
  });
});

describe("isPerTeamRulesetName", () => {
  it("distinguishes exact team rules from the managed wildcard", () => {
    expect(isPerTeamRulesetName("team/frontend")).toBe(true);
    expect(isPerTeamRulesetName("team/**")).toBe(false);
    expect(isPerTeamRulesetName("main")).toBe(false);
  });
});

describe("buildDesiredRulesets for Backstage", () => {
  const backstageActors = {
    devopsTeamId: 9002,
    focusLeadsTeamId: 9004,
    adminsTeamId: 9001,
  };
  const without = buildDesiredRulesets(backstageActors, "Backstage");
  const withApp = buildDesiredRulesets(
    { ...backstageActors, deployPrAppId: 7777, renovateAppId: 2740 },
    "Backstage",
  );

  it("has no team/** rulesets, platform App or Renovate bypass", () => {
    expect(without.map((r) => r.name)).toEqual([
      "main-integrity",
      "main-reviews",
      "main-ci",
      "main-merge-queue",
      "~ALL",
      "tag-protection",
      "release-tags",
    ]);
    for (const r of withApp) {
      expect(r.bypass_actors.map((a) => a.actor_id)).not.toContain(2740);
    }
  });

  it("requires validate, database and toolchain in main-ci", () => {
    expect(without.find((r) => r.name === "main-ci")!.rules).toEqual([
      {
        type: "required_status_checks",
        parameters: {
          do_not_enforce_on_create: false,
          strict_required_status_checks_policy: false,
          required_status_checks: [
            { context: "validate", integration_id: 15368 },
            { context: "database", integration_id: 15368 },
            { context: "toolchain", integration_id: 15368 },
          ],
        },
      },
    ]);
  });

  it("keeps the merge queue in its own ruleset, with admins able to bypass it", () => {
    const queue = without.find((r) => r.name === "main-merge-queue")!;
    expect(queue.rules).toEqual([BACKSTAGE_MERGE_QUEUE]);
    expect(queue.bypass_actors).toEqual([
      { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
    ]);
    for (const r of without.filter((r) => r.name !== "main-merge-queue")) {
      expect(r.rules.map((x) => x.type)).not.toContain("merge_queue");
    }
    expect(BACKSTAGE_MERGE_QUEUE.parameters).toMatchObject({
      merge_method: "SQUASH",
      grouping_strategy: "ALLGREEN",
      min_entries_to_merge: 1,
      max_entries_to_merge: 5,
      max_entries_to_build: 5,
      min_entries_to_merge_wait_minutes: 5,
      check_response_timeout_minutes: 60,
    });
  });

  it("skips deploy/devdogsuga and keeps ~ALL covering it while the App is missing", () => {
    expect(without.find((r) => r.name === "deploy/devdogsuga")).toBeUndefined();
    expect(
      without.find((r) => r.name === "~ALL")!.conditions.ref_name.exclude,
    ).toEqual(["refs/heads/main", "refs/heads/gh-readonly-queue/**"]);
  });

  it("lets only admins and the deploy-PR App bypass deploy/devdogsuga, which ~ALL then excludes", () => {
    const deploy = withApp.find((r) => r.name === "deploy/devdogsuga")!;
    expect(deploy.conditions.ref_name.include).toEqual([
      "refs/heads/deploy/devdogsuga",
    ]);
    expect(deploy.bypass_actors).toEqual([
      { actor_id: 7777, actor_type: "Integration", bypass_mode: "always" },
      { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
    ]);
    expect(deploy.rules.map((r) => r.type).sort()).toEqual([
      "creation",
      "deletion",
      "non_fast_forward",
      "update",
    ]);
    const all = withApp.find((r) => r.name === "~ALL")!;
    expect(all.conditions.ref_name.exclude).toEqual([
      "refs/heads/main",
      "refs/heads/gh-readonly-queue/**",
      "refs/heads/deploy/devdogsuga",
    ]);
    expect(all.bypass_actors.map((a) => a.actor_id).sort()).toEqual([
      9001, 9002, 9004,
    ]);
  });

  it("gives DevDogsUGA the same queue-only main-merge-queue ruleset", () => {
    const dd = buildDesiredRulesets(actors);
    expect(dd.find((r) => r.name === "main-merge-queue")).toEqual(
      without.find((r) => r.name === "main-merge-queue"),
    );
    expect(
      dd.find((r) => r.name === "main-merge-queue")!.bypass_actors,
    ).toEqual([{ actor_id: 9001, actor_type: "Team", bypass_mode: "always" }]);
  });

  it("matches DevDogsUGA's main-integrity and main-reviews", () => {
    const dd = buildDesiredRulesets(actors);
    // Backstage is archived by the fold-back, so it never gained signed
    // commits: the one difference from DevDogsUGA's `main-integrity`.
    const integrity = (rules: typeof dd) =>
      rules
        .find((r) => r.name === "main-integrity")!
        .rules.map((rule) => rule.type);
    expect(integrity(without)).toEqual(["deletion", "non_fast_forward"]);
    expect(integrity(dd)).toEqual([
      "deletion",
      "non_fast_forward",
      "required_signatures",
    ]);
    expect(without.find((r) => r.name === "main-reviews")).toEqual(
      dd.find((r) => r.name === "main-reviews"),
    );
  });

  it("lets release tags be created but never moved or deleted", () => {
    const tags = without.find((r) => r.name === "tag-protection")!;
    const release = without.find((r) => r.name === "release-tags")!;
    expect(tags.conditions.ref_name.exclude).toEqual(
      release.conditions.ref_name.include,
    );
    expect(release.rules.map((r) => r.type)).toEqual(["update", "deletion"]);
  });
});

describe("merge queue gate", () => {
  const backstageActors = {
    devopsTeamId: 9002,
    focusLeadsTeamId: 9004,
    adminsTeamId: 9001,
  };
  const desired = buildDesiredRulesets(backstageActors, "Backstage");
  const empty = planRulesets([], new Map(), backstageActors, desired);

  it("detects merge_group triggers in every on: form, ignoring comments", () => {
    expect(hasMergeGroupTrigger("on:\n  pull_request:\n  merge_group:\n")).toBe(
      true,
    );
    expect(hasMergeGroupTrigger("on: [push, merge_group]\n")).toBe(true);
    expect(hasMergeGroupTrigger("# merge_group: later\non:\n  push:\n")).toBe(
      false,
    );
  });

  it("withholds the queue ruleset, with a reason, until CI runs on merge_group", () => {
    const plan = applyGates(empty, { ready: false, reason: "no merge_group" });
    expect(plan.blocked).toEqual([
      { name: "main-merge-queue", reason: "no merge_group" },
    ]);
    expect(plan.creates.map((c) => c.desired.name)).not.toContain(
      "main-merge-queue",
    );
    expect(plan.creates.map((c) => c.desired.name)).toContain("main-ci");
  });

  it("lets it through when ready", () => {
    const plan = applyGates(empty, { ready: true, reason: "" });
    expect(plan.blocked).toEqual([]);
    expect(plan.creates.map((c) => c.desired.name)).toContain(
      "main-merge-queue",
    );
  });
});

describe("buildDesiredRulesets for the product repositories", () => {
  const productActors = {
    devopsTeamId: 9002,
    focusLeadsTeamId: 9004,
    adminsTeamId: 9001,
    renovateAppId: 2740,
  };
  const checksOf = (repo: "DogDays" | "DogPack") =>
    (
      buildDesiredRulesets(productActors, repo).find(
        (r) => r.name === "main-ci",
      )!.rules[0] as {
        parameters: { required_status_checks: { context: string }[] };
      }
    ).parameters.required_status_checks.map((c) => c.context);

  for (const repo of ["DogDays", "DogPack"] as const) {
    describe(repo, () => {
      const desired = buildDesiredRulesets(productActors, repo);
      const named = (name: string) => desired.find((r) => r.name === name)!;

      it("needs no platform App", () => {
        expect(desired.map((r) => r.name)).toEqual([
          "main-integrity",
          "main-reviews",
          "main-ci",
          "main-merge-queue",
        ]);
      });

      it("requires signed commits with no bypass at all", () => {
        expect(named("main-integrity")).toMatchObject({
          bypass_actors: [],
          rules: [
            { type: "deletion" },
            { type: "non_fast_forward" },
            { type: "required_signatures" },
          ],
        });
      });

      it("merges by squash only, with a code-owner review", () => {
        expect(named("main-reviews").rules[0]).toMatchObject({
          type: "pull_request",
          parameters: {
            allowed_merge_methods: ["squash"],
            require_code_owner_review: true,
            required_approving_review_count: 1,
          },
        });
        expect(named("main-reviews").bypass_actors).toContainEqual({
          actor_id: 2740,
          actor_type: "Integration",
          bypass_mode: "pull_request",
        });
      });

      it("queues with squash and requires the destructive gate", () => {
        expect(named("main-merge-queue").rules[0]).toMatchObject({
          type: "merge_queue",
          parameters: { merge_method: "SQUASH" },
        });
        expect(checksOf(repo)).toEqual(
          expect.arrayContaining([
            "validate",
            "destructive-gate / destructive-sql",
            "destructive-gate / destructive-gate",
          ]),
        );
        // A called workflow's job reports as "<caller job> / <job>": the bare
        // names can never be satisfied by a product repository.
        expect(checksOf(repo)).not.toContain("destructive-sql");
        expect(checksOf(repo)).not.toContain("destructive-gate");
      });
    });
  }

  it("DogPack also requires its Flutter job, DogDays does not", () => {
    expect(checksOf("DogPack")).toContain("flutter");
    expect(checksOf("DogDays")).not.toContain("flutter");
  });
});
