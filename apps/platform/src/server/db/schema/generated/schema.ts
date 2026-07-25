import {
  pgSchema,
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  pgEnum,
  date,
  timestamp,
  doublePrecision,
  boolean,
  jsonb,
  customType,
  uniqueIndex,
  index,
  foreignKey,
  primaryKey,
  unique,
  check,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
// Cross-schema FK targets — re-injected by scripts/post-pull.ts after each drizzle-kit pull
import {
  usersInAuth as users,
  oauthClientsInAuth as oauthClients,
} from "~/supabase/drizzle/schema";

export const platform = pgSchema("platform");
export const graduationSemesterInPlatform = platform.enum(
  "graduationSemester",
  ["spring", "summer", "fall"],
);
export const credentialTypeInPlatform = platform.enum("credentialType", [
  "email_password",
  "totp",
  "email_password_totp",
]);
export const roleTypeInPlatform = platform.enum("roleType", [
  "default",
  "root",
  "custom",
]);
export const contentActionInPlatform = platform.enum("contentAction", [
  "quarantine",
  "no_action",
]);
export const filerActionInPlatform = platform.enum("filerAction", [
  "warn",
  "suspend",
  "no_action",
]);
export const reportStatusInPlatform = platform.enum("reportStatus", [
  "unverified",
  "pending",
  "resolved",
  "dismissed",
]);
export const subjectActionInPlatform = platform.enum("subjectAction", [
  "warn",
  "suspend",
  "ban",
  "no_action",
]);
export const oauthRegistrationTypeInPlatform = platform.enum(
  "oauthRegistrationType",
  ["development", "production"],
);
export const feedbackSeverityInPlatform = platform.enum("feedbackSeverity", [
  "low",
  "medium",
  "high",
]);
export const feedbackStatusInPlatform = platform.enum("feedbackStatus", [
  "open",
  "in_review",
  "resolved",
  "dismissed",
]);
export const feedbackTypeInPlatform = platform.enum("feedbackType", [
  "bug_report",
  "feature_request",
  "design_feedback",
  "performance",
  "content_issue",
  "other",
]);

export const contentReportsInPlatform = platform.table.withRLS(
  "contentReports",
  {
    id: uuid().defaultRandom().primaryKey(),
    clientId: uuid()
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    reporterUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportedUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contentId: text().notNull(),
    contentSnapshot: varchar({ length: 5000 }).notNull(),
    contentUrl: text(),
    description: varchar({ length: 1000 }),
    status: reportStatusInPlatform().default("unverified").notNull(),
    createdAt: timestamp()
      .default(sql`now()`)
      .notNull(),
    resolvedAt: timestamp(),
    reasonId: uuid().notNull(),
    contentTypeId: uuid(),
    verifyAttempts: integer().default(0).notNull(),
    nextVerifyAt: timestamp(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.contentTypeId],
      foreignColumns: [
        reportContentTypesInPlatform.clientId,
        reportContentTypesInPlatform.id,
      ],
      name: "contentReports_clientId_contentTypeId_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.clientId, table.reasonId],
      foreignColumns: [
        reportReasonsInPlatform.clientId,
        reportReasonsInPlatform.id,
      ],
      name: "contentReports_clientId_reasonId_fkey",
    }).onDelete("restrict"),
    uniqueIndex("contentReports_client_content_idx").using(
      "btree",
      table.clientId.asc().nullsLast(),
      table.contentId.asc().nullsLast(),
    ),

    pgPolicy("crud_authenticated_policy_delete", {
      as: "restrictive",
      for: "delete",
      to: ["authenticated"],
      using: sql`false`,
    }),

    pgPolicy("crud_authenticated_policy_select", {
      for: "select",
      to: ["authenticated"],
      using: sql`((( SELECT auth.uid() AS uid) = "reporterUserId") OR (EXISTS ( SELECT 1
   FROM platform."moderatorRoles" mr
  WHERE ((mr."userId" = ( SELECT auth.uid() AS uid)) AND (mr."clientId" = "contentReports"."clientId")))))`,
    }),

    pgPolicy("crud_authenticated_policy_update", {
      as: "restrictive",
      for: "update",
      to: ["authenticated"],
      using: sql`false`,
      withCheck: sql`false`,
    }),

    pgPolicy("reporter_insert", {
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`(( SELECT auth.uid() AS uid) = "reporterUserId")`,
    }),
  ],
);

export const credentialRolesInPlatform = platform.table.withRLS(
  "credentialRoles",
  {
    credentialId: uuid()
      .notNull()
      .references(() => credentialsInPlatform.id, { onDelete: "cascade" }),
    roleId: uuid()
      .notNull()
      .references(() => rolesInPlatform.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({
      columns: [table.credentialId, table.roleId],
      name: "credentialRoles_pkey",
    }),

    pgPolicy("crud_public_policy_delete", {
      as: "restrictive",
      for: "delete",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_insert", {
      as: "restrictive",
      for: "insert",
      withCheck: sql`false`,
    }),

    pgPolicy("crud_public_policy_select", {
      as: "restrictive",
      for: "select",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_update", {
      as: "restrictive",
      for: "update",
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
);

export const credentialsInPlatform = platform.table.withRLS(
  "credentials",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    description: text(),
    type: credentialTypeInPlatform().notNull(),
    email: text(),
    passwordSecretId: uuid(),
    totpSecretId: uuid(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    pgPolicy("crud_public_policy_delete", {
      as: "restrictive",
      for: "delete",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_insert", {
      as: "restrictive",
      for: "insert",
      withCheck: sql`false`,
    }),

    pgPolicy("crud_public_policy_select", {
      as: "restrictive",
      for: "select",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_update", {
      as: "restrictive",
      for: "update",
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
);

export const docsBranchesInPlatform = platform.table.withRLS(
  "docsBranches",
  {
    id: uuid().defaultRandom().primaryKey(),
    repoId: uuid()
      .notNull()
      .references(() => docsReposInPlatform.id, { onDelete: "cascade" }),
    name: text().notNull(),
    lastSyncedCommit: text(),
    lastSyncedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("docsBranches_repo_name_idx").using(
      "btree",
      table.repoId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),

    pgPolicy("docsBranches_public_read", {
      for: "select",
      to: ["anon", "authenticated"],
      using: sql`true`,
    }),
  ],
);

export const docsPagesInPlatform = platform.table.withRLS(
  "docsPages",
  {
    id: uuid().defaultRandom().primaryKey(),
    branchId: uuid()
      .notNull()
      .references(() => docsBranchesInPlatform.id, { onDelete: "cascade" }),
    path: text().notNull(),
    blobSha: text().notNull(),
    title: text().notNull(),
    description: text(),
    frontmatter: jsonb().default({}).notNull(),
    headings: jsonb().default([]).notNull(),
    content: text().notNull(),
    plainText: text().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    search: customType({ dataType: () => "tsvector" })().generatedAlwaysAs(
      sql`((setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, "plainText"), 'C'::"char"))`,
    ),
  },
  (table) => [
    uniqueIndex("docsPages_branch_path_idx").using(
      "btree",
      table.branchId.asc().nullsLast(),
      table.path.asc().nullsLast(),
    ),
    index("docsPages_search_idx").using("gin", table.search.asc().nullsLast()),

    pgPolicy("docsPages_public_read", {
      for: "select",
      to: ["anon", "authenticated"],
      using: sql`true`,
    }),
  ],
);

export const docsReposInPlatform = platform.table.withRLS(
  "docsRepos",
  {
    id: uuid().defaultRandom().primaryKey(),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    defaultBranch: text().default("main").notNull(),
    sortOrder: integer().default(0).notNull(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("docsRepos_slug_idx").using(
      "btree",
      table.slug.asc().nullsLast(),
    ),

    pgPolicy("docsRepos_public_read", {
      for: "select",
      to: ["anon", "authenticated"],
      using: sql`true`,
    }),
  ],
);

export const feedbackTopicsInPlatform = platform.table.withRLS(
  "feedbackTopics",
  {
    id: uuid().defaultRandom().primaryKey(),
    clientId: uuid()
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    label: varchar({ length: 50 }).notNull(),
    createdAt: timestamp()
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("feedbackTopics_client_id_idx").using(
      "btree",
      table.clientId.asc().nullsLast(),
      table.id.asc().nullsLast(),
    ),
    uniqueIndex("feedbackTopics_client_label_idx").using(
      "btree",
      table.clientId.asc().nullsLast(),
      table.label.asc().nullsLast(),
    ),

    pgPolicy("authenticated_select", {
      for: "select",
      to: ["authenticated"],
      using: sql`true`,
    }),

    pgPolicy("crud_public_policy_update", {
      as: "restrictive",
      for: "update",
      using: sql`false`,
      withCheck: sql`false`,
    }),

    pgPolicy("owner_delete", {
      for: "delete",
      to: ["authenticated"],
      using: sql`(auth.uid() = ( SELECT "oauthRegistrations"."userId"
   FROM platform."oauthRegistrations"
  WHERE ("oauthRegistrations"."clientId" = "feedbackTopics"."clientId")))`,
    }),

    pgPolicy("owner_insert", {
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`(auth.uid() = ( SELECT "oauthRegistrations"."userId"
   FROM platform."oauthRegistrations"
  WHERE ("oauthRegistrations"."clientId" = "feedbackTopics"."clientId")))`,
    }),
  ],
);

export const leaderboardProfilesInPlatform = platform.table.withRLS(
  "leaderboardProfiles",
  {
    githubId: varchar({ length: 255 }).primaryKey(),
    githubLogin: varchar({ length: 255 }).notNull(),
    avatarUrl: text(),
    allTimePoints: integer().default(0).notNull(),
    allTimeRanking: integer(),
    currentYearPoints: integer().default(0).notNull(),
    currentYearRanking: integer(),
  },
  (table) => [
    uniqueIndex("login_idx").using("btree", sql`lower(("githubLogin")::text)`),
    unique("leaderboardProfiles_githubLogin_key").on(table.githubLogin),
    pgPolicy("crud_public_policy_delete", {
      as: "restrictive",
      for: "delete",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_insert", {
      as: "restrictive",
      for: "insert",
      withCheck: sql`false`,
    }),

    pgPolicy("crud_public_policy_select", {
      as: "restrictive",
      for: "select",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_update", {
      as: "restrictive",
      for: "update",
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
);

export const moderatorRolesInPlatform = platform.table.withRLS(
  "moderatorRoles",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid()
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    grantedByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp()
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("moderatorRoles_user_client_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.clientId.asc().nullsLast(),
    ),

    pgPolicy("crud_authenticated_policy_delete", {
      as: "restrictive",
      for: "delete",
      to: ["authenticated"],
      using: sql`false`,
    }),

    pgPolicy("crud_authenticated_policy_insert", {
      as: "restrictive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`false`,
    }),

    pgPolicy("crud_authenticated_policy_select", {
      for: "select",
      to: ["authenticated"],
      using: sql`(( SELECT auth.uid() AS uid) = "userId")`,
    }),

    pgPolicy("crud_authenticated_policy_update", {
      as: "restrictive",
      for: "update",
      to: ["authenticated"],
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
);

export const oauthRegistrationsInPlatform = platform.table.withRLS(
  "oauthRegistrations",
  {
    clientId: uuid()
      .primaryKey()
      .references(() => oauthClients.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: uuid()
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    type: oauthRegistrationTypeInPlatform().default("development").notNull(),
    reportWebhookUrl: text(),
    reportWebhookSecretId: uuid(),
  },
  (table) => [
    unique("oauthRegistrations_userId_key").on(table.userId),
    pgPolicy("crud_public_policy_delete", {
      as: "restrictive",
      for: "delete",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_insert", {
      as: "restrictive",
      for: "insert",
      withCheck: sql`false`,
    }),

    pgPolicy("crud_public_policy_select", {
      as: "restrictive",
      for: "select",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_update", {
      as: "restrictive",
      for: "update",
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
);

export const oauthTestAccountsInPlatform = platform.table.withRLS(
  "oauthTestAccounts",
  {
    testUserId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    ownerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: timestamp()
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    unique("oauthTestAccounts_ownerUserId_key").on(table.ownerUserId),
    pgPolicy("crud_public_policy_delete", {
      as: "restrictive",
      for: "delete",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_insert", {
      as: "restrictive",
      for: "insert",
      withCheck: sql`false`,
    }),

    pgPolicy("crud_public_policy_select", {
      as: "restrictive",
      for: "select",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_update", {
      as: "restrictive",
      for: "update",
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
);

export const pointsInPlatform = platform.table.withRLS(
  "points",
  {
    leaderboardProfileId: varchar({ length: 255 })
      .notNull()
      .references(() => leaderboardProfilesInPlatform.githubId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    year: integer().notNull(),
    streakStart: date().notNull(),
    streakLength: integer().default(0).notNull(),
    longestStreakLength: integer().default(0).notNull(),
    projectPoints: integer().default(0).notNull(),
    streakBonusPoints: integer().default(0).notNull(),
    academyPoints: integer().default(0).notNull(),
    points: integer()
      .notNull()
      .generatedAlwaysAs(
        sql`(("projectPoints" + "streakBonusPoints") + "academyPoints")`,
      ),
  },
  (table) => [
    primaryKey({
      columns: [table.leaderboardProfileId, table.year],
      name: "points_pkey",
    }),

    pgPolicy("crud_public_policy_delete", {
      as: "restrictive",
      for: "delete",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_insert", {
      as: "restrictive",
      for: "insert",
      withCheck: sql`false`,
    }),

    pgPolicy("crud_public_policy_select", {
      as: "restrictive",
      for: "select",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_update", {
      as: "restrictive",
      for: "update",
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
);

export const profileInPlatform = platform.table.withRLS(
  "profile",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
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
  },
  (table) => [
    pgPolicy("crud_authenticated_policy_delete", {
      as: "restrictive",
      for: "delete",
      to: ["authenticated"],
      using: sql`false`,
    }),

    pgPolicy("crud_authenticated_policy_insert", {
      as: "restrictive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`false`,
    }),

    pgPolicy("crud_authenticated_policy_select", {
      for: "select",
      to: ["authenticated"],
      using: sql`(( SELECT auth.uid() AS uid) = "userId")`,
    }),

    pgPolicy("crud_authenticated_policy_update", {
      for: "update",
      to: ["authenticated"],
      using: sql`(( SELECT auth.uid() AS uid) = "userId")`,
      withCheck: sql`(( SELECT auth.uid() AS uid) = "userId")`,
    }),
  ],
);

export const profileLinksInPlatform = platform.table.withRLS(
  "profileLinks",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => profileInPlatform.userId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    url: text().notNull(),
    title: varchar({ length: 64 }).notNull(),
    sortOrder: doublePrecision().default(0).notNull(),
    createdAt: timestamp().default(sql`now()`),
  },
  (table) => [
    unique("profileLinks_userId_sortOrder_key").on(
      table.userId,
      table.sortOrder,
    ),
    pgPolicy("crud_authenticated_policy_delete", {
      for: "delete",
      to: ["authenticated"],
      using: sql`(( SELECT auth.uid() AS uid) = "userId")`,
    }),

    pgPolicy("crud_authenticated_policy_insert", {
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`(( SELECT auth.uid() AS uid) = "userId")`,
    }),

    pgPolicy("crud_authenticated_policy_select", {
      for: "select",
      to: ["authenticated"],
      using: sql`(( SELECT auth.uid() AS uid) = "userId")`,
    }),

    pgPolicy("crud_authenticated_policy_update", {
      for: "update",
      to: ["authenticated"],
      using: sql`(( SELECT auth.uid() AS uid) = "userId")`,
      withCheck: sql`(( SELECT auth.uid() AS uid) = "userId")`,
    }),
  ],
);

export const reportContentTypesInPlatform = platform.table.withRLS(
  "reportContentTypes",
  {
    id: uuid().defaultRandom().primaryKey(),
    clientId: uuid()
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    label: varchar({ length: 100 }).notNull(),
    createdAt: timestamp()
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("reportContentTypes_client_id_idx").using(
      "btree",
      table.clientId.asc().nullsLast(),
      table.id.asc().nullsLast(),
    ),
    uniqueIndex("reportContentTypes_client_label_idx").using(
      "btree",
      table.clientId.asc().nullsLast(),
      table.label.asc().nullsLast(),
    ),

    pgPolicy("authenticated_select", {
      for: "select",
      to: ["authenticated"],
      using: sql`true`,
    }),

    pgPolicy("owner_delete", {
      for: "delete",
      to: ["authenticated"],
      using: sql`(auth.uid() = ( SELECT "oauthRegistrations"."userId"
   FROM platform."oauthRegistrations"
  WHERE ("oauthRegistrations"."clientId" = "reportContentTypes"."clientId")))`,
    }),

    pgPolicy("owner_insert", {
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`(auth.uid() = ( SELECT "oauthRegistrations"."userId"
   FROM platform."oauthRegistrations"
  WHERE ("oauthRegistrations"."clientId" = "reportContentTypes"."clientId")))`,
    }),
  ],
);

export const reportCorroborationsInPlatform = platform.table.withRLS(
  "reportCorroborations",
  {
    id: uuid().defaultRandom().primaryKey(),
    reportId: uuid()
      .notNull()
      .references(() => contentReportsInPlatform.id, { onDelete: "cascade" }),
    reporterUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    description: varchar({ length: 1000 }),
    createdAt: timestamp()
      .default(sql`now()`)
      .notNull(),
    reasonId: uuid()
      .notNull()
      .references(() => reportReasonsInPlatform.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("reportCorroborations_report_reporter_idx").using(
      "btree",
      table.reportId.asc().nullsLast(),
      table.reporterUserId.asc().nullsLast(),
    ),

    pgPolicy("corroborator_insert", {
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`(( SELECT auth.uid() AS uid) = "reporterUserId")`,
    }),

    pgPolicy("corroborator_select", {
      for: "select",
      to: ["authenticated"],
      using: sql`((( SELECT auth.uid() AS uid) = "reporterUserId") OR (EXISTS ( SELECT 1
   FROM (platform."contentReports" cr
     JOIN platform."moderatorRoles" mr ON ((mr."clientId" = cr."clientId")))
  WHERE ((cr.id = "reportCorroborations"."reportId") AND (mr."userId" = ( SELECT auth.uid() AS uid))))))`,
    }),

    pgPolicy("crud_authenticated_policy_delete", {
      as: "restrictive",
      for: "delete",
      to: ["authenticated"],
      using: sql`false`,
    }),

    pgPolicy("crud_authenticated_policy_update", {
      as: "restrictive",
      for: "update",
      to: ["authenticated"],
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
);

export const reportReasonsInPlatform = platform.table.withRLS(
  "reportReasons",
  {
    id: uuid().defaultRandom().primaryKey(),
    clientId: uuid()
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    title: varchar({ length: 100 }).notNull(),
    description: text(),
    createdAt: timestamp()
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("reportReasons_client_id_idx").using(
      "btree",
      table.clientId.asc().nullsLast(),
      table.id.asc().nullsLast(),
    ),
    uniqueIndex("reportReasons_client_title_idx").using(
      "btree",
      table.clientId.asc().nullsLast(),
      table.title.asc().nullsLast(),
    ),

    pgPolicy("authenticated_select", {
      for: "select",
      to: ["authenticated"],
      using: sql`true`,
    }),

    pgPolicy("owner_delete", {
      for: "delete",
      to: ["authenticated"],
      using: sql`(auth.uid() = ( SELECT "oauthRegistrations"."userId"
   FROM platform."oauthRegistrations"
  WHERE ("oauthRegistrations"."clientId" = "reportReasons"."clientId")))`,
    }),

    pgPolicy("owner_insert", {
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`(auth.uid() = ( SELECT "oauthRegistrations"."userId"
   FROM platform."oauthRegistrations"
  WHERE ("oauthRegistrations"."clientId" = "reportReasons"."clientId")))`,
    }),
  ],
);

export const reportResolutionsInPlatform = platform.table.withRLS(
  "reportResolutions",
  {
    id: uuid().defaultRandom().primaryKey(),
    reportId: uuid()
      .notNull()
      .references(() => contentReportsInPlatform.id, { onDelete: "cascade" }),
    moderatorUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subjectAction: subjectActionInPlatform().notNull(),
    filerAction: filerActionInPlatform().notNull(),
    contentAction: contentActionInPlatform().notNull(),
    appliedGlobally: boolean().default(false).notNull(),
    moderatorNote: text(),
    webhookAttempts: integer().default(0).notNull(),
    nextRetryAt: timestamp(),
    notifiedAt: timestamp(),
    createdAt: timestamp()
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    unique("reportResolutions_reportId_key").on(table.reportId),
    pgPolicy("crud_authenticated_policy_delete", {
      as: "restrictive",
      for: "delete",
      to: ["authenticated"],
      using: sql`false`,
    }),

    pgPolicy("crud_authenticated_policy_insert", {
      as: "restrictive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`false`,
    }),

    pgPolicy("crud_authenticated_policy_select", {
      for: "select",
      to: ["authenticated"],
      using: sql`(EXISTS ( SELECT 1
   FROM platform."contentReports" cr
  WHERE ((cr.id = "reportResolutions"."reportId") AND ((cr."reporterUserId" = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM platform."moderatorRoles" mr
          WHERE ((mr."userId" = ( SELECT auth.uid() AS uid)) AND (mr."clientId" = cr."clientId"))))))))`,
    }),

    pgPolicy("crud_authenticated_policy_update", {
      as: "restrictive",
      for: "update",
      to: ["authenticated"],
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
);

export const rolesInPlatform = platform.table.withRLS(
  "roles",
  {
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
    createdAt: timestamp()
      .default(sql`now()`)
      .notNull(),
    roleType: roleTypeInPlatform().default("custom").notNull(),
    showOnProfile: boolean().default(true).notNull(),
    isLeadership: boolean().default(false).notNull(),
    discordRoleId: text(),
    discordSyncedName: text(),
    discordSyncedColor: integer(),
  },
  (table) => [
    unique("roles_discordRoleId_key").on(table.discordRoleId),
    unique("roles_rank_key").on(table.rank),
    unique("roles_title_key").on(table.title),
    pgPolicy("crud_authenticated_policy_delete", {
      as: "restrictive",
      for: "delete",
      to: ["authenticated"],
      using: sql`false`,
    }),

    pgPolicy("crud_authenticated_policy_insert", {
      as: "restrictive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`false`,
    }),

    pgPolicy("crud_authenticated_policy_select", {
      for: "select",
      to: ["authenticated"],
      using: sql`true`,
    }),

    pgPolicy("crud_authenticated_policy_update", {
      as: "restrictive",
      for: "update",
      to: ["authenticated"],
      using: sql`false`,
      withCheck: sql`false`,
    }),
    check(
      "roles_custom_requires_rank",
      sql`(("roleType" = 'custom'::platform."roleType") = (rank IS NOT NULL))`,
    ),
  ],
);

export const siteFeedbackInPlatform = platform.table.withRLS(
  "siteFeedback",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: feedbackTypeInPlatform().notNull(),
    severity: feedbackSeverityInPlatform(),
    title: varchar({ length: 100 }).notNull(),
    description: text().notNull(),
    status: feedbackStatusInPlatform().default("open").notNull(),
    browserMetadata: jsonb(),
    attachmentPaths: text().array(),
    adminNote: text(),
    createdAt: timestamp()
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp()
      .default(sql`now()`)
      .notNull(),
    clientId: uuid().references(() => oauthClients.id, {
      onDelete: "set null",
    }),
    topicId: uuid(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.topicId],
      foreignColumns: [
        feedbackTopicsInPlatform.clientId,
        feedbackTopicsInPlatform.id,
      ],
      name: "siteFeedback_clientId_topicId_fkey",
    }).onDelete("restrict"),

    pgPolicy("crud_authenticated_policy_delete", {
      as: "restrictive",
      for: "delete",
      to: ["authenticated"],
      using: sql`false`,
    }),

    pgPolicy("crud_authenticated_policy_insert", {
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`(( SELECT auth.uid() AS uid) = "userId")`,
    }),

    pgPolicy("crud_authenticated_policy_select", {
      for: "select",
      to: ["authenticated"],
      using: sql`((( SELECT auth.uid() AS uid) = "userId") OR (EXISTS ( SELECT 1
   FROM (platform."userRoles" ur
     JOIN platform.roles r ON ((r.id = ur."roleId")))
  WHERE ((ur."userId" = ( SELECT auth.uid() AS uid)) AND (r."canManageFeedback" = true)))))`,
    }),

    pgPolicy("crud_authenticated_policy_update", {
      for: "update",
      to: ["authenticated"],
      using: sql`(EXISTS ( SELECT 1
   FROM (platform."userRoles" ur
     JOIN platform.roles r ON ((r.id = ur."roleId")))
  WHERE ((ur."userId" = ( SELECT auth.uid() AS uid)) AND (r."canManageFeedback" = true))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM (platform."userRoles" ur
     JOIN platform.roles r ON ((r.id = ur."roleId")))
  WHERE ((ur."userId" = ( SELECT auth.uid() AS uid)) AND (r."canManageFeedback" = true))))`,
    }),
    check(
      "siteFeedback_topic_xor_clientId",
      sql`(("clientId" IS NULL) = ("topicId" IS NULL))`,
    ),
  ],
);

export const userRolesInPlatform = platform.table.withRLS(
  "userRoles",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid()
      .notNull()
      .references(() => rolesInPlatform.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.roleId],
      name: "userRoles_pkey",
    }),
    uniqueIndex("userRoles_root_singleton")
      .using("btree", table.roleId.asc().nullsLast())
      .where(sql`("roleId" = '00000000-0000-0000-0000-000000000002'::uuid)`),

    pgPolicy("crud_public_policy_delete", {
      as: "restrictive",
      for: "delete",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_insert", {
      as: "restrictive",
      for: "insert",
      withCheck: sql`false`,
    }),

    pgPolicy("crud_public_policy_select", {
      as: "restrictive",
      for: "select",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_update", {
      as: "restrictive",
      for: "update",
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
);

export const userSuspensionsInPlatform = platform.table.withRLS(
  "userSuspensions",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    service: text().notNull(),
    reason: text(),
    suspendedAt: timestamp()
      .default(sql`now()`)
      .notNull(),
    suspendedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("userSuspensions_user_service_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.service.asc().nullsLast(),
    ),

    pgPolicy("crud_public_policy_delete", {
      as: "restrictive",
      for: "delete",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_insert", {
      as: "restrictive",
      for: "insert",
      withCheck: sql`false`,
    }),

    pgPolicy("crud_public_policy_select", {
      as: "restrictive",
      for: "select",
      using: sql`false`,
    }),

    pgPolicy("crud_public_policy_update", {
      as: "restrictive",
      for: "update",
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
);
export const profileWithVerificationInPlatform = platform
  .view("profileWithVerification", {
    userId: uuid(),
    hasPronouns: boolean(),
    hasGraduationDate: boolean(),
    hasGithub: boolean(),
    hasDiscord: boolean(),
    nameMatchesInvolvement: boolean(),
    verified: boolean(),
  })
  .with({ securityInvoker: true })
  .as(
    sql`SELECT "userId", pronouns IS NOT NULL AND array_length(pronouns, 1) > 0 AS "hasPronouns", "graduationSemester" IS NOT NULL AND "graduationYear" IS NOT NULL AS "hasGraduationDate", (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'github'::text)) AS "hasGithub", (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'discord'::text)) AS "hasDiscord", "involvementFirstName" IS NOT NULL AND lower(TRIM(BOTH FROM "preferredName")) = lower((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")) AS "nameMatchesInvolvement", pronouns IS NOT NULL AND array_length(pronouns, 1) > 0 AND "graduationSemester" IS NOT NULL AND "graduationYear" IS NOT NULL AND "involvementFirstName" IS NOT NULL AND lower(TRIM(BOTH FROM "preferredName")) = lower((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")) AND (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'github'::text)) AND (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'discord'::text)) AS verified FROM platform.profile p`,
  );

export const resolvedUserPermissionsInPlatform = platform
  .materializedView("resolvedUserPermissions", {
    userId: uuid(),
    canModerate: boolean(),
    canManageRoles: boolean(),
    canManageSuspensions: boolean(),
    canViewAuditLog: boolean(),
    canManageFeedback: boolean(),
    canCreateCredentials: boolean(),
    canManageVerification: boolean(),
    isLeader: boolean(),
    minRank: doublePrecision(),
  })
  .as(
    sql`WITH root_holders AS ( SELECT ur."userId" FROM platform."userRoles" ur WHERE ur."roleId" = '00000000-0000-0000-0000-000000000002'::uuid ), user_custom_roles AS ( SELECT ur."userId", r.rank, r."isLeadership", r."canModerate", r."canManageRoles", r."canManageSuspensions", r."canViewAuditLog", r."canManageFeedback", r."canCreateCredentials", r."canManageVerification" FROM platform."userRoles" ur JOIN platform.roles r ON r.id = ur."roleId" AND r."roleType" = 'custom'::platform."roleType" ), first_non_null AS ( SELECT ucr."userId", min(ucr.rank) AS "minRank", bool_or(ucr."isLeadership") AS "isLeader", (array_agg(ucr."canModerate" ORDER BY ucr.rank) FILTER (WHERE ucr."canModerate" IS NOT NULL))[1] AS "canModerate", (array_agg(ucr."canManageRoles" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageRoles" IS NOT NULL))[1] AS "canManageRoles", (array_agg(ucr."canManageSuspensions" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageSuspensions" IS NOT NULL))[1] AS "canManageSuspensions", (array_agg(ucr."canViewAuditLog" ORDER BY ucr.rank) FILTER (WHERE ucr."canViewAuditLog" IS NOT NULL))[1] AS "canViewAuditLog", (array_agg(ucr."canManageFeedback" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageFeedback" IS NOT NULL))[1] AS "canManageFeedback", (array_agg(ucr."canCreateCredentials" ORDER BY ucr.rank) FILTER (WHERE ucr."canCreateCredentials" IS NOT NULL))[1] AS "canCreateCredentials", (array_agg(ucr."canManageVerification" ORDER BY ucr.rank) FILTER (WHERE ucr."canManageVerification" IS NOT NULL))[1] AS "canManageVerification" FROM user_custom_roles ucr GROUP BY ucr."userId" ), all_users AS ( SELECT DISTINCT "userRoles"."userId" FROM platform."userRoles" ) SELECT au."userId", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canModerate", false) END AS "canModerate", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canManageRoles", false) END AS "canManageRoles", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canManageSuspensions", false) END AS "canManageSuspensions", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canViewAuditLog", false) END AS "canViewAuditLog", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canManageFeedback", false) END AS "canManageFeedback", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canCreateCredentials", false) END AS "canCreateCredentials", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canManageVerification", false) END AS "canManageVerification", CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."isLeader", false) END AS "isLeader", CASE WHEN rh."userId" IS NOT NULL THEN '-Infinity'::double precision ELSE COALESCE(fnn."minRank", 'Infinity'::double precision) END AS "minRank" FROM all_users au LEFT JOIN root_holders rh ON rh."userId" = au."userId" LEFT JOIN first_non_null fnn ON fnn."userId" = au."userId"`,
  );

// Schema-suffix aliases — appended by scripts/post-pull.ts
export { graduationSemesterInPlatform as graduationSemester };
export { credentialTypeInPlatform as credentialType };
export { roleTypeInPlatform as roleType };
export { contentActionInPlatform as contentAction };
export { filerActionInPlatform as filerAction };
export { reportStatusInPlatform as reportStatus };
export { subjectActionInPlatform as subjectAction };
export { oauthRegistrationTypeInPlatform as oauthRegistrationType };
export { feedbackSeverityInPlatform as feedbackSeverity };
export { feedbackStatusInPlatform as feedbackStatus };
export { feedbackTypeInPlatform as feedbackType };
export { contentReportsInPlatform as contentReports };
export { credentialRolesInPlatform as credentialRoles };
export { credentialsInPlatform as credentials };
export { docsBranchesInPlatform as docsBranches };
export { docsPagesInPlatform as docsPages };
export { docsReposInPlatform as docsRepos };
export { feedbackTopicsInPlatform as feedbackTopics };
export { leaderboardProfilesInPlatform as leaderboardProfiles };
export { moderatorRolesInPlatform as moderatorRoles };
export { oauthRegistrationsInPlatform as oauthRegistrations };
export { oauthTestAccountsInPlatform as oauthTestAccounts };
export { pointsInPlatform as points };
export { profileInPlatform as profile };
export { profileLinksInPlatform as profileLinks };
export { reportContentTypesInPlatform as reportContentTypes };
export { reportCorroborationsInPlatform as reportCorroborations };
export { reportReasonsInPlatform as reportReasons };
export { reportResolutionsInPlatform as reportResolutions };
export { rolesInPlatform as roles };
export { siteFeedbackInPlatform as siteFeedback };
export { userRolesInPlatform as userRoles };
export { userSuspensionsInPlatform as userSuspensions };
export { profileWithVerificationInPlatform as profileWithVerification };
export { resolvedUserPermissionsInPlatform as resolvedUserPermissions };
