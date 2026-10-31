-- D5: streaks, badges and profiles read commits, and the pull-request pipeline
-- retires. Production holds no contributions and no First Merge awards, so
-- nothing is converted: the claim and award machinery for merged pull requests
-- is dropped, and the First Commit machinery added in 78 is the only writer.
--
-- Not dropped here, on purpose: platform.contributions, platform.
-- "projectReportContributions" and platform."badgeAwards"."contributionId".
-- Only the legacy project-report loaders still read them (D3 rewrites those),
-- and the tables and the column go in a later contract change, after this
-- deploy and D3 have landed.

DROP TRIGGER "identities_claim_contributions" ON "auth"."identities";

DROP TRIGGER "contributions_award_first_merge" ON "platform"."contributions";

DROP FUNCTION "platform"."claim_contributions"();

DROP FUNCTION "platform"."badges_after_contribution"();

DROP FUNCTION "platform"."award_first_merge"(uuid);

COMMENT ON TABLE "platform"."badgeAwards" IS 'Server-only. One dated award of a badge defined in badges.json (@devdogsuga/events). Automatic awards (Workshop completed, First Commit) are written by the triggers on attendance, reflections and commits in the same transaction as the evidence; manual ones by an officer, with a required public citation. A one-time badge has one live row per (member, badge, workshop); a repeatable one many. "withdrawnAt" retires an award whose evidence went (or that an officer withdrew) and keeps the row for the record; "hidden" is the member hiding it from their public profile, which hides the citation too. Public reads go only through the public-profile loaders. Account deletion: the member''s awards are deleted with the account (ON DELETE CASCADE); a badge awarded BY a deleted officer stays with "awardedBy" set to null and is shown as awarded by "Deleted member".';

COMMENT ON COLUMN "platform"."badgeAwards"."contributionId" IS 'Legacy evidence for the retired First Merge badge (a merged pull request). Nothing writes or reads it; dropped with platform.contributions.';

COMMENT ON COLUMN "platform"."badgeAwards"."commitSha" IS 'Evidence for First Commit: the member''s earliest stored default-branch commit. A later backfill that finds an older commit moves this pointer without a second award; set null if the commit is ever deleted.';

COMMENT ON TABLE "platform"."contributions" IS 'Server-only and retired. It held one merged pull request in a DevDogs organization repository, fed by the GitHub App webhook, which is gone: nothing writes this table and nothing reads it. Streaks, badges and profiles read platform.commits instead. Kept only until the contract change drops it (with platform.projectReportContributions and platform."badgeAwards"."contributionId"). Account deletion: the member''s rows are deleted with the account (ON DELETE CASCADE).';
