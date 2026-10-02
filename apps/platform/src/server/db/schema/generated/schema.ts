import { pgSchema, pgTable, uuid, pgEnum, text, boolean, varchar, integer, timestamp, date, smallint, jsonb, doublePrecision, customType, index, uniqueIndex, foreignKey, primaryKey, unique, check, pgPolicy } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
// Cross-schema FK targets — re-injected by types:drizzle after each drizzle-kit pull
import { usersInAuth as users, oauthClientsInAuth as oauthClients } from "~/supabase/drizzle/schema"

export const platform = pgSchema("platform");
export const graduationSemesterInPlatform = platform.enum("graduationSemester", ["spring", "summer", "fall"])
export const academicProgramCategoryInPlatform = platform.enum("academicProgramCategory", ["undergraduate_major", "graduate_major", "undergraduate_minor", "undergraduate_certificate", "graduate_certificate", "professional_program"])
export const roleTypeInPlatform = platform.enum("roleType", ["default", "custom"])
export const oauthRegistrationTypeInPlatform = platform.enum("oauthRegistrationType", ["development", "production"])
export const checkInMethodInPlatform = platform.enum("checkInMethod", ["qr", "manual_code", "import"])
export const auditEventSourceInPlatform = platform.enum("auditEventSource", ["platform", "qr", "manual_code", "system"])
export const teamRoleInPlatform = platform.enum("teamRole", ["lead", "member"])
export const membershipDirectionInPlatform = platform.enum("membershipDirection", ["invite", "request"])
export const membershipRequestStatusInPlatform = platform.enum("membershipRequestStatus", ["pending", "accepted", "declined", "withdrawn", "expired"])
export const contentActionInPlatform = platform.enum("contentAction", ["quarantine", "no_action"])
export const filerActionInPlatform = platform.enum("filerAction", ["warn", "suspend", "no_action"])
export const subjectActionInPlatform = platform.enum("subjectAction", ["warn", "suspend", "ban", "no_action"])
export const reportStatusInPlatform = platform.enum("reportStatus", ["open", "resolved", "dismissed"])
export const reportReasonInPlatform = platform.enum("reportReason", ["harassment", "hate_speech", "spam", "sexual_content", "violence", "impersonation", "off_topic", "other"])
export const contentVisibilityInPlatform = platform.enum("contentVisibility", ["public", "restricted"])
export const quarantineEffectInPlatform = platform.enum("quarantineEffect", ["hide", "freeze"])
export const oauthDeviceCodeStatusInPlatform = platform.enum("oauthDeviceCodeStatus", ["pending", "approved", "denied"])


export const academicProgramsInPlatform = platform.table.withRLS("academicPrograms", {
	id: integer().primaryKey(),
	name: text().notNull(),
	credential: text().notNull(),
	category: academicProgramCategoryInPlatform().notNull(),
	schoolCode: text(),
	bulletinUrl: text().notNull(),
	active: boolean().default(true).notNull(),
	lastSeenAt: timestamp({ withTimezone: true }).notNull(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("academicPrograms_active_name_idx").using("btree", table.active.asc().nullsLast(), table.name.asc().nullsLast(), table.credential.asc().nullsLast()),

	pgPolicy("authenticated_select", { for: "select", to: ["authenticated"], using: sql`true` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
check("academicPrograms_credential_nonempty", sql`(btrim(credential) <> ''::text)`),check("academicPrograms_id_positive", sql`(id > 0)`),check("academicPrograms_name_nonempty", sql`(btrim(name) <> ''::text)`),]);

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
	meetingId: uuid().notNull().references(() => meetingsInPlatform.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	method: checkInMethodInPlatform().notNull(),
	recordedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("attendance_meetingId_idx").using("btree", table.meetingId.asc().nullsLast()),
	index("attendance_userId_idx").using("btree", table.userId.asc().nullsLast(), table.recordedAt.desc().nullsFirst()),
	unique("attendance_meetingId_userId_key").on(table.meetingId, table.userId),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("own_select", { for: "select", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")` }),
]);

export const auditEventsInPlatform = platform.table.withRLS("auditEvents", {
	id: uuid().defaultRandom().primaryKey(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	actorType: text().notNull(),
	actorUserId: uuid(),
	source: auditEventSourceInPlatform().notNull(),
	action: text().notNull(),
	targetType: text().notNull(),
	targetId: text().notNull(),
	correlationId: text(),
	metadata: jsonb().default({}).notNull(),
	beforeReflectionRevisionId: uuid().references(() => reflectionRevisionsInPlatform.id, { onDelete: "restrict" } ),
	afterReflectionRevisionId: uuid().references(() => reflectionRevisionsInPlatform.id, { onDelete: "restrict" } ),
}, (table) => [
	uniqueIndex("auditEvents_correlation_idempotency_key").using("btree", table.source.asc().nullsLast(), table.correlationId.asc().nullsLast(), table.action.asc().nullsLast(), table.targetType.asc().nullsLast(), table.targetId.asc().nullsLast()).where(sql`("correlationId" IS NOT NULL)`),
	index("auditEvents_createdAt_idx").using("btree", table.createdAt.desc().nullsFirst(), table.id.desc().nullsFirst()),
	index("auditEvents_target_idx").using("btree", table.targetType.asc().nullsLast(), table.targetId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),

	pgPolicy("auditor_select", { for: "select", to: ["authenticated"], using: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canViewAuditLog'::text)` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
check("auditEvents_action_length", sql`(char_length(action) <= 120)`),check("auditEvents_actor_shape", sql`((("actorType" = 'user'::text) AND ("actorUserId" IS NOT NULL)) OR (("actorType" = 'system'::text) AND ("actorUserId" IS NULL)))`),check("auditEvents_actorType_choices", sql`("actorType" = ANY (ARRAY['user'::text, 'system'::text]))`),check("auditEvents_metadata_bounded", sql`(pg_column_size(metadata) <= 16384)`),check("auditEvents_targetId_length", sql`(char_length("targetId") <= 255)`),check("auditEvents_targetType_length", sql`(char_length("targetType") <= 80)`),]);

export const competitionEntriesInPlatform = platform.table.withRLS("competitionEntries", {
	id: uuid().defaultRandom().primaryKey(),
	competitionId: uuid().notNull().references(() => competitionsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	teamId: uuid().notNull().references(() => teamsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	prNodeId: text().notNull(),
	prNumber: integer().notNull(),
	url: text().notNull(),
	openedAt: timestamp({ withTimezone: true }).notNull(),
	mergedAt: timestamp({ withTimezone: true }),
	closedAt: timestamp({ withTimezone: true }),
}, (table) => [
	index("competitionEntries_competitionId_idx").using("btree", table.competitionId.asc().nullsLast()),
	index("competitionEntries_teamId_idx").using("btree", table.teamId.asc().nullsLast()),
	unique("competitionEntries_prNodeId_key").on(table.prNodeId),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const competitionsInPlatform = platform.table.withRLS("competitions", {
	id: uuid().defaultRandom().primaryKey(),
	issueNodeId: text().notNull(),
	issueNumber: integer().notNull(),
	repo: text().notNull(),
	url: text().notNull(),
	slug: text().notNull(),
	title: text().notNull(),
	brief: text(),
	plannedEndAt: timestamp({ withTimezone: true }),
	kickedOffAt: timestamp({ withTimezone: true }).notNull(),
	closedAt: timestamp({ withTimezone: true }),
	githubSyncedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("competitions_kickedOffAt_idx").using("btree", table.kickedOffAt.desc().nullsFirst()),
	unique("competitions_issueNodeId_key").on(table.issueNodeId),	unique("competitions_slug_key").on(table.slug),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("competitions_title_length", sql`(char_length(title) <= 160)`),]);

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
	quarantineEffect: quarantineEffectInPlatform(),
}, (table) => [
	uniqueIndex("contentTypes_app_type_idx").using("btree", table.appId.asc().nullsLast(), table.contentType.asc().nullsLast()).where(sql`("contentType" IS NOT NULL)`),
	unique("contentTypes_app_table_key").on(table.appId, table.tableName),
	pgPolicy("authenticated_select", { for: "select", to: ["authenticated"], using: sql`true` }),

	pgPolicy("deny_test_identities", { as: "restrictive", to: ["authenticated"], using: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))`, withCheck: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const discordRoleMembershipsInPlatform = platform.table.withRLS("discordRoleMemberships", {
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" } ),
	roleId: uuid().notNull().references(() => rolesInPlatform.id, { onDelete: "cascade" } ),
	syncedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.userId, table.roleId], name: "discordRoleMemberships_pkey"}),
	index("discordRoleMemberships_roleId_idx").using("btree", table.roleId.asc().nullsLast()),

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const docsIndexStateInPlatform = platform.table.withRLS("docsIndexState", {
	id: boolean().default(true).primaryKey(),
	hash: text().notNull(),
	updatedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
check("docsIndexState_id_check", sql`id`),]);

export const docsPagesInPlatform = platform.table.withRLS("docsPages", {
	id: uuid().defaultRandom().primaryKey(),
	path: text().notNull(),
	title: text().notNull(),
	description: text(),
	plainText: text().notNull(),
	updatedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	search: customType({ dataType: () => 'tsvector' })().generatedAlwaysAs(sql`((setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, "plainText"), 'C'::"char"))`),
	publishAt: timestamp({ withTimezone: true }),
}, (table) => [
	uniqueIndex("docsPages_path_idx").using("btree", table.path.asc().nullsLast()),
	index("docsPages_search_idx").using("gin", table.search.asc().nullsLast()),

	pgPolicy("docsPages_public_read", { for: "select", to: ["anon", "authenticated"], using: sql`(("publishAt" IS NULL) OR ("publishAt" <= now()))` }),
]);

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
	nameOverride: text(),
	location: text(),
	startsAt: timestamp({ withTimezone: true }).notNull(),
	endsAt: timestamp({ withTimezone: true }).notNull(),
	surveyUrl: text(),
	deletedAt: timestamp({ withTimezone: true }),
	summary: text(),
	kind: text(),
	rsvpUrl: text(),
	building: text(),
	cancelledAt: timestamp({ withTimezone: true }),
	cancellationReason: text(),
	countsForCredit: boolean().default(false).notNull(),
	seasonId: uuid().references(() => seasonsInPlatform.id, { onDelete: "set null", onUpdate: "cascade" } ),
	surveyQuestionIds: text().array().default([]).notNull(),
}, (table) => [
	index("meetings_live_idx").using("btree", table.startsAt.asc().nullsLast()).where(sql`("deletedAt" IS NULL)`),
	unique("meetings_slug_key").on(table.slug),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("meetings_building_choices", sql`((building IS NULL) OR (building = ANY (ARRAY['DLW'::text, 'Driftmier'::text, 'Plant Sciences'::text, 'Boyd'::text, 'MLC'::text, 'Science Learning Center'::text, 'Science Library'::text, 'Poultry Science'::text, 'Main Library'::text, 'Tate'::text, 'Other'::text])))`),check("meetings_cancellationReason_length", sql`(("cancellationReason" IS NULL) OR (char_length("cancellationReason") <= 160))`),check("meetings_cancellationReason_needs_cancellation", sql`(("cancellationReason" IS NULL) OR ("cancelledAt" IS NOT NULL))`),check("meetings_endsAt_after_startsAt", sql`("endsAt" > "startsAt")`),check("meetings_kind_choices", sql`((kind IS NULL) OR (kind = ANY (ARRAY['Build Session'::text, 'Study Session'::text, 'Interest Meeting'::text, 'Social'::text, 'Demo Night'::text])))`),check("meetings_nameOverride_length", sql`(("nameOverride" IS NULL) OR (char_length("nameOverride") <= 80))`),check("meetings_rsvpUrl_host", sql`(("rsvpUrl" IS NULL) OR ("rsvpUrl" ~ '^https://uga\.campuslabs\.com(/[A-Za-z0-9/_?=&.%#:~-]*)?$'::text))`),check("meetings_summary_length", sql`((summary IS NULL) OR (char_length(summary) <= 240))`),]);

export const oauthConnectCodesInPlatform = platform.table.withRLS("oauthConnectCodes", {
	id: uuid().defaultRandom().primaryKey(),
	codeHash: text().notNull(),
	codeChallenge: text().notNull(),
	clientId: uuid().notNull().references(() => oauthClients.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	clientSecret: text().notNull(),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	redirectUri: text().notNull(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	expiresAt: timestamp({ withTimezone: true }).default(sql`(now() + '00:02:00'::interval)`).notNull(),
}, (table) => [
	uniqueIndex("oauthConnectCodes_codeHash_key").using("btree", table.codeHash.asc().nullsLast()),
	index("oauthConnectCodes_expiresAt_idx").using("btree", table.expiresAt.asc().nullsLast()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const oauthDeviceCodesInPlatform = platform.table.withRLS("oauthDeviceCodes", {
	id: uuid().defaultRandom().primaryKey(),
	deviceCodeHash: text().notNull(),
	userCodeHash: text().notNull(),
	label: text().notNull(),
	callbackUri: text().notNull(),
	status: oauthDeviceCodeStatusInPlatform().default("pending").notNull(),
	userId: uuid().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	clientId: uuid().references(() => oauthClients.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	clientSecret: text(),
	interval: integer().default(5).notNull(),
	lastPolledAt: timestamp({ withTimezone: true }),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	expiresAt: timestamp({ withTimezone: true }).default(sql`(now() + '00:10:00'::interval)`).notNull(),
}, (table) => [
	uniqueIndex("oauthDeviceCodes_deviceCodeHash_key").using("btree", table.deviceCodeHash.asc().nullsLast()),
	index("oauthDeviceCodes_expiresAt_idx").using("btree", table.expiresAt.asc().nullsLast()),
	uniqueIndex("oauthDeviceCodes_userCodeHash_key").using("btree", table.userCodeHash.asc().nullsLast()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const oauthRegistrationsInPlatform = platform.table.withRLS("oauthRegistrations", {
	clientId: uuid().primaryKey().references(() => oauthClients.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	userId: uuid().notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	type: oauthRegistrationTypeInPlatform().default("development").notNull(),
	label: text().default("Default Client").notNull(),
}, (table) => [

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

export const officerDiscordIdsInPlatform = platform.table.withRLS("officerDiscordIds", {
	userId: uuid().primaryKey().references(() => users.id, { onDelete: "cascade" } ),
	discordUserId: text().notNull(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("officerDiscordIds_discordUserId_key").using("btree", table.discordUserId.asc().nullsLast()),

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
check("officerDiscordIds_discordUserId_snowflake_check", sql`("discordUserId" ~ '^[0-9]{15,25}$'::text)`),]);

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
	roleDescription: varchar({ length: 512 }),
	ugaEmail: text(),
	legalFirstName: text(),
	legalLastName: text(),
	identitySourcedAt: timestamp({ withTimezone: true }),
	quarantinedBy: uuid().references(() => reportResolutionsInPlatform.id, { onDelete: "set null" } ),
	publicProfile: boolean().default(true).notNull(),
	showName: boolean().default(true).notNull(),
	showAvatar: boolean().default(true).notNull(),
	showBio: boolean().default(true).notNull(),
	showLinks: boolean().default(true).notNull(),
	showCompetitions: boolean().default(true).notNull(),
	showContributions: boolean().default(true).notNull(),
	showStars: boolean().default(true).notNull(),
	handle: text(),
}, (table) => [
	uniqueIndex("profile_handle_key").using("btree", table.handle.asc().nullsLast()),
	index("profile_handle_prefix_idx").using("btree", table.handle.asc().nullsLast().op("text_pattern_ops")).where(sql`(handle IS NOT NULL)`),
	uniqueIndex("profile_ugaEmail_key").using("btree", table.ugaEmail.asc().nullsLast()),

	pgPolicy("crud_authenticated_policy_delete", { as: "restrictive", for: "delete", to: ["authenticated"], using: sql`false` }),

	pgPolicy("crud_authenticated_policy_insert", { as: "restrictive", for: "insert", to: ["authenticated"], withCheck: sql`false` }),

	pgPolicy("crud_authenticated_policy_select", { for: "select", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")` }),

	pgPolicy("crud_authenticated_policy_update", { for: "update", to: ["authenticated"], using: sql`((( SELECT auth.uid() AS uid) = "userId") AND ("quarantinedBy" IS NULL) AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid))))`, withCheck: sql`((( SELECT auth.uid() AS uid) = "userId") AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid))))` }),
check("profile_handle_format", sql`((handle IS NULL) OR ((handle ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'::text) AND ((char_length(handle) >= 2) AND (char_length(handle) <= 39))))`),check("profile_ugaEmail_lowercase", sql`(("ugaEmail" IS NULL) OR ("ugaEmail" = lower("ugaEmail")))`),]);

export const profileAcademicProgramsInPlatform = platform.table.withRLS("profileAcademicPrograms", {
	userId: uuid().notNull().references(() => profileInPlatform.userId, { onDelete: "cascade", onUpdate: "cascade" } ),
	programId: integer().notNull().references(() => academicProgramsInPlatform.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	sortOrder: smallint().notNull(),
}, (table) => [
	primaryKey({ columns: [table.userId, table.programId], name: "profileAcademicPrograms_pkey"}),
	unique("profileAcademicPrograms_userId_sortOrder_key").on(table.userId, table.sortOrder),
	pgPolicy("crud_authenticated_policy_select", { for: "select", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
check("profileAcademicPrograms_sortOrder_nonnegative", sql`("sortOrder" >= 0)`),]);

export const profileLinksInPlatform = platform.table.withRLS("profileLinks", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid().notNull().references(() => profileInPlatform.userId, { onDelete: "cascade", onUpdate: "cascade" } ),
	url: text().notNull(),
	title: varchar({ length: 64 }).notNull(),
	sortOrder: doublePrecision().default(0).notNull(),
	createdAt: timestamp().default(sql`now()`),
}, (table) => [
	unique("profileLinks_userId_sortOrder_key").on(table.userId, table.sortOrder),
	pgPolicy("crud_authenticated_policy_delete", { for: "delete", to: ["authenticated"], using: sql`((( SELECT auth.uid() AS uid) = "userId") AND (NOT platform.is_profile_frozen("userId")) AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid))))` }),

	pgPolicy("crud_authenticated_policy_insert", { for: "insert", to: ["authenticated"], withCheck: sql`((( SELECT auth.uid() AS uid) = "userId") AND (NOT platform.is_profile_frozen("userId")) AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid))))` }),

	pgPolicy("crud_authenticated_policy_select", { for: "select", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")` }),

	pgPolicy("crud_authenticated_policy_update", { for: "update", to: ["authenticated"], using: sql`((( SELECT auth.uid() AS uid) = "userId") AND (NOT platform.is_profile_frozen("userId")) AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid))))`, withCheck: sql`((( SELECT auth.uid() AS uid) = "userId") AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid))))` }),
]);

export const rateLimitHitsInPlatform = platform.table.withRLS("rateLimitHits", {
	id: uuid().defaultRandom().primaryKey(),
	scope: text().notNull(),
	subjectId: uuid().notNull(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("rateLimitHits_scope_subject_createdAt_idx").using("btree", table.scope.asc().nullsLast(), table.subjectId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const reflectionRevisionsInPlatform = platform.table.withRLS("reflectionRevisions", {
	id: uuid().defaultRandom().primaryKey(),
	reflectionId: uuid().notNull().references(() => reflectionsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	userId: uuid().notNull(),
	meetingId: uuid(),
	competitionId: uuid(),
	content: text().notNull(),
	submittedAt: timestamp({ withTimezone: true }),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	createdByUserId: uuid().notNull(),
	changeReason: text(),
}, (table) => [
	index("reflectionRevisions_reflectionId_createdAt_idx").using("btree", table.reflectionId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("reflectionRevisions_userId_createdAt_idx").using("btree", table.userId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("own_or_auditor_select", { for: "select", to: ["authenticated"], using: sql`((( SELECT auth.uid() AS uid) = "userId") OR platform.has_permission(( SELECT auth.uid() AS uid), 'canViewAuditLog'::text))` }),
check("reflectionRevisions_changeReason_length", sql`(("changeReason" IS NULL) OR (char_length("changeReason") <= 500))`),check("reflectionRevisions_exactly_one_activity", sql`(((("meetingId" IS NOT NULL))::integer + (("competitionId" IS NOT NULL))::integer) = 1)`),]);

export const reflectionsInPlatform = platform.table.withRLS("reflections", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	meetingId: uuid().references(() => meetingsInPlatform.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	competitionId: uuid().references(() => competitionsInPlatform.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	content: text().default("").notNull(),
	submittedAt: timestamp({ withTimezone: true }),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("reflections_userId_competitionId_key").using("btree", table.userId.asc().nullsLast(), table.competitionId.asc().nullsLast()).where(sql`("competitionId" IS NOT NULL)`),
	uniqueIndex("reflections_userId_meetingId_key").using("btree", table.userId.asc().nullsLast(), table.meetingId.asc().nullsLast()).where(sql`("meetingId" IS NOT NULL)`),
	index("reflections_userId_updatedAt_idx").using("btree", table.userId.asc().nullsLast(), table.updatedAt.desc().nullsFirst()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("own_select", { for: "select", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")` }),
check("reflections_exactly_one_activity", sql`(((("meetingId" IS NOT NULL))::integer + (("competitionId" IS NOT NULL))::integer) = 1)`),]);

export const reflectionSettingsInPlatform = platform.table.withRLS("reflectionSettings", {
	id: boolean().default(true).primaryKey(),
	minimumWordCount: integer().default(100).notNull(),
	submissionWindowDays: integer().default(7).notNull(),
	updatedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
check("reflectionSettings_minimumWordCount_positive", sql`("minimumWordCount" > 0)`),check("reflectionSettings_singleton", sql`id`),check("reflectionSettings_submissionWindowDays_positive", sql`("submissionWindowDays" > 0)`),]);

export const reportCorroborationsInPlatform = platform.table.withRLS("reportCorroborations", {
	id: uuid().defaultRandom().primaryKey(),
	reportId: uuid().notNull().references(() => reportsInPlatform.id, { onDelete: "cascade" } ),
	reporterUserId: uuid().notNull().references(() => users.id, { onDelete: "cascade" } ),
	reason: reportReasonInPlatform().notNull(),
	description: varchar({ length: 1000 }),
	createdAt: timestamp().default(sql`now()`).notNull(),
}, (table) => [
	unique("reportCorroborations_report_reporter_key").on(table.reportId, table.reporterUserId),
	pgPolicy("corroborator_or_moderator_select", { for: "select", to: ["authenticated"], using: sql`((( SELECT auth.uid() AS uid) = "reporterUserId") OR platform.has_permission(( SELECT auth.uid() AS uid), 'canModerate'::text))` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const reportReasonsInPlatform = platform.table.withRLS("reportReasons", {
	reason: reportReasonInPlatform().primaryKey(),
	title: varchar({ length: 100 }).notNull(),
	description: text(),
	position: integer().notNull(),
}, (table) => [
	uniqueIndex("reportReasons_position_idx").using("btree", table.position.asc().nullsLast()),

	pgPolicy("authenticated_select", { for: "select", to: ["authenticated"], using: sql`true` }),

	pgPolicy("deny_test_identities", { as: "restrictive", to: ["authenticated"], using: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))`, withCheck: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
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
	reason: reportReasonInPlatform().notNull(),
	status: reportStatusInPlatform().default("open").notNull(),
	createdAt: timestamp().default(sql`now()`).notNull(),
	resolvedAt: timestamp(),
}, (table) => [
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
	createdAt: timestamp().default(sql`now()`).notNull(),
	roleType: roleTypeInPlatform().default("custom").notNull(),
	showOnProfile: boolean().default(true).notNull(),
	isLeadership: boolean().default(false).notNull(),
	discordRoleId: text(),
	discordSyncedName: text(),
	discordSyncedColor: integer(),
	canManageAttendance: boolean(),
	canPreviewDocs: boolean(),
}, (table) => [
	index("roles_isLeadership_rank_idx").using("btree", table.rank.asc().nullsLast()).where(sql`"isLeadership"`),
	unique("roles_discordRoleId_key").on(table.discordRoleId),	unique("roles_rank_key").on(table.rank),	unique("roles_title_key").on(table.title),
	pgPolicy("crud_authenticated_policy_delete", { as: "restrictive", for: "delete", to: ["authenticated"], using: sql`false` }),

	pgPolicy("crud_authenticated_policy_insert", { as: "restrictive", for: "insert", to: ["authenticated"], withCheck: sql`false` }),

	pgPolicy("crud_authenticated_policy_select", { for: "select", to: ["authenticated"], using: sql`true` }),

	pgPolicy("crud_authenticated_policy_update", { as: "restrictive", for: "update", to: ["authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("deny_test_identities", { as: "restrictive", to: ["authenticated"], using: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))`, withCheck: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))` }),
check("roles_custom_requires_rank", sql`(("roleType" = 'custom'::platform."roleType") = (rank IS NOT NULL))`),]);

export const seasonsInPlatform = platform.table.withRLS("seasons", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	startsAt: timestamp({ withTimezone: true }).notNull(),
	endsAt: timestamp({ withTimezone: true }).notNull(),
}, (table) => [
	index("seasons_startsAt_idx").using("btree", table.startsAt.asc().nullsLast()),
	unique("seasons_name_key").on(table.name),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("seasons_endsAt_after_startsAt", sql`("endsAt" > "startsAt")`),]);

export const supportConversationsInPlatform = platform.table.withRLS("supportConversations", {
	id: uuid().defaultRandom().primaryKey(),
	threadId: text().notNull(),
	userId: uuid().references(() => users.id, { onDelete: "cascade" } ),
	guestId: uuid().references(() => supportGuestsInPlatform.id, { onDelete: "cascade" } ),
	role: text().default("asker").notNull(),
	lastReadMessageId: text(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	followedInDiscordAt: timestamp({ withTimezone: true }),
}, (table) => [
	index("supportConversations_guestId_idx").using("btree", table.guestId.asc().nullsLast()),
	uniqueIndex("supportConversations_thread_guest_idx").using("btree", table.threadId.asc().nullsLast(), table.guestId.asc().nullsLast()).where(sql`("guestId" IS NOT NULL)`),
	uniqueIndex("supportConversations_thread_user_idx").using("btree", table.threadId.asc().nullsLast(), table.userId.asc().nullsLast()).where(sql`("userId" IS NOT NULL)`),
	index("supportConversations_userId_idx").using("btree", table.userId.asc().nullsLast()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
check("supportConversations_owner_check", sql`(("userId" IS NULL) <> ("guestId" IS NULL))`),check("supportConversations_role_check", sql`(role = ANY (ARRAY['asker'::text, 'follower'::text]))`),]);

export const supportForumPostsInPlatform = platform.table.withRLS("supportForumPosts", {
	threadId: text().primaryKey(),
	title: text().notNull(),
	question: text().notNull(),
	answerMessageId: text(),
	answer: text(),
	tags: text().array().default([]).notNull(),
	isResolved: boolean().default(false).notNull(),
	isFaq: boolean().default(false).notNull(),
	lastMessageId: text(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	search: customType({ dataType: () => 'tsvector' })().generatedAlwaysAs(sql`((setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(question, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(answer, ''::text)), 'C'::"char"))`),
}, (table) => [
	index("supportForumPosts_search_idx").using("gin", table.search.asc().nullsLast()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const supportGuestsInPlatform = platform.table.withRLS("supportGuests", {
	id: uuid().defaultRandom().primaryKey(),
	tokenHash: text().notNull(),
	label: text().notNull(),
	blockedAt: timestamp({ withTimezone: true }),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	lastSeenAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("supportGuests_lastSeenAt_idx").using("btree", table.lastSeenAt.asc().nullsLast()),
	uniqueIndex("supportGuests_tokenHash_idx").using("btree", table.tokenHash.asc().nullsLast()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const supportMessagesInPlatform = platform.table.withRLS("supportMessages", {
	messageId: text().primaryKey(),
	threadId: text().notNull(),
	userId: uuid().references(() => users.id, { onDelete: "set null" } ),
	guestId: uuid().references(() => supportGuestsInPlatform.id, { onDelete: "set null" } ),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("supportMessages_threadId_idx").using("btree", table.threadId.asc().nullsLast()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const surveyAnswerRevisionsInPlatform = platform.table.withRLS("surveyAnswerRevisions", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	questionId: text().notNull().references(() => surveyQuestionsInPlatform.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	meetingId: uuid().references(() => meetingsInPlatform.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	answer: jsonb(),
	recordedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("surveyAnswerRevisions_meetingId_idx").using("btree", table.meetingId.asc().nullsLast()).where(sql`("meetingId" IS NOT NULL)`),
	index("surveyAnswerRevisions_userId_questionId_idx").using("btree", table.userId.asc().nullsLast(), table.questionId.asc().nullsLast(), table.recordedAt.desc().nullsFirst()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("own_or_auditor_select", { for: "select", to: ["authenticated"], using: sql`((( SELECT auth.uid() AS uid) = "userId") OR platform.has_permission(( SELECT auth.uid() AS uid), 'canViewAuditLog'::text))` }),
check("surveyAnswerRevisions_answer_size", sql`((answer IS NULL) OR (pg_column_size(answer) <= 16384))`),]);

export const surveyAnswersInPlatform = platform.table.withRLS("surveyAnswers", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	questionId: text().notNull().references(() => surveyQuestionsInPlatform.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	meetingId: uuid().references(() => meetingsInPlatform.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	answer: jsonb().notNull(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("surveyAnswers_meeting_key").using("btree", table.userId.asc().nullsLast(), table.questionId.asc().nullsLast(), table.meetingId.asc().nullsLast()).where(sql`("meetingId" IS NOT NULL)`),
	index("surveyAnswers_meetingId_idx").using("btree", table.meetingId.asc().nullsLast()).where(sql`("meetingId" IS NOT NULL)`),
	uniqueIndex("surveyAnswers_member_key").using("btree", table.userId.asc().nullsLast(), table.questionId.asc().nullsLast()).where(sql`("meetingId" IS NULL)`),
	index("surveyAnswers_questionId_idx").using("btree", table.questionId.asc().nullsLast()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("own_select", { for: "select", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")` }),
check("surveyAnswers_answer_size", sql`(pg_column_size(answer) <= 16384)`),]);

export const surveyQuestionsInPlatform = platform.table.withRLS("surveyQuestions", {
	id: text().primaryKey(),
	scope: text().notNull(),
	type: text().notNull(),
	definition: jsonb().notNull(),
	retiredAt: timestamp({ withTimezone: true }),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("surveyQuestions_definition_size", sql`(pg_column_size(definition) <= 16384)`),check("surveyQuestions_id_format", sql`(id ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'::text)`),check("surveyQuestions_scope_choices", sql`(scope = ANY (ARRAY['member'::text, 'meeting'::text]))`),check("surveyQuestions_type_choices", sql`(type = ANY (ARRAY['text'::text, 'longText'::text, 'choice'::text, 'multiChoice'::text, 'scale'::text]))`),]);

export const teamMembersInPlatform = platform.table.withRLS("teamMembers", {
	id: uuid().defaultRandom().primaryKey(),
	teamId: uuid().notNull().references(() => teamsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	role: teamRoleInPlatform().default("member").notNull(),
	joinedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	leftAt: timestamp({ withTimezone: true }),
}, (table) => [
	uniqueIndex("teamMembers_one_active_per_team_user").using("btree", table.teamId.asc().nullsLast(), table.userId.asc().nullsLast()).where(sql`("leftAt" IS NULL)`),
	uniqueIndex("teamMembers_one_lead_per_team").using("btree", table.teamId.asc().nullsLast()).where(sql`((role = 'lead'::platform."teamRole") AND ("leftAt" IS NULL))`),
	index("teamMembers_userId_active_idx").using("btree", table.userId.asc().nullsLast()).where(sql`("leftAt" IS NULL)`),

	pgPolicy("authenticated_select", { for: "select", to: ["authenticated"], using: sql`("leftAt" IS NULL)` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("team_member_select_history", { for: "select", to: ["authenticated"], using: sql`(("leftAt" IS NOT NULL) AND platform.is_active_team_member("teamId", ( SELECT auth.uid() AS uid)))` }),
]);

export const teamMembershipRequestsInPlatform = platform.table.withRLS("teamMembershipRequests", {
	id: uuid().defaultRandom().primaryKey(),
	teamId: uuid().notNull().references(() => teamsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
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
	uniqueIndex("teamMembershipRequests_one_pending_per_team_user").using("btree", table.teamId.asc().nullsLast(), table.userId.asc().nullsLast()).where(sql`(status = 'pending'::platform."membershipRequestStatus")`),
	index("teamMembershipRequests_unnotified").using("btree", table.createdAt.asc().nullsLast()).where(sql`((status = 'pending'::platform."membershipRequestStatus") AND ("notifiedAt" IS NULL))`),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("own_or_team_select", { for: "select", to: ["authenticated"], using: sql`((( SELECT auth.uid() AS uid) = "userId") OR (EXISTS ( SELECT 1
   FROM platform."teamMembers" tm
  WHERE ((tm."teamId" = "teamMembershipRequests"."teamId") AND (tm."userId" = ( SELECT auth.uid() AS uid)) AND (tm."leftAt" IS NULL)))))` }),
check("teamMembershipRequests_pending_unresponded", sql`((status <> 'pending'::platform."membershipRequestStatus") OR ("respondedAt" IS NULL))`),check("teamMembershipRequests_responded_together", sql`(("respondedAt" IS NULL) = ("respondedBy" IS NULL))`),]);

export const teamsInPlatform = platform.table.withRLS("teams", {
	id: uuid().defaultRandom().primaryKey(),
	slug: text().notNull(),
	name: text().notNull(),
	joinCode: text().notNull(),
	createdBy: uuid().notNull(),
	acceptingRequests: boolean().default(true).notNull(),
	githubSyncedAt: timestamp({ withTimezone: true }),
}, (table) => [
	unique("teams_slug_key").on(table.slug),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const userRolesInPlatform = platform.table.withRLS("userRoles", {
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" } ),
	roleId: uuid().notNull().references(() => rolesInPlatform.id, { onDelete: "cascade" } ),
}, (table) => [
	primaryKey({ columns: [table.userId, table.roleId], name: "userRoles_pkey"}),

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
	project: text(),
	deletedAt: timestamp({ withTimezone: true }),
	title: text(),
	description: text(),
}, (table) => [
	index("workshops_live_idx").using("btree", table.meetingId.asc().nullsLast()).where(sql`("deletedAt" IS NULL)`),
	unique("workshops_id_meetingId_key").on(table.id, table.meetingId),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("workshops_description_length", sql`((description IS NULL) OR (char_length(description) <= 280))`),check("workshops_title_length", sql`((title IS NULL) OR (char_length(title) <= 80))`),]);
export const memberStarsInPlatform = platform.view("memberStars", {	userId: uuid(),
	activityType: text(),
	activityId: uuid(),
	meetingId: uuid(),
	competitionId: uuid(),
	startsAt: timestamp({ withTimezone: true }),
	earnedAt: timestamp({ withTimezone: true }),
	won: boolean(),
}).with({"securityInvoker":true}).as(sql`SELECT a."userId", 'meeting'::text AS "activityType", m.id AS "activityId", m.id AS "meetingId", NULL::uuid AS "competitionId", m."startsAt", a."recordedAt" AS "earnedAt", false AS won FROM platform.attendance a JOIN platform.meetings m ON m.id = a."meetingId" WHERE m."countsForCredit" AND m."cancelledAt" IS NULL AND m."deletedAt" IS NULL UNION ALL SELECT tm."userId", 'competition'::text AS "activityType", c.id AS "activityId", NULL::uuid AS "meetingId", c.id AS "competitionId", min(ce."openedAt") AS "startsAt", min(ce."openedAt") AS "earnedAt", bool_or(ce."mergedAt" IS NOT NULL) AS won FROM platform."competitionEntries" ce JOIN platform.competitions c ON c.id = ce."competitionId" JOIN platform."teamMembers" tm ON tm."teamId" = ce."teamId" AND tm."joinedAt" <= ce."openedAt" AND (tm."leftAt" IS NULL OR tm."leftAt" > ce."openedAt") WHERE c."closedAt" IS NULL OR ce."openedAt" < c."closedAt" GROUP BY tm."userId", c.id`);

export const profileWithVerificationInPlatform = platform.view("profileWithVerification", {	userId: uuid(),
	hasPronouns: boolean(),
	hasGraduationDate: boolean(),
	hasGithub: boolean(),
	hasDiscord: boolean(),
	nameMatchesInvolvement: boolean(),
	verified: boolean(),
}).with({"securityInvoker":true}).as(sql`SELECT "userId", pronouns IS NOT NULL AND array_length(pronouns, 1) > 0 AS "hasPronouns", "graduationSemester" IS NOT NULL AND "graduationYear" IS NOT NULL AS "hasGraduationDate", (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'github'::text)) AS "hasGithub", (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'discord'::text)) AS "hasDiscord", "involvementFirstName" IS NOT NULL AND lower(TRIM(BOTH FROM "preferredName")) = lower((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")) AS "nameMatchesInvolvement", pronouns IS NOT NULL AND array_length(pronouns, 1) > 0 AND "graduationSemester" IS NOT NULL AND "graduationYear" IS NOT NULL AND "involvementFirstName" IS NOT NULL AND lower(TRIM(BOTH FROM "preferredName")) = lower((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")) AND (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'github'::text)) AND (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'discord'::text)) AS verified FROM platform.profile p`);

export const publicProfilesInPlatform = platform.view("publicProfiles", {	userId: uuid(),
	handle: text(),
	displayName: varchar(),
	hasAvatar: boolean(),
	bio: varchar(),
	roleDescription: varchar(),
	githubHandle: text(),
	discordHandle: text(),
	linkedinName: text(),
	showName: boolean(),
	showAvatar: boolean(),
	showBio: boolean(),
	showLinks: boolean(),
	showCompetitions: boolean(),
	showContributions: boolean(),
	showStars: boolean(),
}).as(sql`SELECT p."userId", p.handle, CASE WHEN p."showName" THEN p."preferredName" ELSE NULL::character varying END AS "displayName", p."showAvatar" AND (EXISTS ( SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'avatars'::text AND o.name = p."userId"::text)) AS "hasAvatar", CASE WHEN p."showBio" THEN p.bio ELSE NULL::character varying END AS bio, CASE WHEN p."showBio" THEN p."roleDescription" ELSE NULL::character varying END AS "roleDescription", CASE WHEN p."showGithub" THEN ( SELECT lower(i.identity_data ->> 'user_name'::text) AS lower FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'github'::text) ELSE NULL::text END AS "githubHandle", CASE WHEN p."showDiscord" THEN ( SELECT i.identity_data ->> 'full_name'::text FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'discord'::text) ELSE NULL::text END AS "discordHandle", CASE WHEN p."showLinkedin" THEN ( SELECT i.identity_data ->> 'name'::text FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'linkedin_oidc'::text) ELSE NULL::text END AS "linkedinName", p."showName", p."showAvatar", p."showBio", p."showLinks", p."showCompetitions", p."showContributions", p."showStars" FROM platform.profile p JOIN platform."profileWithVerification" v ON v."userId" = p."userId" WHERE v.verified AND p."publicProfile" AND p.handle IS NOT NULL AND p."quarantinedBy" IS NULL AND NOT platform.is_suspended(p."userId")`);

export const resolvedUserPermissionsInPlatform = platform.materializedView("resolvedUserPermissions", {	userId: uuid(),
	canModerate: boolean(),
	canManageRoles: boolean(),
	canManageSuspensions: boolean(),
	canViewAuditLog: boolean(),
	canManageAttendance: boolean(),
	canPreviewDocs: boolean(),
	isLeader: boolean(),
	minRank: doublePrecision(),
}).as(sql`WITH user_custom_roles AS ( SELECT ur."userId", r.rank, r."isLeadership", r."canModerate", r."canManageRoles", r."canManageSuspensions", r."canViewAuditLog", r."canManageAttendance", r."canPreviewDocs" FROM platform."userRoles" ur JOIN platform.roles r ON r.id = ur."roleId" AND r."roleType" = 'custom'::platform."roleType" ), first_non_null AS ( SELECT ucr."userId", min(ucr.rank) AS "minRank", bool_or(ucr."isLeadership") AS "isLeader", (array_agg(ucr."canModerate" ORDER BY ucr.rank) FILTER (WHERE ucr."canModerate" IS NOT NULL))[1] AS "canModerate", (array_agg(ucr."canManageRoles" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageRoles" IS NOT NULL))[1] AS "canManageRoles", (array_agg(ucr."canManageSuspensions" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageSuspensions" IS NOT NULL))[1] AS "canManageSuspensions", (array_agg(ucr."canViewAuditLog" ORDER BY ucr.rank) FILTER (WHERE ucr."canViewAuditLog" IS NOT NULL))[1] AS "canViewAuditLog", (array_agg(ucr."canManageAttendance" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageAttendance" IS NOT NULL))[1] AS "canManageAttendance", (array_agg(ucr."canPreviewDocs" ORDER BY ucr.rank) FILTER (WHERE ucr."canPreviewDocs" IS NOT NULL))[1] AS "canPreviewDocs" FROM user_custom_roles ucr GROUP BY ucr."userId" ), all_users AS ( SELECT DISTINCT "userRoles"."userId" FROM platform."userRoles" ) SELECT au."userId", COALESCE(fnn."canModerate", false) AS "canModerate", COALESCE(fnn."canManageRoles", false) AS "canManageRoles", COALESCE(fnn."canManageSuspensions", false) AS "canManageSuspensions", COALESCE(fnn."canViewAuditLog", false) AS "canViewAuditLog", COALESCE(fnn."canManageAttendance", false) AS "canManageAttendance", COALESCE(fnn."canPreviewDocs", false) AS "canPreviewDocs", COALESCE(fnn."isLeader", false) AS "isLeader", COALESCE(fnn."minRank", 'Infinity'::double precision) AS "minRank" FROM all_users au LEFT JOIN first_non_null fnn ON fnn."userId" = au."userId"`);

// Schema-suffix aliases — appended by types:drizzle
export { academicProgramCategoryInPlatform as academicProgramCategory };
export { academicProgramsInPlatform as academicPrograms };
export { appsInPlatform as apps };
export { attendanceInPlatform as attendance };
export { auditEventSourceInPlatform as auditEventSource };
export { auditEventsInPlatform as auditEvents };
export { checkInMethodInPlatform as checkInMethod };
export { competitionEntriesInPlatform as competitionEntries };
export { competitionsInPlatform as competitions };
export { contentActionInPlatform as contentAction };
export { contentTypesInPlatform as contentTypes };
export { contentVisibilityInPlatform as contentVisibility };
export { discordRoleMembershipsInPlatform as discordRoleMemberships };
export { docsIndexStateInPlatform as docsIndexState };
export { docsPagesInPlatform as docsPages };
export { exportAuditInPlatform as exportAudit };
export { filerActionInPlatform as filerAction };
export { graduationSemesterInPlatform as graduationSemester };
export { leaderboardProfilesInPlatform as leaderboardProfiles };
export { meetingsInPlatform as meetings };
export { memberStarsInPlatform as memberStars };
export { membershipDirectionInPlatform as membershipDirection };
export { membershipRequestStatusInPlatform as membershipRequestStatus };
export { oauthConnectCodesInPlatform as oauthConnectCodes };
export { oauthDeviceCodeStatusInPlatform as oauthDeviceCodeStatus };
export { oauthDeviceCodesInPlatform as oauthDeviceCodes };
export { oauthRegistrationTypeInPlatform as oauthRegistrationType };
export { oauthRegistrationsInPlatform as oauthRegistrations };
export { oauthTestAccountsInPlatform as oauthTestAccounts };
export { officerDiscordIdsInPlatform as officerDiscordIds };
export { pointsInPlatform as points };
export { profileInPlatform as profile };
export { profileAcademicProgramsInPlatform as profileAcademicPrograms };
export { profileLinksInPlatform as profileLinks };
export { profileWithVerificationInPlatform as profileWithVerification };
export { publicProfilesInPlatform as publicProfiles };
export { quarantineEffectInPlatform as quarantineEffect };
export { rateLimitHitsInPlatform as rateLimitHits };
export { reflectionRevisionsInPlatform as reflectionRevisions };
export { reflectionSettingsInPlatform as reflectionSettings };
export { reflectionsInPlatform as reflections };
export { reportCorroborationsInPlatform as reportCorroborations };
export { reportReasonInPlatform as reportReason };
export { reportReasonsInPlatform as reportReasons };
export { reportResolutionsInPlatform as reportResolutions };
export { reportStatusInPlatform as reportStatus };
export { reportsInPlatform as reports };
export { resolvedUserPermissionsInPlatform as resolvedUserPermissions };
export { roleTypeInPlatform as roleType };
export { rolesInPlatform as roles };
export { seasonsInPlatform as seasons };
export { subjectActionInPlatform as subjectAction };
export { supportConversationsInPlatform as supportConversations };
export { supportForumPostsInPlatform as supportForumPosts };
export { supportGuestsInPlatform as supportGuests };
export { supportMessagesInPlatform as supportMessages };
export { surveyAnswerRevisionsInPlatform as surveyAnswerRevisions };
export { surveyAnswersInPlatform as surveyAnswers };
export { surveyQuestionsInPlatform as surveyQuestions };
export { teamMembersInPlatform as teamMembers };
export { teamMembershipRequestsInPlatform as teamMembershipRequests };
export { teamRoleInPlatform as teamRole };
export { teamsInPlatform as teams };
export { userRolesInPlatform as userRoles };
export { userSuspensionsInPlatform as userSuspensions };
export { workshopsInPlatform as workshops };
