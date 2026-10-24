import { pgSchema, pgTable, uuid, integer, boolean, text, pgEnum, varchar, timestamp, numeric, smallint, date, jsonb, doublePrecision, customType, bytea, index, uniqueIndex, foreignKey, primaryKey, unique, check, pgPolicy } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
// Cross-schema FK targets — re-injected by types:drizzle after each drizzle-kit pull
import { usersInAuth as users, oauthClientsInAuth as oauthClients } from "~/supabase/drizzle/schema"

export const platform = pgSchema("platform");
export const graduationSemesterInPlatform = platform.enum("graduationSemester", ["spring", "summer", "fall"])
export const academicProgramCategoryInPlatform = platform.enum("academicProgramCategory", ["undergraduate_major", "graduate_major", "undergraduate_minor", "undergraduate_certificate", "graduate_certificate", "professional_program"])
export const roleTypeInPlatform = platform.enum("roleType", ["default", "custom"])
export const oauthRegistrationTypeInPlatform = platform.enum("oauthRegistrationType", ["development", "production"])
export const checkInMethodInPlatform = platform.enum("checkInMethod", ["qr", "manual_code", "import", "officer"])
export const auditEventSourceInPlatform = platform.enum("auditEventSource", ["platform", "qr", "manual_code", "system"])
export const contentActionInPlatform = platform.enum("contentAction", ["quarantine", "no_action"])
export const filerActionInPlatform = platform.enum("filerAction", ["warn", "suspend", "no_action"])
export const subjectActionInPlatform = platform.enum("subjectAction", ["warn", "suspend", "ban", "no_action"])
export const reportStatusInPlatform = platform.enum("reportStatus", ["open", "resolved", "dismissed"])
export const reportReasonInPlatform = platform.enum("reportReason", ["harassment", "hate_speech", "spam", "sexual_content", "violence", "impersonation", "off_topic", "other"])
export const contentVisibilityInPlatform = platform.enum("contentVisibility", ["public", "restricted"])
export const quarantineEffectInPlatform = platform.enum("quarantineEffect", ["hide", "freeze"])
export const oauthDeviceCodeStatusInPlatform = platform.enum("oauthDeviceCodeStatus", ["pending", "approved", "denied"])
export const appKindInPlatform = platform.enum("appKind", ["internal", "external"])
export const deliveryStatusInPlatform = platform.enum("deliveryStatus", ["pending", "delivered", "failed"])
export const oauthStatusInPlatform = platform.enum("oauthStatus", ["testing", "in_production"])
export const oauthTierInPlatform = platform.enum("oauthTier", ["development", "production"])


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
	schemaName: text(),
	displayName: text().notNull(),
	contentResolver: text(),
	contentActioner: text(),
	createdAt: timestamp().default(sql`now()`).notNull(),
	kind: appKindInPlatform().default("internal").notNull(),
}, (table) => [
	unique("apps_schemaName_key").on(table.schemaName),	unique("apps_slug_key").on(table.slug),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("apps_kind_shape_check", sql`(((kind = 'internal'::platform."appKind") AND ("schemaName" IS NOT NULL)) OR ((kind = 'external'::platform."appKind") AND ("schemaName" IS NULL) AND ("contentResolver" IS NULL) AND ("contentActioner" IS NULL)))`),]);

export const attendanceInPlatform = platform.table.withRLS("attendance", {
	id: uuid().defaultRandom().primaryKey(),
	meetingId: uuid().notNull().references(() => meetingsInPlatform.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	userId: uuid().references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
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

export const attendanceInvitesInPlatform = platform.table.withRLS("attendanceInvites", {
	id: uuid().defaultRandom().primaryKey(),
	meetingId: uuid().notNull().references(() => meetingsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	ugaEmail: text().notNull(),
	tokenHash: text().notNull(),
	createdBy: uuid().references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	expiresAt: timestamp({ withTimezone: true }).default(sql`(now() + '14 days'::interval)`).notNull(),
	claimedAt: timestamp({ withTimezone: true }),
	claimedBy: uuid().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
}, (table) => [
	uniqueIndex("attendanceInvites_tokenHash_key").using("btree", table.tokenHash.asc().nullsLast()),
	uniqueIndex("attendanceInvites_pending_key").using("btree", table.meetingId.asc().nullsLast(), table.ugaEmail.asc().nullsLast()).where(sql`("claimedAt" IS NULL)`),
	index("attendanceInvites_ugaEmail_idx").using("btree", table.ugaEmail.asc().nullsLast()),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
check("attendanceInvites_ugaEmail_lowercase", sql`("ugaEmail" = lower("ugaEmail"))`),check("attendanceInvites_claim_shape", sql`(("claimedAt" IS NULL) = ("claimedBy" IS NULL))`),]);

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
	beforeReflectionRevisionId: uuid().references(() => reflectionRevisionsInPlatform.id, { onDelete: "set null" } ),
	afterReflectionRevisionId: uuid().references(() => reflectionRevisionsInPlatform.id, { onDelete: "set null" } ),
}, (table) => [
	uniqueIndex("auditEvents_correlation_idempotency_key").using("btree", table.source.asc().nullsLast(), table.correlationId.asc().nullsLast(), table.action.asc().nullsLast(), table.targetType.asc().nullsLast(), table.targetId.asc().nullsLast()).where(sql`("correlationId" IS NOT NULL)`),
	index("auditEvents_createdAt_idx").using("btree", table.createdAt.desc().nullsFirst(), table.id.desc().nullsFirst()),
	index("auditEvents_target_idx").using("btree", table.targetType.asc().nullsLast(), table.targetId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),

	pgPolicy("auditor_select", { for: "select", to: ["authenticated"], using: sql`platform.has_permission(( SELECT auth.uid() AS uid), 'canViewAuditLog'::text)` }),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
check("auditEvents_action_length", sql`(char_length(action) <= 120)`),check("auditEvents_actor_shape", sql`((("actorType" = 'user'::text) AND ("actorUserId" IS NOT NULL)) OR (("actorType" = 'system'::text) AND ("actorUserId" IS NULL)))`),check("auditEvents_actorType_choices", sql`("actorType" = ANY (ARRAY['user'::text, 'system'::text]))`),check("auditEvents_metadata_bounded", sql`(pg_column_size(metadata) <= 16384)`),check("auditEvents_targetId_length", sql`(char_length("targetId") <= 255)`),check("auditEvents_targetType_length", sql`(char_length("targetType") <= 80)`),]);

export const configReconcileStateInPlatform = platform.table.withRLS("configReconcileState", {
	id: boolean().default(true).primaryKey(),
	workerVersionId: text().notNull(),
	workerVersionTimestamp: timestamp({ withTimezone: true }).notNull(),
	configHash: text().notNull(),
	appliedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
check("configReconcileState_single_row", sql`id`),]);

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

export const accountDeletionsInPlatform = platform.table.withRLS("accountDeletions", {
	userId: uuid().primaryKey(),
	scheduledFor: timestamp({ withTimezone: true }).notNull(),
	requestedBy: uuid().references(() => users.id, { onDelete: "set null" } ),
	reason: text(),
	email: text().notNull(),
	name: text(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	attempts: integer().default(0).notNull(),
	lastAttemptAt: timestamp({ withTimezone: true }),
	lastError: text(),
}, (table) => [
	index("accountDeletions_scheduledFor_idx").using("btree", table.scheduledFor.asc().nullsLast()),

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const badgeAwardsInPlatform = platform.table.withRLS("badgeAwards", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	badgeId: text().notNull(),
	workshopDefinitionId: text(),
	method: text().notNull(),
	repeatable: boolean().notNull(),
	awardedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	awardedBy: uuid().references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	citation: text(),
	meetingId: uuid().references(() => meetingsInPlatform.id, { onDelete: "set null", onUpdate: "cascade" } ),
	contributionId: uuid().references(() => contributionsInPlatform.id, { onDelete: "set null", onUpdate: "cascade" } ),
	withdrawnAt: timestamp({ withTimezone: true }),
	withdrawnReason: text(),
	hidden: boolean().default(false).notNull(),
}, (table) => [
	index("badgeAwards_meetingId_idx").using("btree", table.meetingId.asc().nullsLast()).where(sql`("meetingId" IS NOT NULL)`),
	uniqueIndex("badgeAwards_one_live_key").using("btree", table.userId.asc().nullsLast(), table.badgeId.asc().nullsLast(), sql`(COALESCE("workshopDefinitionId", ''::text))`).where(sql`(("withdrawnAt" IS NULL) AND (NOT repeatable))`),
	index("badgeAwards_userId_awardedAt_idx").using("btree", table.userId.asc().nullsLast(), table.awardedAt.desc().nullsFirst()),
	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const contributionsInPlatform = platform.table.withRLS("contributions", {
	id: uuid().defaultRandom().primaryKey(),
	repo: text().notNull(),
	repoPrivate: boolean().default(false).notNull(),
	prNumber: integer().notNull(),
	title: text().notNull(),
	url: text().notNull(),
	mergedAt: timestamp({ withTimezone: true }).notNull(),
	authorGithubId: text().notNull(),
	authorLogin: text().notNull(),
	userId: uuid().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	deliveryId: text(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("contributions_unmatched_authorGithubId_idx").using("btree", table.authorGithubId.asc().nullsLast()).where(sql`("userId" IS NULL)`),
	index("contributions_userId_mergedAt_idx").using("btree", table.userId.asc().nullsLast(), table.mergedAt.desc().nullsFirst()),
	unique("contributions_deliveryId_key").on(table.deliveryId),
	unique("contributions_repo_prNumber_key").on(table.repo, table.prNumber),
	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const deletedAccountBlocksInPlatform = platform.table.withRLS("deletedAccountBlocks", {
	subjectHash: bytea().primaryKey(),
	expiresAt: timestamp({ withTimezone: true }),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
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

export const externalContentTypesInPlatform = platform.table.withRLS("externalContentTypes", {
	appId: uuid().notNull().references(() => appsInPlatform.id, { onDelete: "cascade" } ),
	contentType: text().notNull(),
	label: text().notNull(),
	urlTemplate: text(),
}, (table) => [
	primaryKey({ columns: [table.appId, table.contentType], name: "externalContentTypes_pkey"}),
check("externalContentTypes_contentType_check", sql`("contentType" ~ '^[a-z][a-z0-9_]{0,62}$'::text)`),]);

export const identityLinkIntentsInPlatform = platform.table.withRLS("identityLinkIntents", {
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	provider: text().notNull(),
	expiresAt: timestamp({ withTimezone: true }).notNull(),
}, (table) => [
	primaryKey({ columns: [table.userId, table.provider], name: "identityLinkIntents_pkey"}),
]);

export const jobHeartbeatsInPlatform = platform.table.withRLS("jobHeartbeats", {
	job: text().primaryKey(),
	succeededAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
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
	series: text(),
	category: text(),
	venue: text(),
	room: text(),
}, (table) => [
	index("meetings_live_idx").using("btree", table.startsAt.asc().nullsLast()).where(sql`("deletedAt" IS NULL)`),
	unique("meetings_slug_key").on(table.slug),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("meetings_building_choices", sql`((building IS NULL) OR (building = ANY (ARRAY['DLW'::text, 'Driftmier'::text, 'Plant Sciences'::text, 'Boyd'::text, 'MLC'::text, 'Science Learning Center'::text, 'Science Library'::text, 'Poultry Science'::text, 'Main Library'::text, 'Tate'::text, 'Other'::text])))`),check("meetings_cancellationReason_length", sql`(("cancellationReason" IS NULL) OR (char_length("cancellationReason") <= 160))`),check("meetings_cancellationReason_needs_cancellation", sql`(("cancellationReason" IS NULL) OR ("cancelledAt" IS NOT NULL))`),check("meetings_category_choices", sql`((category IS NULL) OR (category = ANY (ARRAY['build'::text, 'workshop'::text, 'social'::text, 'info'::text, 'study'::text, 'milestone'::text])))`),check("meetings_endsAt_after_startsAt", sql`("endsAt" > "startsAt")`),check("meetings_kind_choices", sql`((kind IS NULL) OR (kind = ANY (ARRAY['Build Session'::text, 'Study Session'::text, 'Interest Meeting'::text, 'Social'::text, 'Demo Night'::text])))`),check("meetings_nameOverride_length", sql`(("nameOverride" IS NULL) OR (char_length("nameOverride") <= 80))`),check("meetings_rsvpUrl_host", sql`(("rsvpUrl" IS NULL) OR ("rsvpUrl" ~ '^https://uga\.campuslabs\.com(/[A-Za-z0-9/_?=&.%#:~-]*)?$'::text))`),check("meetings_series_format", sql`((series IS NULL) OR (series ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))`),check("meetings_summary_length", sql`((summary IS NULL) OR (char_length(summary) <= 240))`),check("meetings_venue_format", sql`((venue IS NULL) OR (venue ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))`),]);

export const moderationClientsInPlatform = platform.table.withRLS("moderationClients", {
	clientId: uuid().primaryKey().references(() => oauthClients.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	appId: uuid().references(() => appsInPlatform.id, { onDelete: "set null" } ),
	endpointUrl: text(),
	secretVersion: integer().default(1).notNull(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	unique("moderationClients_appId_key").on(table.appId),check("moderationClients_endpoint_https_check", sql`(("endpointUrl" IS NULL) OR ("endpointUrl" ~ '^https://[^[:space:]]+$'::text))`),check("moderationClients_secretVersion_check", sql`("secretVersion" >= 1)`),]);

export const moderationDeliveriesInPlatform = platform.table.withRLS("moderationDeliveries", {
	id: uuid().defaultRandom().primaryKey(),
	appId: uuid().references(() => appsInPlatform.id, { onDelete: "cascade" } ),
	clientId: uuid().references(() => oauthClients.id, { onDelete: "set null" } ),
	reportId: uuid().references(() => reportsInPlatform.id, { onDelete: "set null" } ),
	type: text().notNull(),
	payload: jsonb().notNull(),
	status: deliveryStatusInPlatform().default("pending").notNull(),
	attempts: integer().default(0).notNull(),
	lastError: text(),
	lastAttemptAt: timestamp({ withTimezone: true }),
	queuedAt: timestamp({ withTimezone: true }),
	deliveredAt: timestamp({ withTimezone: true }),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	sandbox: boolean().default(false).notNull(),
}, (table) => [
	index("moderationDeliveries_client_idx").using("btree", table.clientId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("moderationDeliveries_pending_idx").using("btree", table.queuedAt.asc().nullsLast()).where(sql`(status = 'pending'::platform."deliveryStatus")`),
	index("moderationDeliveries_report_idx").using("btree", table.reportId.asc().nullsLast()),
check("moderationDeliveries_target_check", sql`(("appId" IS NOT NULL) OR sandbox)`),check("moderationDeliveries_type_check", sql`(type = ANY (ARRAY['content.hide'::text, 'content.remove'::text, 'content.restore'::text, 'user.suspend'::text, 'user.ban'::text, 'user.restore'::text, 'user.delete'::text]))`),]);

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
	userId: uuid().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	type: oauthRegistrationTypeInPlatform().default("development").notNull(),
	label: text().default("Default Client").notNull(),
	tier: oauthTierInPlatform().default("development").notNull(),
	status: oauthStatusInPlatform().default("testing").notNull(),
	asksForConsent: boolean().default(true).notNull(),
	logoPath: text(),
	homepageUrl: text(),
	privacyPolicyUrl: text(),
}, (table) => [

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
check("oauthRegistrations_consent_skip_check", sql`("asksForConsent" OR (("userId" IS NULL) AND (status = 'in_production'::platform."oauthStatus")))`),check("oauthRegistrations_homepageUrl_https", sql`(("homepageUrl" IS NULL) OR (("homepageUrl" ~ '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'::text) AND (char_length("homepageUrl") <= 2048)))`),check("oauthRegistrations_logoPath_length", sql`(("logoPath" IS NULL) OR (char_length("logoPath") <= 512))`),check("oauthRegistrations_privacyPolicyUrl_https", sql`(("privacyPolicyUrl" IS NULL) OR (("privacyPolicyUrl" ~ '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'::text) AND (char_length("privacyPolicyUrl") <= 2048)))`),]);

export const oauthTestAccountsInPlatform = platform.table.withRLS("oauthTestAccounts", {
	testUserId: uuid().primaryKey().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	ownerUserId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	createdAt: timestamp().default(sql`now()`).notNull(),
}, (table) => [
	index("oauthTestAccounts_ownerUserId_idx").using("btree", table.ownerUserId.asc().nullsLast()),

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
	showStars: boolean().default(true).notNull(),
	showContributions: boolean().default(true).notNull(),
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
	meetingId: uuid().notNull(),
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
check("reflectionRevisions_changeReason_length", sql`(("changeReason" IS NULL) OR (char_length("changeReason") <= 500))`),]);

export const reflectionsInPlatform = platform.table.withRLS("reflections", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid().notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	meetingId: uuid().notNull().references(() => meetingsInPlatform.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	content: text().default("").notNull(),
	submittedAt: timestamp({ withTimezone: true }),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
	workshopDefinitionId: text(),
}, (table) => [
	uniqueIndex("reflections_userId_meetingId_key").using("btree", table.userId.asc().nullsLast(), table.meetingId.asc().nullsLast()).where(sql`("meetingId" IS NOT NULL)`),
	index("reflections_userId_updatedAt_idx").using("btree", table.userId.asc().nullsLast(), table.updatedAt.desc().nullsFirst()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("own_select", { for: "select", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")` }),
]);

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
	reporterUserId: uuid().references(() => users.id, { onDelete: "set null" } ),
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
	moderatorUserId: uuid().references(() => users.id, { onDelete: "set null" } ),
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
	reporterUserId: uuid().references(() => users.id, { onDelete: "set null" } ),
	reportedUserId: uuid().references(() => users.id, { onDelete: "set null" } ),
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
	canManageOAuthApps: boolean(),
	canDeleteAccounts: boolean(),
}, (table) => [
	index("roles_isLeadership_rank_idx").using("btree", table.rank.asc().nullsLast()).where(sql`"isLeadership"`),
	unique("roles_discordRoleId_key").on(table.discordRoleId),	unique("roles_rank_key").on(table.rank),	unique("roles_title_key").on(table.title),
	pgPolicy("crud_authenticated_policy_delete", { as: "restrictive", for: "delete", to: ["authenticated"], using: sql`false` }),

	pgPolicy("crud_authenticated_policy_insert", { as: "restrictive", for: "insert", to: ["authenticated"], withCheck: sql`false` }),

	pgPolicy("crud_authenticated_policy_select", { for: "select", to: ["authenticated"], using: sql`true` }),

	pgPolicy("crud_authenticated_policy_update", { as: "restrictive", for: "update", to: ["authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("deny_test_identities", { as: "restrictive", to: ["authenticated"], using: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))`, withCheck: sql`(NOT platform.is_test_identity(( SELECT auth.uid() AS uid)))` }),
check("roles_custom_requires_rank", sql`(("roleType" = 'custom'::platform."roleType") = (rank IS NOT NULL))`),]);

export const sandboxReportsInPlatform = platform.table.withRLS("sandboxReports", {
	id: uuid().defaultRandom().primaryKey(),
	clientId: uuid().notNull().references(() => oauthClients.id, { onDelete: "cascade" } ),
	reporterUserId: uuid().notNull().references(() => users.id, { onDelete: "cascade" } ),
	authorUserId: uuid().notNull().references(() => users.id, { onDelete: "cascade" } ),
	contentType: text().notNull(),
	contentRef: text().notNull(),
	contentSnapshot: varchar({ length: 5000 }).notNull(),
	contentUrl: text(),
	description: varchar({ length: 1000 }),
	reason: reportReasonInPlatform().notNull(),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("sandboxReports_client_idx").using("btree", table.clientId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
]);

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
	definitionId: text(),
	elHours: numeric({ precision: 4, scale: 2 }).default('1').notNull(),
	topics: text().array().default([]).notNull(),
}, (table) => [
	index("workshops_live_idx").using("btree", table.meetingId.asc().nullsLast()).where(sql`("deletedAt" IS NULL)`),
	uniqueIndex("workshops_meeting_definition_live_key").using("btree", table.meetingId.asc().nullsLast(), table.definitionId.asc().nullsLast()).where(sql`(("deletedAt" IS NULL) AND ("definitionId" IS NOT NULL))`),
	unique("workshops_id_meetingId_key").on(table.id, table.meetingId),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("workshops_definitionId_format", sql`(("definitionId" IS NULL) OR ("definitionId" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))`),check("workshops_description_length", sql`((description IS NULL) OR (char_length(description) <= 280))`),check("workshops_elHours_range", sql`(("elHours" > (0)::numeric) AND ("elHours" <= (8)::numeric))`),check("workshops_title_length", sql`((title IS NULL) OR (char_length(title) <= 80))`),]);
export const memberStarsInPlatform = platform.view("memberStars", {	userId: uuid(),
	activityType: text(),
	activityId: uuid(),
	meetingId: uuid(),
	startsAt: timestamp({ withTimezone: true }),
	earnedAt: timestamp({ withTimezone: true }),
}).with({"securityInvoker":true}).as(sql`SELECT a."userId", 'meeting'::text AS "activityType", m.id AS "activityId", m.id AS "meetingId", m."startsAt", a."recordedAt" AS "earnedAt" FROM platform.attendance a JOIN platform.meetings m ON m.id = a."meetingId" WHERE m."countsForCredit" AND m."cancelledAt" IS NULL AND m."deletedAt" IS NULL`);

export const profileWithVerificationInPlatform = platform.view("profileWithVerification", {	userId: uuid(),
	hasPronouns: boolean(),
	hasGraduationDate: boolean(),
	hasGithub: boolean(),
	hasDiscord: boolean(),
	nameMatchesInvolvement: boolean(),
	verified: boolean(),
}).with({"securityInvoker":true}).as(sql`SELECT "userId", pronouns IS NOT NULL AND array_length(pronouns, 1) > 0 AS "hasPronouns", "graduationSemester" IS NOT NULL AND "graduationYear" IS NOT NULL AS "hasGraduationDate", (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'github'::text)) AS "hasGithub", (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'discord'::text)) AS "hasDiscord", "involvementFirstName" IS NOT NULL AND lower(TRIM(BOTH FROM "preferredName")) = lower((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")) AS "nameMatchesInvolvement", pronouns IS NOT NULL AND array_length(pronouns, 1) > 0 AND "graduationSemester" IS NOT NULL AND "graduationYear" IS NOT NULL AND "involvementFirstName" IS NOT NULL AND lower(TRIM(BOTH FROM "preferredName")) = lower((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")) AND (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'github'::text)) AND (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'discord'::text)) OR (EXISTS ( SELECT 1 FROM platform."userRoles" ur JOIN platform.roles r ON r.id = ur."roleId" WHERE ur."userId" = p."userId" AND r."isLeadership")) AS verified FROM platform.profile p`);

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
	showContributions: boolean(),
	showStars: boolean(),
	graduationYear: integer(),
	majors: text().array(),
	isLeadership: boolean(),
}).as(sql`SELECT p."userId", p.handle, CASE WHEN p."showName" THEN p."preferredName" ELSE NULL::character varying END AS "displayName", p."showAvatar" AND (EXISTS ( SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'avatars'::text AND o.name = p."userId"::text)) AS "hasAvatar", CASE WHEN p."showBio" THEN p.bio ELSE NULL::character varying END AS bio, CASE WHEN p."showBio" THEN p."roleDescription" ELSE NULL::character varying END AS "roleDescription", CASE WHEN p."showGithub" THEN ( SELECT lower(i.identity_data ->> 'user_name'::text) AS lower FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'github'::text) ELSE NULL::text END AS "githubHandle", CASE WHEN p."showDiscord" THEN ( SELECT i.identity_data ->> 'full_name'::text FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'discord'::text) ELSE NULL::text END AS "discordHandle", CASE WHEN p."showLinkedin" THEN ( SELECT i.identity_data ->> 'name'::text FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'linkedin_oidc'::text) ELSE NULL::text END AS "linkedinName", p."showName", p."showAvatar", p."showBio", p."showLinks", p."showContributions", p."showStars", p."graduationYear", ARRAY( SELECT m.name FROM ( SELECT ap.name, min(pap."sortOrder") AS ord FROM platform."profileAcademicPrograms" pap JOIN platform."academicPrograms" ap ON ap.id = pap."programId" WHERE pap."userId" = p."userId" AND (ap.category = ANY (ARRAY['undergraduate_major'::platform."academicProgramCategory", 'graduate_major'::platform."academicProgramCategory"])) GROUP BY ap.name) m ORDER BY m.ord) AS majors, (EXISTS ( SELECT 1 FROM platform."userRoles" ur JOIN platform.roles r ON r.id = ur."roleId" WHERE ur."userId" = p."userId" AND r."isLeadership")) AS "isLeadership" FROM platform.profile p JOIN platform."profileWithVerification" v ON v."userId" = p."userId" WHERE v.verified AND p."publicProfile" AND p.handle IS NOT NULL AND p."quarantinedBy" IS NULL AND NOT platform.is_suspended(p."userId") AND NOT (EXISTS ( SELECT 1 FROM platform."accountDeletions" d WHERE d."userId" = p."userId"))`);

export const resolvedUserPermissionsInPlatform = platform.materializedView("resolvedUserPermissions", {	userId: uuid(),
	canModerate: boolean(),
	canManageRoles: boolean(),
	canManageSuspensions: boolean(),
	canViewAuditLog: boolean(),
	canManageAttendance: boolean(),
	canPreviewDocs: boolean(),
	canManageOAuthApps: boolean(),
	canDeleteAccounts: boolean(),
	isLeader: boolean(),
	minRank: doublePrecision(),
}).as(sql`WITH user_custom_roles AS ( SELECT ur."userId", r.rank, r."isLeadership", r."canModerate", r."canManageRoles", r."canManageSuspensions", r."canViewAuditLog", r."canManageAttendance", r."canPreviewDocs", r."canManageOAuthApps" FROM platform."userRoles" ur JOIN platform.roles r ON r.id = ur."roleId" AND r."roleType" = 'custom'::platform."roleType" ), first_non_null AS ( SELECT ucr."userId", min(ucr.rank) AS "minRank", bool_or(ucr."isLeadership") AS "isLeader", (array_agg(ucr."canModerate" ORDER BY ucr.rank) FILTER (WHERE ucr."canModerate" IS NOT NULL))[1] AS "canModerate", (array_agg(ucr."canManageRoles" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageRoles" IS NOT NULL))[1] AS "canManageRoles", (array_agg(ucr."canManageSuspensions" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageSuspensions" IS NOT NULL))[1] AS "canManageSuspensions", (array_agg(ucr."canViewAuditLog" ORDER BY ucr.rank) FILTER (WHERE ucr."canViewAuditLog" IS NOT NULL))[1] AS "canViewAuditLog", (array_agg(ucr."canManageAttendance" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageAttendance" IS NOT NULL))[1] AS "canManageAttendance", (array_agg(ucr."canPreviewDocs" ORDER BY ucr.rank) FILTER (WHERE ucr."canPreviewDocs" IS NOT NULL))[1] AS "canPreviewDocs" FROM user_custom_roles ucr GROUP BY ucr."userId" ), all_users AS ( SELECT DISTINCT "userRoles"."userId" FROM platform."userRoles" ) SELECT au."userId", COALESCE(fnn."canModerate", false) AS "canModerate", COALESCE(fnn."canManageRoles", false) AS "canManageRoles", COALESCE(fnn."canManageSuspensions", false) AS "canManageSuspensions", COALESCE(fnn."canViewAuditLog", false) AS "canViewAuditLog", COALESCE(fnn."canManageAttendance", false) AS "canManageAttendance", COALESCE(fnn."canPreviewDocs", false) AS "canPreviewDocs", COALESCE(fnn."canManageOAuthApps", false) AS "canManageOAuthApps", COALESCE(fnn."isLeader", false) AS "isLeader", COALESCE(fnn."minRank", 'Infinity'::double precision) AS "minRank" FROM all_users au LEFT JOIN first_non_null fnn ON fnn."userId" = au."userId"`);

// Schema-suffix aliases — appended by types:drizzle
export { academicProgramCategoryInPlatform as academicProgramCategory };
export { academicProgramsInPlatform as academicPrograms };
export { accountDeletionsInPlatform as accountDeletions };
export { appKindInPlatform as appKind };
export { appsInPlatform as apps };
export { attendanceInPlatform as attendance };
export { attendanceInvitesInPlatform as attendanceInvites };
export { auditEventSourceInPlatform as auditEventSource };
export { auditEventsInPlatform as auditEvents };
export { badgeAwardsInPlatform as badgeAwards };
export { checkInMethodInPlatform as checkInMethod };
export { configReconcileStateInPlatform as configReconcileState };
export { contentActionInPlatform as contentAction };
export { contentTypesInPlatform as contentTypes };
export { contentVisibilityInPlatform as contentVisibility };
export { contributionsInPlatform as contributions };
export { deletedAccountBlocksInPlatform as deletedAccountBlocks };
export { deliveryStatusInPlatform as deliveryStatus };
export { discordRoleMembershipsInPlatform as discordRoleMemberships };
export { docsIndexStateInPlatform as docsIndexState };
export { docsPagesInPlatform as docsPages };
export { exportAuditInPlatform as exportAudit };
export { externalContentTypesInPlatform as externalContentTypes };
export { filerActionInPlatform as filerAction };
export { graduationSemesterInPlatform as graduationSemester };
export { identityLinkIntentsInPlatform as identityLinkIntents };
export { jobHeartbeatsInPlatform as jobHeartbeats };
export { leaderboardProfilesInPlatform as leaderboardProfiles };
export { meetingsInPlatform as meetings };
export { memberStarsInPlatform as memberStars };
export { moderationClientsInPlatform as moderationClients };
export { moderationDeliveriesInPlatform as moderationDeliveries };
export { oauthConnectCodesInPlatform as oauthConnectCodes };
export { oauthDeviceCodeStatusInPlatform as oauthDeviceCodeStatus };
export { oauthDeviceCodesInPlatform as oauthDeviceCodes };
export { oauthRegistrationTypeInPlatform as oauthRegistrationType };
export { oauthRegistrationsInPlatform as oauthRegistrations };
export { oauthTestAccountsInPlatform as oauthTestAccounts };
export { oauthStatusInPlatform as oauthStatus };
export { oauthTierInPlatform as oauthTier };
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
export { sandboxReportsInPlatform as sandboxReports };
export { seasonsInPlatform as seasons };
export { subjectActionInPlatform as subjectAction };
export { supportConversationsInPlatform as supportConversations };
export { supportForumPostsInPlatform as supportForumPosts };
export { supportGuestsInPlatform as supportGuests };
export { supportMessagesInPlatform as supportMessages };
export { surveyAnswerRevisionsInPlatform as surveyAnswerRevisions };
export { surveyAnswersInPlatform as surveyAnswers };
export { surveyQuestionsInPlatform as surveyQuestions };
export { userRolesInPlatform as userRoles };
export { userSuspensionsInPlatform as userSuspensions };
export { workshopsInPlatform as workshops };
