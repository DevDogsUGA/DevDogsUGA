import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
	identitiesInAuth: {
		usersInAuth: r.one.usersInAuth({
			from: r.identitiesInAuth.userId,
			to: r.usersInAuth.id
		}),
	},
	usersInAuth: {
		identitiesInAuths: r.many.identitiesInAuth(),
		mfaFactorsInAuths: r.many.mfaFactorsInAuth(),
		oauthClientsInAuthsViaOauthAuthorizationsInAuth: r.many.oauthClientsInAuth({
			alias: "oauthClientsInAuth_id_usersInAuth_id_via_oauthAuthorizationsInAuth"
		}),
		oauthClientsInAuthsViaOauthConsentsInAuth: r.many.oauthClientsInAuth({
			alias: "oauthClientsInAuth_id_usersInAuth_id_via_oauthConsentsInAuth"
		}),
		oneTimeTokensInAuths: r.many.oneTimeTokensInAuth(),
		oauthClientsInAuthsViaSessionsInAuth: r.many.oauthClientsInAuth({
			alias: "oauthClientsInAuth_id_usersInAuth_id_via_sessionsInAuth"
		}),
		webauthnChallengesInAuths: r.many.webauthnChallengesInAuth(),
		webauthnCredentialsInAuths: r.many.webauthnCredentialsInAuth(),
		meetingsInPlatforms: r.many.meetingsInPlatform(),
		credentialsInPlatforms: r.many.credentialsInPlatform(),
		exportAuditInPlatforms: r.many.exportAuditInPlatform(),
		oauthClientsInAuthsViaOauthConnectCodesInPlatform: r.many.oauthClientsInAuth({
			alias: "oauthClientsInAuth_id_usersInAuth_id_via_oauthConnectCodesInPlatform"
		}),
		oauthClientsInAuthsViaOauthDeviceCodesInPlatform: r.many.oauthClientsInAuth({
			alias: "oauthClientsInAuth_id_usersInAuth_id_via_oauthDeviceCodesInPlatform"
		}),
		oauthClientsInAuthsViaOauthRegistrationsInPlatform: r.many.oauthClientsInAuth({
			alias: "oauthClientsInAuth_id_usersInAuth_id_via_oauthRegistrationsInPlatform"
		}),
		reportResolutionsInPlatforms: r.many.reportResolutionsInPlatform(),
		reflectionsInPlatforms: r.many.reflectionsInPlatform(),
		reportsInPlatformsViaReportCorroborationsInPlatform: r.many.reportsInPlatform({
			from: r.usersInAuth.id.through(r.reportCorroborationsInPlatform.reporterUserId),
			to: r.reportsInPlatform.id.through(r.reportCorroborationsInPlatform.reportId),
			alias: "usersInAuth_id_reportsInPlatform_id_via_reportCorroborationsInPlatform"
		}),
		reportsInPlatformsViaReportResolutionsInPlatform: r.many.reportsInPlatform({
			from: r.usersInAuth.id.through(r.reportResolutionsInPlatform.moderatorUserId),
			to: r.reportsInPlatform.id.through(r.reportResolutionsInPlatform.reportId),
			alias: "usersInAuth_id_reportsInPlatform_id_via_reportResolutionsInPlatform"
		}),
		reportsInPlatformsReportedUserId: r.many.reportsInPlatform({
			alias: "reportsInPlatform_reportedUserId_usersInAuth_id"
		}),
		reportsInPlatformsReporterUserId: r.many.reportsInPlatform({
			alias: "reportsInPlatform_reporterUserId_usersInAuth_id"
		}),
		teamsInPlatformsViaTeamMembersInPlatform: r.many.teamsInPlatform({
			alias: "teamsInPlatform_id_usersInAuth_id_via_teamMembersInPlatform"
		}),
		teamsInPlatformsViaTeamMembershipRequestsInPlatform: r.many.teamsInPlatform({
			alias: "teamsInPlatform_id_usersInAuth_id_via_teamMembershipRequestsInPlatform"
		}),
		rolesInPlatforms: r.many.rolesInPlatform(),
	},
	mfaAmrClaimsInAuth: {
		sessionsInAuth: r.one.sessionsInAuth({
			from: r.mfaAmrClaimsInAuth.sessionId,
			to: r.sessionsInAuth.id
		}),
	},
	sessionsInAuth: {
		mfaAmrClaimsInAuths: r.many.mfaAmrClaimsInAuth(),
		refreshTokensInAuths: r.many.refreshTokensInAuth(),
	},
	mfaChallengesInAuth: {
		mfaFactorsInAuth: r.one.mfaFactorsInAuth({
			from: r.mfaChallengesInAuth.factorId,
			to: r.mfaFactorsInAuth.id
		}),
	},
	mfaFactorsInAuth: {
		mfaChallengesInAuths: r.many.mfaChallengesInAuth(),
		usersInAuth: r.one.usersInAuth({
			from: r.mfaFactorsInAuth.userId,
			to: r.usersInAuth.id
		}),
	},
	oauthClientsInAuth: {
		usersInAuthsViaOauthAuthorizationsInAuth: r.many.usersInAuth({
			from: r.oauthClientsInAuth.id.through(r.oauthAuthorizationsInAuth.clientId),
			to: r.usersInAuth.id.through(r.oauthAuthorizationsInAuth.userId),
			alias: "oauthClientsInAuth_id_usersInAuth_id_via_oauthAuthorizationsInAuth"
		}),
		usersInAuthsViaOauthConsentsInAuth: r.many.usersInAuth({
			from: r.oauthClientsInAuth.id.through(r.oauthConsentsInAuth.clientId),
			to: r.usersInAuth.id.through(r.oauthConsentsInAuth.userId),
			alias: "oauthClientsInAuth_id_usersInAuth_id_via_oauthConsentsInAuth"
		}),
		usersInAuthsViaSessionsInAuth: r.many.usersInAuth({
			from: r.oauthClientsInAuth.id.through(r.sessionsInAuth.oauthClientId),
			to: r.usersInAuth.id.through(r.sessionsInAuth.userId),
			alias: "oauthClientsInAuth_id_usersInAuth_id_via_sessionsInAuth"
		}),
		usersInAuthsViaOauthConnectCodesInPlatform: r.many.usersInAuth({
			from: r.oauthClientsInAuth.id.through(r.oauthConnectCodesInPlatform.clientId),
			to: r.usersInAuth.id.through(r.oauthConnectCodesInPlatform.userId),
			alias: "oauthClientsInAuth_id_usersInAuth_id_via_oauthConnectCodesInPlatform"
		}),
		usersInAuthsViaOauthDeviceCodesInPlatform: r.many.usersInAuth({
			from: r.oauthClientsInAuth.id.through(r.oauthDeviceCodesInPlatform.clientId),
			to: r.usersInAuth.id.through(r.oauthDeviceCodesInPlatform.userId),
			alias: "oauthClientsInAuth_id_usersInAuth_id_via_oauthDeviceCodesInPlatform"
		}),
		usersInAuthsViaOauthRegistrationsInPlatform: r.many.usersInAuth({
			from: r.oauthClientsInAuth.id.through(r.oauthRegistrationsInPlatform.clientId),
			to: r.usersInAuth.id.through(r.oauthRegistrationsInPlatform.userId),
			alias: "oauthClientsInAuth_id_usersInAuth_id_via_oauthRegistrationsInPlatform"
		}),
	},
	oneTimeTokensInAuth: {
		usersInAuth: r.one.usersInAuth({
			from: r.oneTimeTokensInAuth.userId,
			to: r.usersInAuth.id
		}),
	},
	refreshTokensInAuth: {
		sessionsInAuth: r.one.sessionsInAuth({
			from: r.refreshTokensInAuth.sessionId,
			to: r.sessionsInAuth.id
		}),
	},
	samlProvidersInAuth: {
		ssoProvidersInAuth: r.one.ssoProvidersInAuth({
			from: r.samlProvidersInAuth.ssoProviderId,
			to: r.ssoProvidersInAuth.id
		}),
	},
	ssoProvidersInAuth: {
		samlProvidersInAuths: r.many.samlProvidersInAuth(),
		flowStateInAuths: r.many.flowStateInAuth(),
		ssoDomainsInAuths: r.many.ssoDomainsInAuth(),
	},
	flowStateInAuth: {
		ssoProvidersInAuths: r.many.ssoProvidersInAuth({
			from: r.flowStateInAuth.id.through(r.samlRelayStatesInAuth.flowStateId),
			to: r.ssoProvidersInAuth.id.through(r.samlRelayStatesInAuth.ssoProviderId)
		}),
	},
	ssoDomainsInAuth: {
		ssoProvidersInAuth: r.one.ssoProvidersInAuth({
			from: r.ssoDomainsInAuth.ssoProviderId,
			to: r.ssoProvidersInAuth.id
		}),
	},
	webauthnChallengesInAuth: {
		usersInAuth: r.one.usersInAuth({
			from: r.webauthnChallengesInAuth.userId,
			to: r.usersInAuth.id
		}),
	},
	webauthnCredentialsInAuth: {
		usersInAuth: r.one.usersInAuth({
			from: r.webauthnCredentialsInAuth.userId,
			to: r.usersInAuth.id
		}),
	},
	meetingsInPlatform: {
		usersInAuths: r.many.usersInAuth({
			from: r.meetingsInPlatform.id.through(r.attendanceInPlatform.meetingId),
			to: r.usersInAuth.id.through(r.attendanceInPlatform.userId)
		}),
		seasonsInPlatform: r.one.seasonsInPlatform({
			from: r.meetingsInPlatform.seasonId,
			to: r.seasonsInPlatform.id
		}),
		reflectionsInPlatforms: r.many.reflectionsInPlatform(),
		workshopsInPlatforms: r.many.workshopsInPlatform(),
	},
	competitionsInPlatform: {
		teamsInPlatforms: r.many.teamsInPlatform({
			from: r.competitionsInPlatform.id.through(r.competitionEntriesInPlatform.competitionId),
			to: r.teamsInPlatform.id.through(r.competitionEntriesInPlatform.teamId)
		}),
		reflectionsInPlatforms: r.many.reflectionsInPlatform(),
	},
	teamsInPlatform: {
		competitionsInPlatforms: r.many.competitionsInPlatform(),
		usersInAuthsViaTeamMembersInPlatform: r.many.usersInAuth({
			from: r.teamsInPlatform.id.through(r.teamMembersInPlatform.teamId),
			to: r.usersInAuth.id.through(r.teamMembersInPlatform.userId),
			alias: "teamsInPlatform_id_usersInAuth_id_via_teamMembersInPlatform"
		}),
		usersInAuthsViaTeamMembershipRequestsInPlatform: r.many.usersInAuth({
			from: r.teamsInPlatform.id.through(r.teamMembershipRequestsInPlatform.teamId),
			to: r.usersInAuth.id.through(r.teamMembershipRequestsInPlatform.userId),
			alias: "teamsInPlatform_id_usersInAuth_id_via_teamMembershipRequestsInPlatform"
		}),
	},
	contentTypesInPlatform: {
		appsInPlatform: r.one.appsInPlatform({
			from: r.contentTypesInPlatform.appId,
			to: r.appsInPlatform.id
		}),
	},
	appsInPlatform: {
		contentTypesInPlatforms: r.many.contentTypesInPlatform(),
		reportsInPlatforms: r.many.reportsInPlatform(),
	},
	credentialsInPlatform: {
		rolesInPlatforms: r.many.rolesInPlatform({
			from: r.credentialsInPlatform.id.through(r.credentialRolesInPlatform.credentialId),
			to: r.rolesInPlatform.id.through(r.credentialRolesInPlatform.roleId)
		}),
		usersInAuth: r.one.usersInAuth({
			from: r.credentialsInPlatform.createdBy,
			to: r.usersInAuth.id
		}),
	},
	rolesInPlatform: {
		credentialsInPlatforms: r.many.credentialsInPlatform(),
		usersInAuths: r.many.usersInAuth({
			from: r.rolesInPlatform.id.through(r.userRolesInPlatform.roleId),
			to: r.usersInAuth.id.through(r.userRolesInPlatform.userId)
		}),
	},
	exportAuditInPlatform: {
		usersInAuth: r.one.usersInAuth({
			from: r.exportAuditInPlatform.userId,
			to: r.usersInAuth.id
		}),
	},
	seasonsInPlatform: {
		meetingsInPlatforms: r.many.meetingsInPlatform(),
	},
	pointsInPlatform: {
		leaderboardProfilesInPlatform: r.one.leaderboardProfilesInPlatform({
			from: r.pointsInPlatform.leaderboardProfileId,
			to: r.leaderboardProfilesInPlatform.githubId
		}),
	},
	leaderboardProfilesInPlatform: {
		pointsInPlatforms: r.many.pointsInPlatform(),
	},
	reportResolutionsInPlatform: {
		usersInAuths: r.many.usersInAuth({
			from: r.reportResolutionsInPlatform.id.through(r.profileInPlatform.quarantinedBy),
			to: r.usersInAuth.id.through(r.profileInPlatform.userId)
		}),
	},
	academicProgramsInPlatform: {
		profileInPlatforms: r.many.profileInPlatform({
			from: r.academicProgramsInPlatform.id.through(r.profileAcademicProgramsInPlatform.programId),
			to: r.profileInPlatform.userId.through(r.profileAcademicProgramsInPlatform.userId)
		}),
	},
	profileInPlatform: {
		academicProgramsInPlatforms: r.many.academicProgramsInPlatform(),
		profileLinksInPlatforms: r.many.profileLinksInPlatform(),
	},
	profileLinksInPlatform: {
		profileInPlatform: r.one.profileInPlatform({
			from: r.profileLinksInPlatform.userId,
			to: r.profileInPlatform.userId
		}),
	},
	reflectionRevisionsInPlatform: {
		reflectionsInPlatform: r.one.reflectionsInPlatform({
			from: r.reflectionRevisionsInPlatform.reflectionId,
			to: r.reflectionsInPlatform.id
		}),
	},
	reflectionsInPlatform: {
		reflectionRevisionsInPlatforms: r.many.reflectionRevisionsInPlatform(),
		competitionsInPlatform: r.one.competitionsInPlatform({
			from: r.reflectionsInPlatform.competitionId,
			to: r.competitionsInPlatform.id
		}),
		meetingsInPlatform: r.one.meetingsInPlatform({
			from: r.reflectionsInPlatform.meetingId,
			to: r.meetingsInPlatform.id
		}),
		usersInAuth: r.one.usersInAuth({
			from: r.reflectionsInPlatform.userId,
			to: r.usersInAuth.id
		}),
	},
	reportsInPlatform: {
		usersInAuthsViaReportCorroborationsInPlatform: r.many.usersInAuth({
			alias: "usersInAuth_id_reportsInPlatform_id_via_reportCorroborationsInPlatform"
		}),
		usersInAuthsViaReportResolutionsInPlatform: r.many.usersInAuth({
			alias: "usersInAuth_id_reportsInPlatform_id_via_reportResolutionsInPlatform"
		}),
		appsInPlatform: r.one.appsInPlatform({
			from: r.reportsInPlatform.appId,
			to: r.appsInPlatform.id
		}),
		usersInAuthReportedUserId: r.one.usersInAuth({
			from: r.reportsInPlatform.reportedUserId,
			to: r.usersInAuth.id,
			alias: "reportsInPlatform_reportedUserId_usersInAuth_id"
		}),
		usersInAuthReporterUserId: r.one.usersInAuth({
			from: r.reportsInPlatform.reporterUserId,
			to: r.usersInAuth.id,
			alias: "reportsInPlatform_reporterUserId_usersInAuth_id"
		}),
	},
	workshopsInPlatform: {
		meetingsInPlatform: r.one.meetingsInPlatform({
			from: r.workshopsInPlatform.meetingId,
			to: r.meetingsInPlatform.id
		}),
	},
	icebergNamespacesInStorage: {
		bucketsAnalyticsInStorage: r.one.bucketsAnalyticsInStorage({
			from: r.icebergNamespacesInStorage.catalogId,
			to: r.bucketsAnalyticsInStorage.id,
			alias: "icebergNamespacesInStorage_catalogId_bucketsAnalyticsInStorage_id"
		}),
		bucketsAnalyticsInStorages: r.many.bucketsAnalyticsInStorage({
			alias: "bucketsAnalyticsInStorage_id_icebergNamespacesInStorage_id_via_icebergTablesInStorage"
		}),
	},
	bucketsAnalyticsInStorage: {
		icebergNamespacesInStoragesCatalogId: r.many.icebergNamespacesInStorage({
			alias: "icebergNamespacesInStorage_catalogId_bucketsAnalyticsInStorage_id"
		}),
		icebergNamespacesInStoragesViaIcebergTablesInStorage: r.many.icebergNamespacesInStorage({
			from: r.bucketsAnalyticsInStorage.id.through(r.icebergTablesInStorage.catalogId),
			to: r.icebergNamespacesInStorage.id.through(r.icebergTablesInStorage.namespaceId),
			alias: "bucketsAnalyticsInStorage_id_icebergNamespacesInStorage_id_via_icebergTablesInStorage"
		}),
	},
	objectsInStorage: {
		bucketsInStorage: r.one.bucketsInStorage({
			from: r.objectsInStorage.bucketId,
			to: r.bucketsInStorage.id
		}),
	},
	bucketsInStorage: {
		objectsInStorages: r.many.objectsInStorage(),
		s3MultipartUploadsInStoragesBucketId: r.many.s3MultipartUploadsInStorage({
			alias: "s3MultipartUploadsInStorage_bucketId_bucketsInStorage_id"
		}),
		s3MultipartUploadsInStoragesViaS3MultipartUploadsPartsInStorage: r.many.s3MultipartUploadsInStorage({
			from: r.bucketsInStorage.id.through(r.s3MultipartUploadsPartsInStorage.bucketId),
			to: r.s3MultipartUploadsInStorage.id.through(r.s3MultipartUploadsPartsInStorage.uploadId),
			alias: "bucketsInStorage_id_s3MultipartUploadsInStorage_id_via_s3MultipartUploadsPartsInStorage"
		}),
	},
	s3MultipartUploadsInStorage: {
		bucketsInStorage: r.one.bucketsInStorage({
			from: r.s3MultipartUploadsInStorage.bucketId,
			to: r.bucketsInStorage.id,
			alias: "s3MultipartUploadsInStorage_bucketId_bucketsInStorage_id"
		}),
		bucketsInStorages: r.many.bucketsInStorage({
			alias: "bucketsInStorage_id_s3MultipartUploadsInStorage_id_via_s3MultipartUploadsPartsInStorage"
		}),
	},
	vectorIndexesInStorage: {
		bucketsVectorsInStorage: r.one.bucketsVectorsInStorage({
			from: r.vectorIndexesInStorage.bucketId,
			to: r.bucketsVectorsInStorage.id
		}),
	},
	bucketsVectorsInStorage: {
		vectorIndexesInStorages: r.many.vectorIndexesInStorage(),
	},
}))