import { pgSchema, pgTable, text, uuid, boolean, bigint, varchar, integer, pgEnum, timestamp, smallint, date, doublePrecision, jsonb, numeric, customType, index, uniqueIndex, foreignKey, primaryKey, unique, check, pgPolicy } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
// Cross-schema FK targets — re-injected by scripts/post-pull.ts after each drizzle-kit pull
import { usersInAuth as users, oauthClientsInAuth as oauthClients } from "~/supabase/drizzle/schema"

export const platform = pgSchema("platform");
export const graduationSemesterInPlatform = platform.enum("graduationSemester", ["spring", "summer", "fall"])
export const credentialTypeInPlatform = platform.enum("credentialType", ["email_password", "totp", "email_password_totp"])
export const roleTypeInPlatform = platform.enum("roleType", ["default", "root", "custom"])
export const contentActionInPlatform = platform.enum("contentAction", ["quarantine", "no_action"])
export const filerActionInPlatform = platform.enum("filerAction", ["warn", "suspend", "no_action"])
export const subjectActionInPlatform = platform.enum("subjectAction", ["warn", "suspend", "ban", "no_action"])
export const oauthRegistrationTypeInPlatform = platform.enum("oauthRegistrationType", ["development", "production"])
export const feedbackSeverityInPlatform = platform.enum("feedbackSeverity", ["low", "medium", "high"])
export const feedbackStatusInPlatform = platform.enum("feedbackStatus", ["open", "in_review", "resolved", "dismissed"])
export const feedbackTypeInPlatform = platform.enum("feedbackType", ["bug_report", "feature_request", "design_feedback", "performance", "content_issue", "other"])
export const deployEnvInPlatform = platform.enum("deployEnv", ["local", "test", "production"])
export const reportStatusInPlatform = platform.enum("reportStatus", ["open", "resolved", "dismissed"])
export const contentVisibilityInPlatform = platform.enum("contentVisibility", ["public", "restricted"])
export const teamRoleInPlatform = platform.enum("teamRole", ["lead", "member"])
export const submissionStateInPlatform = platform.enum("submissionState", ["open", "closed", "merged"])
export const checkInMethodInPlatform = platform.enum("checkInMethod", ["code", "discord", "officer"])
export const membershipDirectionInPlatform = platform.enum("membershipDirection", ["invite", "request"])
export const membershipRequestStatusInPlatform = platform.enum("membershipRequestStatus", ["pending", "accepted", "declined", "withdrawn", "expired"])
export const electionElectorateInPlatform = platform.enum("electionElectorate", ["teams", "officers"])
export const electionPurposeInPlatform = platform.enum("electionPurpose", ["points", "tiebreak"])
export const electionStatusInPlatform = platform.enum("electionStatus", ["draft", "open", "closed", "tallied"])
export const envKindInPlatform = platform.enum("envKind", ["owned", "branch"])
export const envStatusInPlatform = platform.enum("envStatus", ["provisioning", "active", "paused", "restoring", "detached", "revoked", "orphaned"])
export const credentialStatusInPlatform = platform.enum("credentialStatus", ["active", "disabled", "revoked"])
export const proxyScopeInPlatform = platform.enum("proxyScope", ["publishable", "secret"])
export const envVarVisibilityInPlatform = platform.enum("envVarVisibility", ["shared", "secret"])


export const airtableSyncStateInPlatform = platform.table.withRLS("airtableSyncState", {
	id: boolean().default(true).primaryKey(),
	lastSyncedAt: timestamp({ withTimezone: true }),
	lastStatus: text(),
	lastError: text(),
	rowsUpserted: integer().default(0).notNull(),
	rowsRefused: integer().default(0).notNull(),
	rowsArchived: integer().default(0).notNull(),
	runStartedAt: timestamp({ withTimezone: true }),
	runExpiresAt: timestamp({ withTimezone: true }),
	lastManualRunAt: timestamp({ withTimezone: true }),
	lastManualRunBy: uuid().references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	lastRefusals: jsonb(),
}, (table) => [

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
check("airtableSyncState_run_window", sql`(("runStartedAt" IS NULL) = ("runExpiresAt" IS NULL))`),check("airtableSyncState_singleton", sql`id`),]);

export const appsInPlatform = platform.table.withRLS("apps", {
	id: uuid().defaultRandom().primaryKey(),
	slug: text().notNull(),
	schemaName: text().notNull(),
	displayName: text().notNull(),
	contentResolver: text(),
	contentActioner: text(),
	createdAt: timestamp().default(sql`now()`).notNull(),
}, (table) => [
	unique("apps_schemaName_key").on(table.schemaName),	unique("apps_slug_key").on(table.slug),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const attendanceInPlatform = platform.table.withRLS("attendance", {
	id: uuid().defaultRandom().primaryKey(),
	meetingId: uuid().notNull().references(() => meetingsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	workshopId: uuid(),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	method: checkInMethodInPlatform().notNull(),
	recordedBy: uuid(),
	recordedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.workshopId, table.meetingId],
		foreignColumns: [workshopsInPlatform.id, workshopsInPlatform.meetingId],
		name: "attendance_workshopId_meetingId_fkey"
	}).onUpdate("cascade").onDelete("set null"),
	index("attendance_userId_idx").using("btree", table.userId.asc().nullsLast()),
	unique("attendance_meetingId_userId_key").on(table.meetingId, table.userId),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("own_select", { for: "select", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")` }),
check("attendance_recordedBy_only_for_officer", sql`(("recordedBy" IS NULL) OR (method = 'officer'::platform."checkInMethod"))`),]);

export const ballotRankingsInPlatform = platform.table.withRLS("ballotRankings", {
	ballotId: uuid().notNull().references(() => ballotsInPlatform.id, { onDelete: "cascade" } ),
	rank: smallint().notNull(),
	candidateTeamId: uuid().notNull().references(() => teamsInPlatform.id, { onDelete: "cascade" } ),
}, (table) => [
	primaryKey({ columns: [table.ballotId, table.rank], name: "ballotRankings_pkey"}),
	unique("ballotRankings_one_row_per_candidate").on(table.ballotId, table.candidateTeamId),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("own_team_or_auditor_select", { for: "select", to: ["authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM platform.ballots b
  WHERE ((b.id = "ballotRankings"."ballotId") AND (platform.has_permission(( SELECT auth.uid() AS uid), 'canAuditBallots'::text) OR (EXISTS ( SELECT 1
           FROM platform."teamMembers" tm
          WHERE ((tm."teamId" = b."teamId") AND (tm."userId" = ( SELECT auth.uid() AS uid)))))))))` }),
check("ballotRankings_rank_positive", sql`(rank >= 1)`),]);

export const ballotsInPlatform = platform.table.withRLS("ballots", {
	id: uuid().defaultRandom().primaryKey(),
	electionId: uuid().notNull().references(() => electionsInPlatform.id, { onDelete: "cascade" } ),
	electorate: electionElectorateInPlatform().notNull(),
	teamId: uuid().references(() => teamsInPlatform.id, { onDelete: "cascade" } ),
	castBy: uuid().notNull().references(() => users.id),
	castAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.electionId, table.electorate],
		foreignColumns: [electionsInPlatform.id, electionsInPlatform.electorate],
		name: "ballots_electionId_electorate_fkey"
	}).onUpdate("cascade"),
	uniqueIndex("ballots_one_officer_ballot_per_election").using("btree", table.electionId.asc().nullsLast()).where(sql`("teamId" IS NULL)`),
	uniqueIndex("ballots_one_per_team_per_election").using("btree", table.electionId.asc().nullsLast(), table.teamId.asc().nullsLast()).where(sql`("teamId" IS NOT NULL)`),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("own_team_or_auditor_select", { for: "select", to: ["authenticated"], using: sql`(platform.has_permission(( SELECT auth.uid() AS uid), 'canAuditBallots'::text) OR (EXISTS ( SELECT 1
   FROM platform."teamMembers" tm
  WHERE ((tm."teamId" = ballots."teamId") AND (tm."userId" = ( SELECT auth.uid() AS uid))))))` }),
check("ballots_electorate_matches_teamId", sql`(((electorate = 'teams'::platform."electionElectorate") AND ("teamId" IS NOT NULL)) OR ((electorate = 'officers'::platform."electionElectorate") AND ("teamId" IS NULL)))`),]);

export const checkInCodesInPlatform = platform.table.withRLS("checkInCodes", {
	code: text().primaryKey(),
	meetingId: uuid().notNull().references(() => meetingsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	workshopId: uuid(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	expiresAt: timestamp({ withTimezone: true }),
}, (table) => [
	foreignKey({
		columns: [table.workshopId, table.meetingId],
		foreignColumns: [workshopsInPlatform.id, workshopsInPlatform.meetingId],
		name: "checkInCodes_workshopId_meetingId_fkey"
	}).onUpdate("cascade").onDelete("cascade"),
	index("checkInCodes_meetingId_idx").using("btree", table.meetingId.asc().nullsLast()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const competitionsInPlatform = platform.table.withRLS("competitions", {
	id: uuid().defaultRandom().primaryKey(),
	slug: text().notNull(),
	workshopId: uuid().notNull().references(() => workshopsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	judgingMeetingId: uuid().references(() => meetingsInPlatform.id, { onDelete: "set null", onUpdate: "cascade" } ),
	judgingStartsAt: timestamp({ withTimezone: true }),
	maxTeamSize: smallint(),
	requirementCount: smallint(),
	airtableRecordId: text(),
	deletedAt: timestamp({ withTimezone: true }),
}, (table) => [
	index("competitions_live_idx").using("btree", table.workshopId.asc().nullsLast()).where(sql`("deletedAt" IS NULL)`),
	unique("competitions_airtableRecordId_key").on(table.airtableRecordId),	unique("competitions_slug_key").on(table.slug),	unique("competitions_workshopId_key").on(table.workshopId),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("competitions_maxTeamSize_positive", sql`(("maxTeamSize" IS NULL) OR ("maxTeamSize" > 0))`),check("competitions_requirementCount_nonneg", sql`(("requirementCount" IS NULL) OR ("requirementCount" >= 0))`),]);

export const competitionStandingsInPlatform = platform.table.withRLS("competitionStandings", {
	competitionId: uuid().notNull().references(() => competitionsInPlatform.id, { onDelete: "cascade" } ),
	teamId: uuid().notNull().references(() => teamsInPlatform.id, { onDelete: "cascade" } ),
	requirementsMet: smallint().notNull(),
	requirementCount: smallint().notNull(),
	requirementPoints: integer().notNull(),
	electionPoints: integer().notNull(),
	totalPoints: integer().generatedAlwaysAs(sql`("requirementPoints" + "electionPoints")`),
	placement: smallint().notNull(),
	resolvedBy: text(),
}, (table) => [
	primaryKey({ columns: [table.competitionId, table.teamId], name: "competitionStandings_pkey"}),

	pgPolicy("finalized_select", { for: "select", to: ["anon", "authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM platform.elections e
  WHERE ((e."competitionId" = "competitionStandings"."competitionId") AND (e.purpose = 'points'::platform."electionPurpose") AND (e.status = 'tallied'::platform."electionStatus"))))` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
check("competitionStandings_met_within_count", sql`("requirementsMet" <= "requirementCount")`),check("competitionStandings_placement_positive", sql`(placement >= 1)`),check("competitionStandings_total_in_range", sql`(("totalPoints" >= 0) AND ("totalPoints" <= 1000))`),]);

export const contentTypesInPlatform = platform.table.withRLS("contentTypes", {
	id: uuid().defaultRandom().primaryKey(),
	appId: uuid().notNull().references(() => appsInPlatform.id, { onDelete: "cascade" } ),
	tableName: text().notNull(),
	contentType: text(),
	label: text(),
	authorColumn: text(),
	snapshotColumns: text().array(),
	urlTemplate: text(),
	visibility: contentVisibilityInPlatform(),
	createdAt: timestamp().default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("contentTypes_app_type_idx").using("btree", table.appId.asc().nullsLast(), table.contentType.asc().nullsLast()).where(sql`("contentType" IS NOT NULL)`),
	unique("contentTypes_app_table_key").on(table.appId, table.tableName),
	pgPolicy("authenticated_select", { for: "select", to: ["authenticated"], using: sql`true` }),

	pgPolicy("deny_test_identities", { as: "restrictive", to: ["authenticated"], using: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))`, withCheck: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const credentialRolesInPlatform = platform.table.withRLS("credentialRoles", {
	credentialId: uuid().notNull().references(() => credentialsInPlatform.id, { onDelete: "cascade" } ),
	roleId: uuid().notNull().references(() => rolesInPlatform.id, { onDelete: "cascade" } ),
}, (table) => [
	primaryKey({ columns: [table.credentialId, table.roleId], name: "credentialRoles_pkey"}),

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const credentialsInPlatform = platform.table.withRLS("credentials", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	description: text(),
	type: credentialTypeInPlatform().notNull(),
	email: text(),
	passwordSecretId: uuid(),
	totpSecretId: uuid(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	createdBy: uuid().references(() => users.id, { onDelete: "set null" } ),
}, (table) => [

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const docsPagesInPlatform = platform.table.withRLS("docsPages", {
	id: uuid().defaultRandom().primaryKey(),
	path: text().notNull(),
	title: text().notNull(),
	description: text(),
	plainText: text().notNull(),
	updatedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	search: customType({ dataType: () => 'tsvector' })().generatedAlwaysAs(sql`((setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, "plainText"), 'C'::"char"))`),
}, (table) => [
	uniqueIndex("docsPages_path_idx").using("btree", table.path.asc().nullsLast()),
	index("docsPages_search_idx").using("gin", table.search.asc().nullsLast()),

	pgPolicy("docsPages_public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const electionResultsInPlatform = platform.table.withRLS("electionResults", {
	electionId: uuid().notNull().references(() => electionsInPlatform.id, { onDelete: "cascade" } ),
	teamId: uuid().notNull().references(() => teamsInPlatform.id, { onDelete: "cascade" } ),
	placement: smallint().notNull(),
	bordaScore: integer().notNull(),
	scaled: numeric({ precision: 10, scale: 9 }).notNull(),
}, (table) => [
	primaryKey({ columns: [table.electionId, table.teamId], name: "electionResults_pkey"}),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("tallied_select", { for: "select", to: ["anon", "authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM platform.elections e
  WHERE ((e.id = "electionResults"."electionId") AND (e.status = 'tallied'::platform."electionStatus"))))` }),
check("electionResults_placement_positive", sql`(placement >= 1)`),check("electionResults_scaled_range", sql`((scaled >= (0)::numeric) AND (scaled <= (1)::numeric))`),]);

export const electionsInPlatform = platform.table.withRLS("elections", {
	id: uuid().defaultRandom().primaryKey(),
	competitionId: uuid().notNull().references(() => competitionsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	slug: text().notNull(),
	title: text().notNull(),
	electorate: electionElectorateInPlatform().notNull(),
	purpose: electionPurposeInPlatform().default("points").notNull(),
	opensAt: timestamp({ withTimezone: true }).notNull(),
	closesAt: timestamp({ withTimezone: true }).notNull(),
	status: electionStatusInPlatform().default("draft").notNull(),
	airtableRecordId: text(),
}, (table) => [
	uniqueIndex("elections_one_tiebreak_per_competition").using("btree", table.competitionId.asc().nullsLast()).where(sql`(purpose = 'tiebreak'::platform."electionPurpose")`),
	unique("elections_airtableRecordId_key").on(table.airtableRecordId),	unique("elections_competitionId_slug_key").on(table.competitionId, table.slug),	unique("elections_id_electorate_key").on(table.id, table.electorate),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("elections_closesAt_after_opensAt", sql`("closesAt" > "opensAt")`),check("elections_tiebreak_is_officers", sql`((purpose = 'points'::platform."electionPurpose") OR (electorate = 'officers'::platform."electionElectorate"))`),]);

export const envAccessLogInPlatform = platform.table.withRLS("envAccessLog", {
	id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
	environmentId: uuid().notNull().references(() => sandboxEnvironmentsInPlatform.id, { onDelete: "cascade" } ),
	userId: uuid().notNull(),
	keysFetched: text().array().notNull(),
	at: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("envAccessLog_environmentId_at_idx").using("btree", table.environmentId.asc().nullsLast(), table.at.desc().nullsFirst()),

	pgPolicy("no_client_select", { as: "restrictive", for: "select", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_write", { as: "restrictive", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const envVarsInPlatform = platform.table.withRLS("envVars", {
	environmentId: uuid().notNull().references(() => sandboxEnvironmentsInPlatform.id, { onDelete: "cascade" } ),
	key: text().notNull(),
	value: text(),
	secretId: uuid(),
	visibility: envVarVisibilityInPlatform().notNull(),
	updatedBy: uuid().notNull(),
	updatedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.environmentId, table.key], name: "envVars_pkey"}),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_select", { as: "restrictive", for: "select", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
check("envVars_one_storage", sql`(num_nonnulls(value, "secretId") = 1)`),check("envVars_storage_matches_visibility", sql`(((visibility = 'shared'::platform."envVarVisibility") AND (value IS NOT NULL)) OR ((visibility = 'secret'::platform."envVarVisibility") AND ("secretId" IS NOT NULL)))`),]);

export const exportAuditInPlatform = platform.table.withRLS("exportAudit", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid().references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	kind: text().notNull(),
	filters: jsonb().default({}).notNull(),
	rowCount: integer(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("exportAudit_createdAt_idx").using("btree", table.createdAt.desc().nullsFirst()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const feedbackInPlatform = platform.table.withRLS("feedback", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" } ),
	type: feedbackTypeInPlatform().notNull(),
	severity: feedbackSeverityInPlatform(),
	title: varchar({ length: 100 }).notNull(),
	description: text().notNull(),
	status: feedbackStatusInPlatform().default("open").notNull(),
	browserMetadata: jsonb(),
	attachmentPaths: text().array(),
	adminNote: text(),
	createdAt: timestamp().default(sql`now()`).notNull(),
	updatedAt: timestamp().default(sql`now()`).notNull(),
	topicId: uuid(),
	appId: uuid().notNull().references(() => appsInPlatform.id, { onDelete: "cascade" } ),
}, (table) => [
	foreignKey({
		columns: [table.appId, table.topicId],
		foreignColumns: [feedbackTopicsInPlatform.appId, feedbackTopicsInPlatform.id],
		name: "feedback_appId_topicId_fkey"
	}).onDelete("restrict"),

	pgPolicy("crud_authenticated_policy_delete", { as: "restrictive", for: "delete", to: ["authenticated"], using: sql`false` }),

	pgPolicy("manager_update", { for: "update", to: ["authenticated"], using: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canManageFeedback'::text)`, withCheck: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canManageFeedback'::text)` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("own_or_manager_select", { for: "select", to: ["authenticated"], using: sql`((( SELECT auth.uid() AS uid) = "userId") OR platform.has_permission(( SELECT auth.uid() AS uid), 'canManageFeedback'::text))` }),
]);

export const feedbackTopicsInPlatform = platform.table.withRLS("feedbackTopics", {
	id: uuid().defaultRandom().primaryKey(),
	appId: uuid().notNull().references(() => appsInPlatform.id, { onDelete: "cascade" } ),
	label: varchar({ length: 50 }).notNull(),
	createdAt: timestamp().default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("feedbackTopics_app_id_idx").using("btree", table.appId.asc().nullsLast(), table.id.asc().nullsLast()),
	uniqueIndex("feedbackTopics_app_label_idx").using("btree", table.appId.asc().nullsLast(), table.label.asc().nullsLast()),

	pgPolicy("authenticated_select", { for: "select", to: ["authenticated"], using: sql`true` }),

	pgPolicy("deny_test_identities", { as: "restrictive", to: ["authenticated"], using: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))`, withCheck: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))` }),

	pgPolicy("manager_delete", { for: "delete", to: ["authenticated"], using: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canManageFeedback'::text)` }),

	pgPolicy("manager_insert", { for: "insert", to: ["authenticated"], withCheck: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canManageFeedback'::text)` }),

	pgPolicy("manager_update", { for: "update", to: ["authenticated"], using: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canManageFeedback'::text)`, withCheck: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canManageFeedback'::text)` }),
]);

export const instanceInPlatform = platform.table.withRLS("instance", {
	id: boolean().default(true).primaryKey(),
	environment: deployEnvInPlatform().default("production").notNull(),
	defaultMaxTeamSize: smallint().default(4).notNull(),
}, (table) => [

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("instance_defaultMaxTeamSize_positive", sql`("defaultMaxTeamSize" > 0)`),check("instance_singleton", sql`id`),]);

export const leaderboardProfilesInPlatform = platform.table.withRLS("leaderboardProfiles", {
	githubId: varchar({ length: 255 }).primaryKey(),
	githubLogin: varchar({ length: 255 }).notNull(),
	avatarUrl: text(),
	allTimePoints: integer().default(0).notNull(),
	allTimeRanking: integer(),
	currentYearPoints: integer().default(0).notNull(),
	currentYearRanking: integer(),
}, (table) => [
	uniqueIndex("login_idx").using("btree", sql`lower(("githubLogin")::text)`),
	unique("leaderboardProfiles_githubLogin_key").on(table.githubLogin),
	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const meetingsInPlatform = platform.table.withRLS("meetings", {
	id: uuid().defaultRandom().primaryKey(),
	slug: text().notNull(),
	name: text().notNull(),
	location: text(),
	startsAt: timestamp({ withTimezone: true }).notNull(),
	endsAt: timestamp({ withTimezone: true }).notNull(),
	checkInClosesAt: timestamp({ withTimezone: true }).notNull(),
	airtableRecordId: text(),
	deletedAt: timestamp({ withTimezone: true }),
}, (table) => [
	index("meetings_live_idx").using("btree", table.startsAt.asc().nullsLast()).where(sql`("deletedAt" IS NULL)`),
	unique("meetings_airtableRecordId_key").on(table.airtableRecordId),	unique("meetings_slug_key").on(table.slug),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("meetings_endsAt_after_startsAt", sql`("endsAt" > "startsAt")`),]);

export const oauthRegistrationsInPlatform = platform.table.withRLS("oauthRegistrations", {
	clientId: uuid().primaryKey().references(() => oauthClients.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	userId: uuid().notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	type: oauthRegistrationTypeInPlatform().default("development").notNull(),
}, (table) => [
	unique("oauthRegistrations_userId_key").on(table.userId),
	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const oauthTestAccountsInPlatform = platform.table.withRLS("oauthTestAccounts", {
	testUserId: uuid().primaryKey().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	ownerUserId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	createdAt: timestamp().default(sql`now()`).notNull(),
}, (table) => [
	unique("oauthTestAccounts_ownerUserId_key").on(table.ownerUserId),
	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const pairwiseTalliesInPlatform = platform.table.withRLS("pairwiseTallies", {
	competitionId: uuid().notNull().references(() => competitionsInPlatform.id, { onDelete: "cascade" } ),
	teamA: uuid().notNull(),
	teamB: uuid().notNull(),
	aOverB: integer().notNull(),
	bOverA: integer().notNull(),
}, (table) => [
	primaryKey({ columns: [table.competitionId, table.teamA, table.teamB], name: "pairwiseTallies_pkey"}),

	pgPolicy("auditor_select", { for: "select", to: ["authenticated"], using: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canAuditBallots'::text)` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
check("pairwiseTallies_distinct_teams", sql`("teamA" <> "teamB")`),]);

export const pointsInPlatform = platform.table.withRLS("points", {
	leaderboardProfileId: varchar({ length: 255 }).notNull().references(() => leaderboardProfilesInPlatform.githubId, { onDelete: "cascade", onUpdate: "cascade" } ),
	year: integer().notNull(),
	streakStart: date().notNull(),
	streakLength: integer().default(0).notNull(),
	longestStreakLength: integer().default(0).notNull(),
	projectPoints: integer().default(0).notNull(),
	streakBonusPoints: integer().default(0).notNull(),
	academyPoints: integer().default(0).notNull(),
	points: integer().notNull().generatedAlwaysAs(sql`(("projectPoints" + "streakBonusPoints") + "academyPoints")`),
}, (table) => [
	primaryKey({ columns: [table.leaderboardProfileId, table.year], name: "points_pkey"}),

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const profileInPlatform = platform.table.withRLS("profile", {
	userId: uuid().primaryKey().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	preferredName: varchar({ length: 255 }).notNull(),
	bio: varchar({ length: 127 }),
	pronouns: text().array(),
	graduationSemester: graduationSemesterInPlatform(),
	graduationYear: integer(),
	showGithub: boolean().default(false).notNull(),
	showDiscord: boolean().default(false).notNull(),
	showEmail: boolean().default(false).notNull(),
	showLinkedin: boolean().default(false).notNull(),
	viewedConsole: boolean().default(false).notNull(),
	involvementFirstName: text(),
	involvementLastName: text(),
	involvementImportedAt: timestamp(),
	roleDescription: varchar({ length: 127 }),
	ugaEmail: text(),
	legalFirstName: text(),
	legalLastName: text(),
	identitySourcedAt: timestamp({ withTimezone: true }),
}, (table) => [
	uniqueIndex("profile_ugaEmail_key").using("btree", table.ugaEmail.asc().nullsLast()),

	pgPolicy("crud_authenticated_policy_delete", { as: "restrictive", for: "delete", to: ["authenticated"], using: sql`false` }),

	pgPolicy("crud_authenticated_policy_insert", { as: "restrictive", for: "insert", to: ["authenticated"], withCheck: sql`false` }),

	pgPolicy("crud_authenticated_policy_select", { for: "select", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")` }),

	pgPolicy("crud_authenticated_policy_update", { for: "update", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")`, withCheck: sql`(( SELECT auth.uid() AS uid) = "userId")` }),
check("profile_ugaEmail_lowercase", sql`(("ugaEmail" IS NULL) OR ("ugaEmail" = lower("ugaEmail")))`),]);

export const profileLinksInPlatform = platform.table.withRLS("profileLinks", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid().notNull().references(() => profileInPlatform.userId, { onDelete: "cascade", onUpdate: "cascade" } ),
	url: text().notNull(),
	title: varchar({ length: 64 }).notNull(),
	sortOrder: doublePrecision().default(0).notNull(),
	createdAt: timestamp().default(sql`now()`),
}, (table) => [
	unique("profileLinks_userId_sortOrder_key").on(table.userId, table.sortOrder),
	pgPolicy("crud_authenticated_policy_delete", { for: "delete", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")` }),

	pgPolicy("crud_authenticated_policy_insert", { for: "insert", to: ["authenticated"], withCheck: sql`(( SELECT auth.uid() AS uid) = "userId")` }),

	pgPolicy("crud_authenticated_policy_select", { for: "select", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")` }),

	pgPolicy("crud_authenticated_policy_update", { for: "update", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")`, withCheck: sql`(( SELECT auth.uid() AS uid) = "userId")` }),
]);

export const projectsInPlatform = platform.table.withRLS("projects", {
	id: uuid().defaultRandom().primaryKey(),
	slug: text().notNull(),
	displayName: text().notNull(),
	appId: uuid().references(() => appsInPlatform.id, { onDelete: "set null", onUpdate: "cascade" } ),
	sortOrder: doublePrecision().default(0).notNull(),
}, (table) => [
	unique("projects_slug_key").on(table.slug),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const proxyRequestLogInPlatform = platform.table.withRLS("proxyRequestLog", {
	id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
	credentialId: uuid().notNull().references(() => sandboxCredentialsInPlatform.id, { onDelete: "cascade" } ),
	method: text().notNull(),
	path: text().notNull(),
	status: smallint().notNull(),
	at: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("proxyRequestLog_credentialId_at_idx").using("btree", table.credentialId.asc().nullsLast(), table.at.desc().nullsFirst()),

	pgPolicy("no_client_select", { as: "restrictive", for: "select", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_write", { as: "restrictive", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const reportCorroborationsInPlatform = platform.table.withRLS("reportCorroborations", {
	id: uuid().defaultRandom().primaryKey(),
	reportId: uuid().notNull().references(() => reportsInPlatform.id, { onDelete: "cascade" } ),
	reporterUserId: uuid().notNull().references(() => users.id, { onDelete: "cascade" } ),
	reasonId: uuid().notNull().references(() => reportReasonsInPlatform.id, { onDelete: "restrict" } ),
	description: varchar({ length: 1000 }),
	createdAt: timestamp().default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("reportCorroborations_report_reporter_idx").using("btree", table.reportId.asc().nullsLast(), table.reporterUserId.asc().nullsLast()),

	pgPolicy("corroborator_or_moderator_select", { for: "select", to: ["authenticated"], using: sql`((( SELECT auth.uid() AS uid) = "reporterUserId") OR platform.has_permission(( SELECT auth.uid() AS uid), 'canModerate'::text))` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const reportReasonsInPlatform = platform.table.withRLS("reportReasons", {
	id: uuid().defaultRandom().primaryKey(),
	appId: uuid().notNull().references(() => appsInPlatform.id, { onDelete: "cascade" } ),
	title: varchar({ length: 100 }).notNull(),
	description: text(),
	createdAt: timestamp().default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("reportReasons_app_id_idx").using("btree", table.appId.asc().nullsLast(), table.id.asc().nullsLast()),
	uniqueIndex("reportReasons_app_title_idx").using("btree", table.appId.asc().nullsLast(), table.title.asc().nullsLast()),

	pgPolicy("authenticated_select", { for: "select", to: ["authenticated"], using: sql`true` }),

	pgPolicy("deny_test_identities", { as: "restrictive", to: ["authenticated"], using: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))`, withCheck: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))` }),

	pgPolicy("moderator_delete", { for: "delete", to: ["authenticated"], using: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canModerate'::text)` }),

	pgPolicy("moderator_insert", { for: "insert", to: ["authenticated"], withCheck: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canModerate'::text)` }),

	pgPolicy("moderator_update", { for: "update", to: ["authenticated"], using: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canModerate'::text)`, withCheck: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canModerate'::text)` }),
]);

export const reportResolutionsInPlatform = platform.table.withRLS("reportResolutions", {
	id: uuid().defaultRandom().primaryKey(),
	reportId: uuid().notNull().references(() => reportsInPlatform.id, { onDelete: "cascade" } ),
	moderatorUserId: uuid().notNull().references(() => users.id, { onDelete: "restrict" } ),
	subjectAction: subjectActionInPlatform().notNull(),
	filerAction: filerActionInPlatform().notNull(),
	contentAction: contentActionInPlatform().notNull(),
	appliedGlobally: boolean().default(false).notNull(),
	moderatorNote: text(),
	createdAt: timestamp().default(sql`now()`).notNull(),
}, (table) => [
	unique("reportResolutions_reportId_key").on(table.reportId),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("reporter_or_moderator_select", { for: "select", to: ["authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM platform.reports r
  WHERE ((r.id = "reportResolutions"."reportId") AND ((r."reporterUserId" = ( SELECT auth.uid() AS uid)) OR platform.has_permission(( SELECT auth.uid() AS uid), 'canModerate'::text)))))` }),
]);

export const reportsInPlatform = platform.table.withRLS("reports", {
	id: uuid().defaultRandom().primaryKey(),
	appId: uuid().notNull().references(() => appsInPlatform.id, { onDelete: "cascade" } ),
	reporterUserId: uuid().notNull().references(() => users.id, { onDelete: "cascade" } ),
	reportedUserId: uuid().notNull().references(() => users.id, { onDelete: "cascade" } ),
	contentType: text().notNull(),
	contentRef: text().notNull(),
	contentSnapshot: varchar({ length: 5000 }).notNull(),
	contentUrl: text(),
	description: varchar({ length: 1000 }),
	reasonId: uuid().notNull(),
	status: reportStatusInPlatform().default("open").notNull(),
	createdAt: timestamp().default(sql`now()`).notNull(),
	resolvedAt: timestamp(),
}, (table) => [
	foreignKey({
		columns: [table.appId, table.reasonId],
		foreignColumns: [reportReasonsInPlatform.appId, reportReasonsInPlatform.id],
		name: "reports_appId_reasonId_fkey"
	}).onDelete("restrict"),
	uniqueIndex("reports_open_content_idx").using("btree", table.appId.asc().nullsLast(), table.contentType.asc().nullsLast(), table.contentRef.asc().nullsLast()).where(sql`(status = 'open'::platform."reportStatus")`),
	index("reports_status_idx").using("btree", table.status.asc().nullsLast()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("reporter_or_moderator_select", { for: "select", to: ["authenticated"], using: sql`((( SELECT auth.uid() AS uid) = "reporterUserId") OR platform.has_permission(( SELECT auth.uid() AS uid), 'canModerate'::text))` }),
]);

export const rolesInPlatform = platform.table.withRLS("roles", {
	id: uuid().defaultRandom().primaryKey(),
	title: varchar({ length: 64 }).notNull(),
	description: text().default("").notNull(),
	rank: doublePrecision(),
	color: varchar({ length: 7 }),
	canModerate: boolean(),
	canManageRoles: boolean(),
	canManageSuspensions: boolean(),
	canViewAuditLog: boolean(),
	canManageFeedback: boolean(),
	canCreateCredentials: boolean(),
	canManageVerification: boolean(),
	createdAt: timestamp().default(sql`now()`).notNull(),
	roleType: roleTypeInPlatform().default("custom").notNull(),
	showOnProfile: boolean().default(true).notNull(),
	isLeadership: boolean().default(false).notNull(),
	discordRoleId: text(),
	discordSyncedName: text(),
	discordSyncedColor: integer(),
	canEditAttendance: boolean(),
	canExportStars: boolean(),
	canTriggerSync: boolean(),
	canVoteAsOfficer: boolean(),
	canAuditBallots: boolean(),
}, (table) => [
	unique("roles_discordRoleId_key").on(table.discordRoleId),	unique("roles_rank_key").on(table.rank),	unique("roles_title_key").on(table.title),
	pgPolicy("crud_authenticated_policy_delete", { as: "restrictive", for: "delete", to: ["authenticated"], using: sql`false` }),

	pgPolicy("crud_authenticated_policy_insert", { as: "restrictive", for: "insert", to: ["authenticated"], withCheck: sql`false` }),

	pgPolicy("crud_authenticated_policy_select", { for: "select", to: ["authenticated"], using: sql`true` }),

	pgPolicy("crud_authenticated_policy_update", { as: "restrictive", for: "update", to: ["authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("deny_test_identities", { as: "restrictive", to: ["authenticated"], using: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))`, withCheck: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))` }),
check("roles_custom_requires_rank", sql`(("roleType" = 'custom'::platform."roleType") = (rank IS NOT NULL))`),]);

export const sandboxCredentialsInPlatform = platform.table.withRLS("sandboxCredentials", {
	id: uuid().defaultRandom().primaryKey(),
	environmentId: uuid().notNull().references(() => sandboxEnvironmentsInPlatform.id, { onDelete: "cascade" } ),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" } ),
	tokenHash: text().notNull(),
	scope: proxyScopeInPlatform().notNull(),
	status: credentialStatusInPlatform().default("active").notNull(),
	lastUsedAt: timestamp({ withTimezone: true }),
	disabledAt: timestamp({ withTimezone: true }),
	rotatedAt: timestamp({ withTimezone: true }),
	revokedAt: timestamp({ withTimezone: true }),
	issuedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("sandboxCredentials_userId_idx").using("btree", table.userId.asc().nullsLast()),
	unique("sandboxCredentials_environmentId_userId_scope_key").on(table.environmentId, table.userId, table.scope),	unique("sandboxCredentials_tokenHash_key").on(table.tokenHash),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_select", { as: "restrictive", for: "select", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const sandboxEnvironmentsInPlatform = platform.table.withRLS("sandboxEnvironments", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	kind: envKindInPlatform().default("owned").notNull(),
	ownerUserId: uuid().notNull().references(() => users.id, { onDelete: "restrict" } ),
	projectRef: text().notNull(),
	apiUrl: text().notNull(),
	publishableKey: text().notNull(),
	secretKeySecretId: uuid().notNull(),
	jwtSecretId: uuid().notNull(),
	proxyHostname: text().notNull(),
	prewarmEnabled: boolean().default(true).notNull(),
	autoPauseEnabled: boolean().default(true).notNull(),
	status: envStatusInPlatform().default("provisioning").notNull(),
	lastSeenActiveAt: timestamp({ withTimezone: true }),
	provisionedAt: timestamp({ withTimezone: true }),
	revokedAt: timestamp({ withTimezone: true }),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("sandboxEnvironments_ownerUserId_idx").using("btree", table.ownerUserId.asc().nullsLast()),
	index("sandboxEnvironments_status_idx").using("btree", table.status.asc().nullsLast()),
	unique("sandboxEnvironments_id_ownerUserId_key").on(table.id, table.ownerUserId),	unique("sandboxEnvironments_projectRef_key").on(table.projectRef),	unique("sandboxEnvironments_proxyHostname_key").on(table.proxyHostname),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_select", { as: "restrictive", for: "select", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const supabaseConnectionsInPlatform = platform.table.withRLS("supabaseConnections", {
	userId: uuid().primaryKey().references(() => users.id, { onDelete: "cascade" } ),
	orgSlug: text().notNull(),
	accessTokenSecretId: uuid().notNull(),
	refreshTokenSecretId: uuid().notNull(),
	expiresAt: timestamp({ withTimezone: true }).notNull(),
	scopes: text().array().notNull(),
	connectedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("supabaseConnections_expiresAt_idx").using("btree", table.expiresAt.asc().nullsLast()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_select", { as: "restrictive", for: "select", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const teamAwardsInPlatform = platform.table.withRLS("teamAwards", {
	id: uuid().defaultRandom().primaryKey(),
	teamId: uuid().notNull(),
	competitionId: uuid().notNull(),
	category: text().notNull(),
	citation: text(),
	mergedPrUrl: text(),
	awardedBy: uuid(),
	awardedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.teamId, table.competitionId],
		foreignColumns: [teamsInPlatform.id, teamsInPlatform.competitionId],
		name: "teamAwards_teamId_competitionId_fkey"
	}).onUpdate("cascade").onDelete("cascade"),
	uniqueIndex("teamAwards_one_winner_per_competition").using("btree", table.competitionId.asc().nullsLast()).where(sql`(category = 'winner'::text)`),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const teamEnvironmentsInPlatform = platform.table.withRLS("teamEnvironments", {
	teamId: uuid().primaryKey().references(() => teamsInPlatform.id, { onDelete: "cascade" } ),
	environmentId: uuid().notNull(),
	ownerUserId: uuid().notNull(),
	ownerRole: teamRoleInPlatform().default("lead").notNull(),
	attachedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	attachedBy: uuid().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.environmentId, table.ownerUserId],
		foreignColumns: [sandboxEnvironmentsInPlatform.id, sandboxEnvironmentsInPlatform.ownerUserId],
		name: "teamEnvironments_environmentId_ownerUserId_fkey"
	}),
	foreignKey({
		columns: [table.teamId, table.ownerUserId, table.ownerRole],
		foreignColumns: [teamMembersInPlatform.teamId, teamMembersInPlatform.userId, teamMembersInPlatform.role],
		name: "teamEnvironments_teamId_ownerUserId_ownerRole_fkey"
	}).onUpdate("restrict").onDelete("restrict"),
	index("teamEnvironments_environmentId_idx").using("btree", table.environmentId.asc().nullsLast()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_select", { as: "restrictive", for: "select", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
check("teamEnvironments_owner_is_lead", sql`("ownerRole" = 'lead'::platform."teamRole")`),]);

export const teamMembersInPlatform = platform.table.withRLS("teamMembers", {
	teamId: uuid().notNull(),
	competitionId: uuid().notNull(),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	role: teamRoleInPlatform().default("member").notNull(),
	joinedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.teamId, table.userId], name: "teamMembers_pkey"}),
	foreignKey({
		columns: [table.teamId, table.competitionId],
		foreignColumns: [teamsInPlatform.id, teamsInPlatform.competitionId],
		name: "teamMembers_teamId_competitionId_fkey"
	}).onUpdate("cascade").onDelete("cascade"),
	uniqueIndex("teamMembers_one_lead_per_team").using("btree", table.teamId.asc().nullsLast()).where(sql`(role = 'lead'::platform."teamRole")`),
	index("teamMembers_userId_teamId_idx").using("btree", table.userId.asc().nullsLast(), table.teamId.asc().nullsLast()),
	unique("teamMembers_teamId_userId_role_key").on(table.teamId, table.userId, table.role),	unique("teamMembers_userId_competitionId_key").on(table.userId, table.competitionId),
	pgPolicy("authenticated_select", { for: "select", to: ["authenticated"], using: sql`true` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const teamMembershipRequestsInPlatform = platform.table.withRLS("teamMembershipRequests", {
	id: uuid().defaultRandom().primaryKey(),
	teamId: uuid().notNull(),
	competitionId: uuid().notNull(),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	direction: membershipDirectionInPlatform().notNull(),
	createdBy: uuid().notNull(),
	message: text(),
	status: membershipRequestStatusInPlatform().default("pending").notNull(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	notifiedAt: timestamp({ withTimezone: true }),
	respondedAt: timestamp({ withTimezone: true }),
	respondedBy: uuid(),
	expiresAt: timestamp({ withTimezone: true }),
}, (table) => [
	foreignKey({
		columns: [table.teamId, table.competitionId],
		foreignColumns: [teamsInPlatform.id, teamsInPlatform.competitionId],
		name: "teamMembershipRequests_teamId_competitionId_fkey"
	}).onUpdate("cascade").onDelete("cascade"),
	uniqueIndex("teamMembershipRequests_one_pending_per_team_user").using("btree", table.teamId.asc().nullsLast(), table.userId.asc().nullsLast()).where(sql`(status = 'pending'::platform."membershipRequestStatus")`),
	index("teamMembershipRequests_unnotified").using("btree", table.createdAt.asc().nullsLast()).where(sql`((status = 'pending'::platform."membershipRequestStatus") AND ("notifiedAt" IS NULL))`),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("own_or_team_select", { for: "select", to: ["authenticated"], using: sql`((( SELECT auth.uid() AS uid) = "userId") OR (EXISTS ( SELECT 1
   FROM platform."teamMembers" tm
  WHERE ((tm."teamId" = "teamMembershipRequests"."teamId") AND (tm."userId" = ( SELECT auth.uid() AS uid))))))` }),
check("teamMembershipRequests_pending_unresponded", sql`((status <> 'pending'::platform."membershipRequestStatus") OR ("respondedAt" IS NULL))`),check("teamMembershipRequests_responded_together", sql`(("respondedAt" IS NULL) = ("respondedBy" IS NULL))`),]);

export const teamsInPlatform = platform.table.withRLS("teams", {
	id: uuid().defaultRandom().primaryKey(),
	competitionId: uuid().notNull().references(() => competitionsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	slug: text().notNull(),
	name: text().notNull(),
	joinCode: text().notNull(),
	createdBy: uuid().notNull(),
	submissionUrl: text(),
	submittedAt: timestamp({ withTimezone: true }),
	submissionState: submissionStateInPlatform(),
	competedAt: timestamp({ withTimezone: true }),
	lockedManuallyAt: timestamp({ withTimezone: true }),
	requirementsMet: smallint(),
	acceptingRequests: boolean().default(true).notNull(),
	clonedFromTeamId: uuid(),
}, (table) => [
	foreignKey({
		columns: [table.clonedFromTeamId],
		foreignColumns: [table.id],
		name: "teams_clonedFromTeamId_fkey"
	}).onUpdate("cascade").onDelete("set null"),
	unique("teams_competitionId_slug_key").on(table.competitionId, table.slug),	unique("teams_id_competitionId_key").on(table.id, table.competitionId),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("teams_competedAt_requires_submission", sql`(("competedAt" IS NULL) OR ("submissionUrl" IS NOT NULL))`),check("teams_requirementsMet_nonneg", sql`(("requirementsMet" IS NULL) OR ("requirementsMet" >= 0))`),check("teams_submission_url_state_together", sql`(("submissionUrl" IS NULL) = ("submissionState" IS NULL))`),check("teams_submission_url_submittedAt_together", sql`(("submissionUrl" IS NULL) = ("submittedAt" IS NULL))`),]);

export const tiebreakDisclosuresInPlatform = platform.table.withRLS("tiebreakDisclosures", {
	competitionId: uuid().notNull().references(() => competitionsInPlatform.id, { onDelete: "cascade" } ),
	higherTeamId: uuid().notNull().references(() => teamsInPlatform.id, { onDelete: "cascade" } ),
	lowerTeamId: uuid().notNull().references(() => teamsInPlatform.id, { onDelete: "cascade" } ),
}, (table) => [
	primaryKey({ columns: [table.competitionId, table.higherTeamId, table.lowerTeamId], name: "tiebreakDisclosures_pkey"}),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("tiebreakDisclosures_distinct_teams", sql`("higherTeamId" <> "lowerTeamId")`),]);

export const userRolesInPlatform = platform.table.withRLS("userRoles", {
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" } ),
	roleId: uuid().notNull().references(() => rolesInPlatform.id, { onDelete: "cascade" } ),
}, (table) => [
	primaryKey({ columns: [table.userId, table.roleId], name: "userRoles_pkey"}),
	uniqueIndex("userRoles_root_singleton").using("btree", table.roleId.asc().nullsLast()).where(sql`("roleId" = '00000000-0000-0000-0000-000000000002'::uuid)`),

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const userSuspensionsInPlatform = platform.table.withRLS("userSuspensions", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" } ),
	service: text().notNull(),
	reason: text(),
	suspendedAt: timestamp().default(sql`now()`).notNull(),
	suspendedBy: uuid().references(() => users.id, { onDelete: "set null" } ),
}, (table) => [
	uniqueIndex("userSuspensions_user_service_idx").using("btree", table.userId.asc().nullsLast(), table.service.asc().nullsLast()),

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const workshopsInPlatform = platform.table.withRLS("workshops", {
	id: uuid().defaultRandom().primaryKey(),
	meetingId: uuid().notNull().references(() => meetingsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	projectId: uuid().notNull().references(() => projectsInPlatform.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	airtableRecordId: text(),
	deletedAt: timestamp({ withTimezone: true }),
}, (table) => [
	index("workshops_live_idx").using("btree", table.meetingId.asc().nullsLast()).where(sql`("deletedAt" IS NULL)`),
	unique("workshops_airtableRecordId_key").on(table.airtableRecordId),	unique("workshops_id_meetingId_key").on(table.id, table.meetingId),	unique("workshops_meetingId_projectId_key").on(table.meetingId, table.projectId),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);
export const memberPointsInPlatform = platform.view("memberPoints", {	userId: uuid(),
	lifetimePoints: bigint({ mode: 'number' }),
	competitionsScored: integer(),
}).with({"securityInvoker":true}).as(sql`SELECT tm."userId", sum(st."totalPoints") AS "lifetimePoints", count(*)::integer AS "competitionsScored" FROM platform."teamMembers" tm JOIN platform."competitionStandings" st ON st."teamId" = tm."teamId" GROUP BY tm."userId"`);

export const memberStarsInPlatform = platform.view("memberStars", {	userId: uuid(),
	workshopId: uuid(),
	meetingId: uuid(),
	projectId: uuid(),
	workshopStar: boolean(),
	competitionStar: boolean(),
	won: boolean(),
}).with({"securityInvoker":true}).as(sql`WITH participation AS ( SELECT a."userId", a."workshopId", true AS attended, false AS competed, false AS won FROM platform.attendance a WHERE a."workshopId" IS NOT NULL UNION ALL SELECT tm."userId", c."workshopId", false, true, false FROM platform."teamMembers" tm JOIN platform.teams t ON t.id = tm."teamId" JOIN platform.competitions c ON c.id = t."competitionId" WHERE t."competedAt" IS NOT NULL UNION ALL SELECT tm."userId", c."workshopId", false, false, true FROM platform."teamMembers" tm JOIN platform.teams t ON t.id = tm."teamId" JOIN platform.competitions c ON c.id = t."competitionId" JOIN platform."teamAwards" aw ON aw."teamId" = t.id AND aw.category = 'winner'::text ) SELECT p."userId", p."workshopId", w."meetingId", w."projectId", bool_or(p.attended OR p.competed) AS "workshopStar", bool_or(p.competed) AS "competitionStar", bool_or(p.won) AS won FROM participation p JOIN platform.workshops w ON w.id = p."workshopId" GROUP BY p."userId", p."workshopId", w."meetingId", w."projectId"`);

export const profileWithVerificationInPlatform = platform.view("profileWithVerification", {	userId: uuid(),
	hasPronouns: boolean(),
	hasGraduationDate: boolean(),
	hasGithub: boolean(),
	hasDiscord: boolean(),
	nameMatchesInvolvement: boolean(),
	verified: boolean(),
}).with({"securityInvoker":true}).as(sql`SELECT "userId", pronouns IS NOT NULL AND array_length(pronouns, 1) > 0 AS "hasPronouns", "graduationSemester" IS NOT NULL AND "graduationYear" IS NOT NULL AS "hasGraduationDate", (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'github'::text)) AS "hasGithub", (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'discord'::text)) AS "hasDiscord", "involvementFirstName" IS NOT NULL AND lower(TRIM(BOTH FROM "preferredName")) = lower((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")) AS "nameMatchesInvolvement", pronouns IS NOT NULL AND array_length(pronouns, 1) > 0 AND "graduationSemester" IS NOT NULL AND "graduationYear" IS NOT NULL AND "involvementFirstName" IS NOT NULL AND lower(TRIM(BOTH FROM "preferredName")) = lower((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")) AND (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'github'::text)) AND (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'discord'::text)) AS verified FROM platform.profile p`);

export const resolvedUserPermissionsInPlatform = platform.materializedView("resolvedUserPermissions", {	userId: uuid(),
	canModerate: boolean(),
	canManageRoles: boolean(),
	canManageSuspensions: boolean(),
	canViewAuditLog: boolean(),
	canManageFeedback: boolean(),
	canCreateCredentials: boolean(),
	canManageVerification: boolean(),
	canEditAttendance: boolean(),
	canExportStars: boolean(),
	canTriggerSync: boolean(),
	canVoteAsOfficer: boolean(),
	canAuditBallots: boolean(),
	isLeader: boolean(),
	minRank: doublePrecision(),
}).as(sql`WITH root_holders AS ( SELECT ur."userId" FROM platform."userRoles" ur WHERE ur."roleId" = '00000000-0000-0000-0000-000000000002'::uuid ), user_custom_roles AS ( SELECT ur."userId", r.rank, r."isLeadership", r."canModerate", r."canManageRoles", r."canManageSuspensions", r."canViewAuditLog", r."canManageFeedback", r."canCreateCredentials", r."canManageVerification", r."canEditAttendance", r."canExportStars", r."canTriggerSync", r."canVoteAsOfficer", r."canAuditBallots" FROM platform."userRoles" ur JOIN platform.roles r ON r.id = ur."roleId" AND r."roleType" = 'custom'::platform."roleType" ), first_non_null AS ( SELECT ucr."userId", min(ucr.rank) AS "minRank", bool_or(ucr."isLeadership") AS "isLeader", (array_agg(ucr."canModerate" ORDER BY ucr.rank) FILTER (WHERE ucr."canModerate" IS NOT NULL))[1] AS "canModerate", (array_agg(ucr."canManageRoles" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageRoles" IS NOT NULL))[1] AS "canManageRoles", (array_agg(ucr."canManageSuspensions" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageSuspensions" IS NOT NULL))[1] AS "canManageSuspensions", (array_agg(ucr."canViewAuditLog" ORDER BY ucr.rank) FILTER (WHERE ucr."canViewAuditLog" IS NOT NULL))[1] AS "canViewAuditLog", (array_agg(ucr."canManageFeedback" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageFeedback" IS NOT NULL))[1] AS "canManageFeedback", (array_agg(ucr."canCreateCredentials" ORDER BY ucr.rank) FILTER (WHERE ucr."canCreateCredentials" IS NOT NULL))[1] AS "canCreateCredentials", (array_agg(ucr."canManageVerification" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageVerification" IS NOT NULL))[1] AS "canManageVerification", (array_agg(ucr."canEditAttendance" ORDER BY ucr.rank) FILTER (WHERE ucr."canEditAttendance" IS NOT NULL))[1] AS "canEditAttendance", (array_agg(ucr."canExportStars" ORDER BY ucr.rank) FILTER (WHERE ucr."canExportStars" IS NOT NULL))[1] AS "canExportStars", (array_agg(ucr."canTriggerSync" ORDER BY ucr.rank) FILTER (WHERE ucr."canTriggerSync" IS NOT NULL))[1] AS "canTriggerSync", (array_agg(ucr."canVoteAsOfficer" ORDER BY ucr.rank) FILTER (WHERE ucr."canVoteAsOfficer" IS NOT NULL))[1] AS "canVoteAsOfficer", (array_agg(ucr."canAuditBallots" ORDER BY ucr.rank) FILTER (WHERE ucr."canAuditBallots" IS NOT NULL))[1] AS "canAuditBallots" FROM user_custom_roles ucr GROUP BY ucr."userId" ), all_users AS ( SELECT DISTINCT "userRoles"."userId" FROM platform."userRoles" ) SELECT au."userId", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canModerate", false) END AS "canModerate", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canManageRoles", false) END AS "canManageRoles", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canManageSuspensions", false) END AS "canManageSuspensions", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canViewAuditLog", false) END AS "canViewAuditLog", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canManageFeedback", false) END AS "canManageFeedback", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canCreateCredentials", false) END AS "canCreateCredentials", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canManageVerification", false) END AS "canManageVerification", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canEditAttendance", false) END AS "canEditAttendance", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canExportStars", false) END AS "canExportStars", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canTriggerSync", false) END AS "canTriggerSync", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canVoteAsOfficer", false) END AS "canVoteAsOfficer", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canAuditBallots", false) END AS "canAuditBallots", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."isLeader", false) END AS "isLeader", CASE WHEN rh."userId" IS NOT NULL THEN '-Infinity'::double precision ELSE COALESCE(fnn."minRank", 'Infinity'::double precision) END AS "minRank" FROM all_users au LEFT JOIN root_holders rh ON rh."userId" = au."userId" LEFT JOIN first_non_null fnn ON fnn."userId" = au."userId"`);

// Schema-suffix aliases — appended by scripts/post-pull.ts
export { graduationSemesterInPlatform as graduationSemester };
export { credentialTypeInPlatform as credentialType };
export { roleTypeInPlatform as roleType };
export { contentActionInPlatform as contentAction };
export { filerActionInPlatform as filerAction };
export { subjectActionInPlatform as subjectAction };
export { oauthRegistrationTypeInPlatform as oauthRegistrationType };
export { feedbackSeverityInPlatform as feedbackSeverity };
export { feedbackStatusInPlatform as feedbackStatus };
export { feedbackTypeInPlatform as feedbackType };
export { deployEnvInPlatform as deployEnv };
export { reportStatusInPlatform as reportStatus };
export { contentVisibilityInPlatform as contentVisibility };
export { teamRoleInPlatform as teamRole };
export { submissionStateInPlatform as submissionState };
export { checkInMethodInPlatform as checkInMethod };
export { membershipDirectionInPlatform as membershipDirection };
export { membershipRequestStatusInPlatform as membershipRequestStatus };
export { electionElectorateInPlatform as electionElectorate };
export { electionPurposeInPlatform as electionPurpose };
export { electionStatusInPlatform as electionStatus };
export { envKindInPlatform as envKind };
export { envStatusInPlatform as envStatus };
export { credentialStatusInPlatform as credentialStatus };
export { proxyScopeInPlatform as proxyScope };
export { envVarVisibilityInPlatform as envVarVisibility };
export { airtableSyncStateInPlatform as airtableSyncState };
export { appsInPlatform as apps };
export { attendanceInPlatform as attendance };
export { ballotRankingsInPlatform as ballotRankings };
export { ballotsInPlatform as ballots };
export { checkInCodesInPlatform as checkInCodes };
export { competitionsInPlatform as competitions };
export { competitionStandingsInPlatform as competitionStandings };
export { contentTypesInPlatform as contentTypes };
export { credentialRolesInPlatform as credentialRoles };
export { credentialsInPlatform as credentials };
export { docsPagesInPlatform as docsPages };
export { electionResultsInPlatform as electionResults };
export { electionsInPlatform as elections };
export { envAccessLogInPlatform as envAccessLog };
export { envVarsInPlatform as envVars };
export { exportAuditInPlatform as exportAudit };
export { feedbackInPlatform as feedback };
export { feedbackTopicsInPlatform as feedbackTopics };
export { instanceInPlatform as instance };
export { leaderboardProfilesInPlatform as leaderboardProfiles };
export { meetingsInPlatform as meetings };
export { oauthRegistrationsInPlatform as oauthRegistrations };
export { oauthTestAccountsInPlatform as oauthTestAccounts };
export { pairwiseTalliesInPlatform as pairwiseTallies };
export { pointsInPlatform as points };
export { profileInPlatform as profile };
export { profileLinksInPlatform as profileLinks };
export { projectsInPlatform as projects };
export { proxyRequestLogInPlatform as proxyRequestLog };
export { reportCorroborationsInPlatform as reportCorroborations };
export { reportReasonsInPlatform as reportReasons };
export { reportResolutionsInPlatform as reportResolutions };
export { reportsInPlatform as reports };
export { rolesInPlatform as roles };
export { sandboxCredentialsInPlatform as sandboxCredentials };
export { sandboxEnvironmentsInPlatform as sandboxEnvironments };
export { supabaseConnectionsInPlatform as supabaseConnections };
export { teamAwardsInPlatform as teamAwards };
export { teamEnvironmentsInPlatform as teamEnvironments };
export { teamMembersInPlatform as teamMembers };
export { teamMembershipRequestsInPlatform as teamMembershipRequests };
export { teamsInPlatform as teams };
export { tiebreakDisclosuresInPlatform as tiebreakDisclosures };
export { userRolesInPlatform as userRoles };
export { userSuspensionsInPlatform as userSuspensions };
export { workshopsInPlatform as workshops };
export { memberPointsInPlatform as memberPoints };
export { memberStarsInPlatform as memberStars };
export { profileWithVerificationInPlatform as profileWithVerification };
export { resolvedUserPermissionsInPlatform as resolvedUserPermissions };
