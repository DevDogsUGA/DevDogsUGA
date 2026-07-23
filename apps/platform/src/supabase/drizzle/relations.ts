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