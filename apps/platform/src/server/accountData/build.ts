import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  academicPrograms,
  attendance,
  auditEvents,
  discordRoleMemberships,
  meetings,
  oauthRegistrations,
  oauthTestAccounts,
  profileAcademicPrograms,
  profileLinks,
  profiles,
  reflectionRevisions,
  reflections,
  reportCorroborations,
  reports,
  roles,
  supportConversations,
  supportMessages,
  surveyAnswerRevisions,
  surveyAnswers,
  userRoles,
  userSuspensions,
} from "~/server/db/schema";
import {
  identitiesInAuth,
  oauthClientsInAuth,
  usersInAuth,
} from "~/supabase/drizzle/schema";
import {
  EXPORT_VERSION,
  shapeAuditEvent,
  shapeFiledReport,
  shapeIdentity,
  shapeReflectionRevision,
} from "./shape";

/** What the file says about itself, in the member's own words. */
const NOTES = [
  "This file holds the rows the DevDogs platform keeps about you.",
  "DogDays and DogPack are separate apps with their own databases, and they hold their own data about you. Ask them for it separately.",
  "Copies of your attendance in Bevy, Engage and UGA's systems are theirs, and are not in this file.",
  "Linked accounts show only what the provider told us about the account. We never put sign-in tokens or secrets in this file.",
  "Reports you filed keep your description and the reason you gave. They leave out the person you reported and what they wrote.",
  "Audit events show actions you took. Where the action concerned another member, their id and the details are left out.",
  "The permissions you granted to OAuth apps are not in this file; they hold only sign-in grants, and you can review them in Settings.",
  "Posts and files you made on Discord or GitHub are not stored here.",
];

/** The four tables the schedule builder keeps per member; they carry no foreign key. */
const SCHEDULE_BUILDER_TABLES = [
  "userPreferences",
  "userPlanDrafts",
  "userPlanDraftCourses",
  "userSavedPlans",
] as const;

/**
 * Everything the platform holds about one member, as a JSON-ready object
 * (account-deletion Q6). Read from the database with the service connection,
 * so every query here names the member's id: nothing relies on row-level
 * security to keep another member's rows out.
 *
 * Not a server action and not exposed on its own: the only caller is the route
 * that answers the signed-in member (`/account/data`).
 */
export async function buildMemberDataExport(userId: string) {
  const [account] = await db
    .select({
      id: usersInAuth.id,
      email: usersInAuth.email,
      createdAt: usersInAuth.createdAt,
      lastSignInAt: usersInAuth.lastSignInAt,
    })
    .from(usersInAuth)
    .where(eq(usersInAuth.id, userId))
    .limit(1);

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const [
    links,
    programs,
    identities,
    memberRoles,
    discordRoles,
    suspensions,
    attendanceRows,
    reflectionRows,
    reflectionRevisionRows,
    surveyAnswerRows,
    surveyRevisionRows,
    conversations,
    messages,
    apps,
    testAccounts,
    filedReports,
    corroborations,
    auditRows,
  ] = await Promise.all([
    db
      .select({
        title: profileLinks.title,
        url: profileLinks.url,
        sortOrder: profileLinks.sortOrder,
      })
      .from(profileLinks)
      .where(eq(profileLinks.userId, userId))
      .orderBy(asc(profileLinks.sortOrder)),
    db
      .select({
        program: academicPrograms.name,
        credential: academicPrograms.credential,
        sortOrder: profileAcademicPrograms.sortOrder,
      })
      .from(profileAcademicPrograms)
      .innerJoin(
        academicPrograms,
        eq(academicPrograms.id, profileAcademicPrograms.programId),
      )
      .where(eq(profileAcademicPrograms.userId, userId))
      .orderBy(asc(profileAcademicPrograms.sortOrder)),
    db
      .select({
        provider: identitiesInAuth.provider,
        createdAt: identitiesInAuth.createdAt,
        lastSignInAt: identitiesInAuth.lastSignInAt,
        identityData: identitiesInAuth.identityData,
      })
      .from(identitiesInAuth)
      .where(eq(identitiesInAuth.userId, userId)),
    db
      .select({ role: roles.title, type: roles.roleType })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId)),
    db
      .select({
        role: roles.title,
        syncedAt: discordRoleMemberships.syncedAt,
      })
      .from(discordRoleMemberships)
      .innerJoin(roles, eq(roles.id, discordRoleMemberships.roleId))
      .where(eq(discordRoleMemberships.userId, userId)),
    // Who suspended them is another person's id, so it is not selected.
    db
      .select({
        service: userSuspensions.service,
        reason: userSuspensions.reason,
        suspendedAt: userSuspensions.suspendedAt,
      })
      .from(userSuspensions)
      .where(eq(userSuspensions.userId, userId)),
    db
      .select({
        meetingId: attendance.meetingId,
        meeting: meetings.slug,
        meetingStartsAt: meetings.startsAt,
        method: attendance.method,
        recordedAt: attendance.recordedAt,
      })
      .from(attendance)
      .innerJoin(meetings, eq(meetings.id, attendance.meetingId))
      .where(eq(attendance.userId, userId))
      .orderBy(desc(attendance.recordedAt)),
    db
      .select()
      .from(reflections)
      .where(eq(reflections.userId, userId))
      .orderBy(desc(reflections.createdAt)),
    db
      .select()
      .from(reflectionRevisions)
      .where(eq(reflectionRevisions.userId, userId))
      .orderBy(desc(reflectionRevisions.createdAt)),
    db
      .select()
      .from(surveyAnswers)
      .where(eq(surveyAnswers.userId, userId))
      .orderBy(desc(surveyAnswers.createdAt)),
    db
      .select()
      .from(surveyAnswerRevisions)
      .where(eq(surveyAnswerRevisions.userId, userId))
      .orderBy(desc(surveyAnswerRevisions.recordedAt)),
    db
      .select({
        threadId: supportConversations.threadId,
        role: supportConversations.role,
        createdAt: supportConversations.createdAt,
        followedInDiscordAt: supportConversations.followedInDiscordAt,
      })
      .from(supportConversations)
      .where(eq(supportConversations.userId, userId)),
    db
      .select({
        messageId: supportMessages.messageId,
        threadId: supportMessages.threadId,
        createdAt: supportMessages.createdAt,
      })
      .from(supportMessages)
      .where(eq(supportMessages.userId, userId)),
    // The client's name and addresses, never `client_secret_hash`.
    db
      .select({
        clientId: oauthRegistrations.clientId,
        label: oauthRegistrations.label,
        type: oauthRegistrations.type,
        tier: oauthRegistrations.tier,
        name: oauthClientsInAuth.clientName,
        uri: oauthClientsInAuth.clientUri,
        redirectUris: oauthClientsInAuth.redirectUris,
        createdAt: oauthClientsInAuth.createdAt,
      })
      .from(oauthRegistrations)
      .innerJoin(
        oauthClientsInAuth,
        eq(oauthClientsInAuth.id, oauthRegistrations.clientId),
      )
      .where(eq(oauthRegistrations.userId, userId)),
    db
      .select({
        testUserId: oauthTestAccounts.testUserId,
        createdAt: oauthTestAccounts.createdAt,
      })
      .from(oauthTestAccounts)
      .where(eq(oauthTestAccounts.ownerUserId, userId)),
    db
      .select({
        id: reports.id,
        appId: reports.appId,
        contentType: reports.contentType,
        reason: reports.reason,
        description: reports.description,
        status: reports.status,
        createdAt: reports.createdAt,
        resolvedAt: reports.resolvedAt,
      })
      .from(reports)
      .where(eq(reports.reporterUserId, userId))
      .orderBy(desc(reports.createdAt)),
    db
      .select({
        reportId: reportCorroborations.reportId,
        reason: reportCorroborations.reason,
        description: reportCorroborations.description,
        createdAt: reportCorroborations.createdAt,
      })
      .from(reportCorroborations)
      .where(eq(reportCorroborations.reporterUserId, userId)),
    db
      .select({
        id: auditEvents.id,
        createdAt: auditEvents.createdAt,
        action: auditEvents.action,
        targetType: auditEvents.targetType,
        targetId: auditEvents.targetId,
        metadata: auditEvents.metadata,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorUserId, userId),
          // Reading this file is logged too; it is not part of the file.
          sql`${auditEvents.action} <> 'user.data_exported'`,
        ),
      )
      .orderBy(desc(auditEvents.createdAt)),
  ]);

  const scheduleBuilder: Record<string, unknown[]> = {};
  for (const table of SCHEDULE_BUILDER_TABLES) {
    scheduleBuilder[table] = [
      ...(await db.execute<Record<string, unknown>>(
        sql`select to_jsonb(t) as row from "schedule_builder".${sql.identifier(table)} t
            where t."userId" = ${userId}::uuid`,
      )),
    ].map((r) => r.row);
  }

  const teamMembershipRequests = [
    ...(await db.execute<Record<string, unknown>>(
      sql`select "id", "teamId", "direction", "status",
                 case when "createdBy" = ${userId}::uuid then "message" end as "message",
                 "createdAt", "respondedAt"
          from "platform"."teamMembershipRequests"
          where "userId" = ${userId}::uuid order by "createdAt"`,
    )),
  ];
  // Reports filed from OAuth apps: the author, the reference and the snapshot describe someone else.
  const sandboxReportsFiled = [
    ...(await db.execute<Record<string, unknown>>(
      sql`select "id", "clientId", "contentType", "reason", "description", "createdAt"
          from "platform"."sandboxReports"
          where "reporterUserId" = ${userId}::uuid order by "createdAt"`,
    )),
  ];

  const teamMemberships = [
    ...(await db.execute<Record<string, unknown>>(
      sql`select "teamId", "role", "joinedAt", "leftAt" from "platform"."teamMembers"
          where "userId" = ${userId}::uuid order by "joinedAt"`,
    )),
  ];

  return {
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    notes: NOTES,
    account,
    profile: profile
      ? // `quarantinedBy` is a moderator's resolution, not the member's data.
        { ...profile, quarantinedBy: undefined }
      : null,
    profileLinks: links,
    academicPrograms: programs,
    linkedAccounts: identities.map(shapeIdentity),
    roles: memberRoles,
    discordRoleMemberships: discordRoles,
    suspensions,
    teamMemberships,
    teamMembershipRequests,
    attendance: attendanceRows,
    reflections: reflectionRows,
    reflectionRevisions: reflectionRevisionRows.map((r) =>
      shapeReflectionRevision(r, userId),
    ),
    surveyAnswers: surveyAnswerRows,
    surveyAnswerRevisions: surveyRevisionRows,
    supportConversations: conversations,
    supportMessages: messages,
    oauthApps: apps,
    oauthTestAccounts: testAccounts,
    scheduleBuilder,
    reportsFiled: filedReports.map(shapeFiledReport),
    sandboxReportsFiled,
    reportCorroborations: corroborations,
    auditEvents: auditRows.map((r) => shapeAuditEvent(r, userId)),
  };
}

export type MemberDataExport = Awaited<
  ReturnType<typeof buildMemberDataExport>
>;
