import { pgSchema, pgTable, uuid, varchar, text, bigserial, integer, pgEnum, boolean, timestamp, bigint, customType, jsonb, smallint, date, json, doublePrecision, inet, index, uniqueIndex, foreignKey, primaryKey, unique, check, pgPolicy, numeric } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const auth = pgSchema("auth");
export const extensions = pgSchema("extensions");
export const graphql = pgSchema("graphql");
export const graphqlPublic = pgSchema("graphql_public");
export const pgbouncer = pgSchema("pgbouncer");
export const platform = pgSchema("platform");
export const realtime = pgSchema("realtime");
export const storage = pgSchema("storage");
export const studyGroupFinder = pgSchema("study_group_finder");
export const supabaseFunctions = pgSchema("supabase_functions");
export const supabaseMigrations = pgSchema("supabase_migrations");
export const vault = pgSchema("vault");
export const buckettypeInStorage = storage.enum("buckettype", ["STANDARD", "ANALYTICS", "VECTOR"])
export const factorTypeInAuth = auth.enum("factor_type", ["totp", "webauthn", "phone"])
export const factorStatusInAuth = auth.enum("factor_status", ["unverified", "verified"])
export const aalLevelInAuth = auth.enum("aal_level", ["aal1", "aal2", "aal3"])
export const codeChallengeMethodInAuth = auth.enum("code_challenge_method", ["s256", "plain"])
export const oneTimeTokenTypeInAuth = auth.enum("one_time_token_type", ["confirmation_token", "reauthentication_token", "recovery_token", "email_change_token_new", "email_change_token_current", "phone_change_token"])
export const oauthRegistrationTypeInAuth = auth.enum("oauth_registration_type", ["dynamic", "manual"])
export const oauthAuthorizationStatusInAuth = auth.enum("oauth_authorization_status", ["pending", "approved", "denied", "expired"])
export const oauthResponseTypeInAuth = auth.enum("oauth_response_type", ["code"])
export const oauthClientTypeInAuth = auth.enum("oauth_client_type", ["public", "confidential"])
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


export const auditLogEntriesInAuth = auth.table.withRLS("audit_log_entries", {
	instanceId: uuid("instance_id"),
	id: uuid().primaryKey(),
	payload: json(),
	createdAt: timestamp("created_at", { withTimezone: true }),
	ipAddress: varchar("ip_address", { length: 64 }).default("").notNull(),
}, (table) => [
	index("audit_logs_instance_id_idx").using("btree", table.instanceId.asc().nullsLast()),
]);

export const customOauthProvidersInAuth = auth.table("custom_oauth_providers", {
	id: uuid().defaultRandom().primaryKey(),
	providerType: text("provider_type").notNull(),
	identifier: text().notNull(),
	name: text().notNull(),
	clientId: text("client_id").notNull(),
	clientSecret: text("client_secret").notNull(),
	acceptableClientIds: text("acceptable_client_ids").array().default([]).notNull(),
	scopes: text().array().default([]).notNull(),
	pkceEnabled: boolean("pkce_enabled").default(true).notNull(),
	attributeMapping: jsonb("attribute_mapping").default({}).notNull(),
	authorizationParams: jsonb("authorization_params").default({}).notNull(),
	enabled: boolean().default(true).notNull(),
	emailOptional: boolean("email_optional").default(false).notNull(),
	issuer: text(),
	discoveryUrl: text("discovery_url"),
	skipNonceCheck: boolean("skip_nonce_check").default(false).notNull(),
	cachedDiscovery: jsonb("cached_discovery"),
	discoveryCachedAt: timestamp("discovery_cached_at", { withTimezone: true }),
	authorizationUrl: text("authorization_url"),
	tokenUrl: text("token_url"),
	userinfoUrl: text("userinfo_url"),
	jwksUri: text("jwks_uri"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	customClaimsAllowlist: text("custom_claims_allowlist").array().default([]).notNull(),
}, (table) => [
	index("custom_oauth_providers_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
	index("custom_oauth_providers_enabled_idx").using("btree", table.enabled.asc().nullsLast()),
	index("custom_oauth_providers_identifier_idx").using("btree", table.identifier.asc().nullsLast()),
	index("custom_oauth_providers_provider_type_idx").using("btree", table.providerType.asc().nullsLast()),
	unique("custom_oauth_providers_identifier_key").on(table.identifier),check("custom_oauth_providers_authorization_url_https", sql`((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))`),check("custom_oauth_providers_authorization_url_length", sql`((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))`),check("custom_oauth_providers_client_id_length", sql`((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))`),check("custom_oauth_providers_discovery_url_length", sql`((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))`),check("custom_oauth_providers_identifier_format", sql`(identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)`),check("custom_oauth_providers_issuer_length", sql`((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))`),check("custom_oauth_providers_jwks_uri_https", sql`((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))`),check("custom_oauth_providers_jwks_uri_length", sql`((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))`),check("custom_oauth_providers_name_length", sql`((char_length(name) >= 1) AND (char_length(name) <= 100))`),check("custom_oauth_providers_oauth2_requires_endpoints", sql`((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))`),check("custom_oauth_providers_oidc_discovery_url_https", sql`((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))`),check("custom_oauth_providers_oidc_issuer_https", sql`((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))`),check("custom_oauth_providers_oidc_requires_issuer", sql`((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))`),check("custom_oauth_providers_provider_type_check", sql`(provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))`),check("custom_oauth_providers_token_url_https", sql`((token_url IS NULL) OR (token_url ~~ 'https://%'::text))`),check("custom_oauth_providers_token_url_length", sql`((token_url IS NULL) OR (char_length(token_url) <= 2048))`),check("custom_oauth_providers_userinfo_url_https", sql`((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))`),check("custom_oauth_providers_userinfo_url_length", sql`((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048))`),]);

export const flowStateInAuth = auth.table.withRLS("flow_state", {
	id: uuid().primaryKey(),
	userId: uuid("user_id"),
	authCode: text("auth_code"),
	codeChallengeMethod: codeChallengeMethodInAuth("code_challenge_method"),
	codeChallenge: text("code_challenge"),
	providerType: text("provider_type").notNull(),
	providerAccessToken: text("provider_access_token"),
	providerRefreshToken: text("provider_refresh_token"),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
	authenticationMethod: text("authentication_method").notNull(),
	authCodeIssuedAt: timestamp("auth_code_issued_at", { withTimezone: true }),
	inviteToken: text("invite_token"),
	referrer: text(),
	oauthClientStateId: uuid("oauth_client_state_id"),
	linkingTargetId: uuid("linking_target_id"),
	emailOptional: boolean("email_optional").default(false).notNull(),
}, (table) => [
	index("flow_state_created_at_idx").using("btree", table.createdAt.desc().nullsFirst()),
	index("idx_auth_code").using("btree", table.authCode.asc().nullsLast()),
	index("idx_user_id_auth_method").using("btree", table.userId.asc().nullsLast(), table.authenticationMethod.asc().nullsLast()),
]);

export const identitiesInAuth = auth.table.withRLS("identities", {
	providerId: text("provider_id").notNull(),
	userId: uuid("user_id").notNull().references(() => usersInAuth.id, { onDelete: "cascade" } ),
	identityData: jsonb("identity_data").notNull(),
	provider: text().notNull(),
	lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
	email: text().generatedAlwaysAs(sql`lower((identity_data ->> 'email'::text))`),
	id: uuid().defaultRandom().primaryKey(),
}, (table) => [
	index("identities_email_idx").using("btree", table.email.asc().nullsLast().op("text_pattern_ops")),
	index("identities_user_id_idx").using("btree", table.userId.asc().nullsLast()),
	unique("identities_provider_id_provider_unique").on(table.providerId, table.provider),]);

export const instancesInAuth = auth.table.withRLS("instances", {
	id: uuid().primaryKey(),
	uuid: uuid(),
	rawBaseConfig: text("raw_base_config"),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const mfaAmrClaimsInAuth = auth.table.withRLS("mfa_amr_claims", {
	sessionId: uuid("session_id").notNull().references(() => sessionsInAuth.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	authenticationMethod: text("authentication_method").notNull(),
	id: uuid().primaryKey(),
}, (table) => [
	unique("mfa_amr_claims_session_id_authentication_method_pkey").on(table.sessionId, table.authenticationMethod),]);

export const mfaChallengesInAuth = auth.table.withRLS("mfa_challenges", {
	id: uuid().primaryKey(),
	factorId: uuid("factor_id").notNull().references(() => mfaFactorsInAuth.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	verifiedAt: timestamp("verified_at", { withTimezone: true }),
	ipAddress: inet("ip_address").notNull(),
	otpCode: text("otp_code"),
	webAuthnSessionData: jsonb("web_authn_session_data"),
}, (table) => [
	index("mfa_challenge_created_at_idx").using("btree", table.createdAt.desc().nullsFirst()),
]);

export const mfaFactorsInAuth = auth.table.withRLS("mfa_factors", {
	id: uuid().primaryKey(),
	userId: uuid("user_id").notNull().references(() => usersInAuth.id, { onDelete: "cascade" } ),
	friendlyName: text("friendly_name"),
	factorType: factorTypeInAuth("factor_type").notNull(),
	status: factorStatusInAuth().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	secret: text(),
	phone: text(),
	lastChallengedAt: timestamp("last_challenged_at", { withTimezone: true }),
	webAuthnCredential: jsonb("web_authn_credential"),
	webAuthnAaguid: uuid("web_authn_aaguid"),
	lastWebauthnChallengeData: jsonb("last_webauthn_challenge_data"),
}, (table) => [
	index("factor_id_created_at_idx").using("btree", table.userId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
	uniqueIndex("mfa_factors_user_friendly_name_unique").using("btree", table.friendlyName.asc().nullsLast(), table.userId.asc().nullsLast()).where(sql`(TRIM(BOTH FROM friendly_name) <> ''::text)`),
	index("mfa_factors_user_id_idx").using("btree", table.userId.asc().nullsLast()),
	uniqueIndex("unique_phone_factor_per_user").using("btree", table.userId.asc().nullsLast(), table.phone.asc().nullsLast()),
	unique("mfa_factors_last_challenged_at_key").on(table.lastChallengedAt),]);

export const oauthAuthorizationsInAuth = auth.table("oauth_authorizations", {
	id: uuid().primaryKey(),
	authorizationId: text("authorization_id").notNull(),
	clientId: uuid("client_id").notNull().references(() => oauthClientsInAuth.id, { onDelete: "cascade" } ),
	userId: uuid("user_id").references(() => usersInAuth.id, { onDelete: "cascade" } ),
	redirectUri: text("redirect_uri").notNull(),
	scope: text().notNull(),
	state: text(),
	resource: text(),
	codeChallenge: text("code_challenge"),
	codeChallengeMethod: codeChallengeMethodInAuth("code_challenge_method"),
	responseType: oauthResponseTypeInAuth("response_type").default("code").notNull(),
	status: oauthAuthorizationStatusInAuth().default("pending").notNull(),
	authorizationCode: text("authorization_code"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).default(sql`(now() + '00:03:00'::interval)`).notNull(),
	approvedAt: timestamp("approved_at", { withTimezone: true }),
	nonce: text(),
}, (table) => [
	index("oauth_auth_pending_exp_idx").using("btree", table.expiresAt.asc().nullsLast()).where(sql`(status = 'pending'::auth.oauth_authorization_status)`),
	unique("oauth_authorizations_authorization_code_key").on(table.authorizationCode),	unique("oauth_authorizations_authorization_id_key").on(table.authorizationId),check("oauth_authorizations_authorization_code_length", sql`(char_length(authorization_code) <= 255)`),check("oauth_authorizations_code_challenge_length", sql`(char_length(code_challenge) <= 128)`),check("oauth_authorizations_expires_at_future", sql`(expires_at > created_at)`),check("oauth_authorizations_nonce_length", sql`(char_length(nonce) <= 255)`),check("oauth_authorizations_redirect_uri_length", sql`(char_length(redirect_uri) <= 2048)`),check("oauth_authorizations_resource_length", sql`(char_length(resource) <= 2048)`),check("oauth_authorizations_scope_length", sql`(char_length(scope) <= 4096)`),check("oauth_authorizations_state_length", sql`(char_length(state) <= 4096)`),]);

export const oauthClientStatesInAuth = auth.table("oauth_client_states", {
	id: uuid().primaryKey(),
	providerType: text("provider_type").notNull(),
	codeVerifier: text("code_verifier"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
	index("idx_oauth_client_states_created_at").using("btree", table.createdAt.asc().nullsLast()),
]);

export const oauthClientsInAuth = auth.table("oauth_clients", {
	id: uuid().primaryKey(),
	clientSecretHash: text("client_secret_hash"),
	registrationType: oauthRegistrationTypeInAuth("registration_type").notNull(),
	redirectUris: text("redirect_uris").notNull(),
	grantTypes: text("grant_types").notNull(),
	clientName: text("client_name"),
	clientUri: text("client_uri"),
	logoUri: text("logo_uri"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true }),
	clientType: oauthClientTypeInAuth("client_type").default("confidential").notNull(),
	tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull(),
}, (table) => [
	index("oauth_clients_deleted_at_idx").using("btree", table.deletedAt.asc().nullsLast()),
check("oauth_clients_client_name_length", sql`(char_length(client_name) <= 1024)`),check("oauth_clients_client_uri_length", sql`(char_length(client_uri) <= 2048)`),check("oauth_clients_logo_uri_length", sql`(char_length(logo_uri) <= 2048)`),check("oauth_clients_token_endpoint_auth_method_check", sql`(token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text]))`),]);

export const oauthConsentsInAuth = auth.table("oauth_consents", {
	id: uuid().primaryKey(),
	userId: uuid("user_id").notNull().references(() => usersInAuth.id, { onDelete: "cascade" } ),
	clientId: uuid("client_id").notNull().references(() => oauthClientsInAuth.id, { onDelete: "cascade" } ),
	scopes: text().notNull(),
	grantedAt: timestamp("granted_at", { withTimezone: true }).default(sql`now()`).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
	index("oauth_consents_active_client_idx").using("btree", table.clientId.asc().nullsLast()).where(sql`(revoked_at IS NULL)`),
	index("oauth_consents_active_user_client_idx").using("btree", table.userId.asc().nullsLast(), table.clientId.asc().nullsLast()).where(sql`(revoked_at IS NULL)`),
	index("oauth_consents_user_order_idx").using("btree", table.userId.asc().nullsLast(), table.grantedAt.desc().nullsFirst()),
	unique("oauth_consents_user_client_unique").on(table.userId, table.clientId),check("oauth_consents_revoked_after_granted", sql`((revoked_at IS NULL) OR (revoked_at >= granted_at))`),check("oauth_consents_scopes_length", sql`(char_length(scopes) <= 2048)`),check("oauth_consents_scopes_not_empty", sql`(char_length(TRIM(BOTH FROM scopes)) > 0)`),]);

export const oneTimeTokensInAuth = auth.table.withRLS("one_time_tokens", {
	id: uuid().primaryKey(),
	userId: uuid("user_id").notNull().references(() => usersInAuth.id, { onDelete: "cascade" } ),
	tokenType: oneTimeTokenTypeInAuth("token_type").notNull(),
	tokenHash: text("token_hash").notNull(),
	relatesTo: text("relates_to").notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("one_time_tokens_relates_to_hash_idx").using("hash", table.relatesTo.asc().nullsLast()),
	index("one_time_tokens_token_hash_hash_idx").using("hash", table.tokenHash.asc().nullsLast()),
	uniqueIndex("one_time_tokens_user_id_token_type_key").using("btree", table.userId.asc().nullsLast(), table.tokenType.asc().nullsLast()),
check("one_time_tokens_token_hash_check", sql`(char_length(token_hash) > 0)`),]);

export const refreshTokensInAuth = auth.table.withRLS("refresh_tokens", {
	instanceId: uuid("instance_id"),
	id: bigserial({ mode: 'number' }).primaryKey(),
	token: varchar({ length: 255 }),
	userId: varchar("user_id", { length: 255 }),
	revoked: boolean(),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
	parent: varchar({ length: 255 }),
	sessionId: uuid("session_id").references(() => sessionsInAuth.id, { onDelete: "cascade" } ),
}, (table) => [
	index("refresh_tokens_instance_id_idx").using("btree", table.instanceId.asc().nullsLast()),
	index("refresh_tokens_instance_id_user_id_idx").using("btree", table.instanceId.asc().nullsLast(), table.userId.asc().nullsLast()),
	index("refresh_tokens_parent_idx").using("btree", table.parent.asc().nullsLast()),
	index("refresh_tokens_session_id_revoked_idx").using("btree", table.sessionId.asc().nullsLast(), table.revoked.asc().nullsLast()),
	index("refresh_tokens_updated_at_idx").using("btree", table.updatedAt.desc().nullsFirst()),
	unique("refresh_tokens_token_unique").on(table.token),]);

export const samlProvidersInAuth = auth.table.withRLS("saml_providers", {
	id: uuid().primaryKey(),
	ssoProviderId: uuid("sso_provider_id").notNull().references(() => ssoProvidersInAuth.id, { onDelete: "cascade" } ),
	entityId: text("entity_id").notNull(),
	metadataXml: text("metadata_xml").notNull(),
	metadataUrl: text("metadata_url"),
	attributeMapping: jsonb("attribute_mapping"),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
	nameIdFormat: text("name_id_format"),
}, (table) => [
	index("saml_providers_sso_provider_id_idx").using("btree", table.ssoProviderId.asc().nullsLast()),
	unique("saml_providers_entity_id_key").on(table.entityId),check("entity_id not empty", sql`(char_length(entity_id) > 0)`),check("metadata_url not empty", sql`((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))`),check("metadata_xml not empty", sql`(char_length(metadata_xml) > 0)`),]);

export const samlRelayStatesInAuth = auth.table.withRLS("saml_relay_states", {
	id: uuid().primaryKey(),
	ssoProviderId: uuid("sso_provider_id").notNull().references(() => ssoProvidersInAuth.id, { onDelete: "cascade" } ),
	requestId: text("request_id").notNull(),
	forEmail: text("for_email"),
	redirectTo: text("redirect_to"),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
	flowStateId: uuid("flow_state_id").references(() => flowStateInAuth.id, { onDelete: "cascade" } ),
}, (table) => [
	index("saml_relay_states_created_at_idx").using("btree", table.createdAt.desc().nullsFirst()),
	index("saml_relay_states_for_email_idx").using("btree", table.forEmail.asc().nullsLast()),
	index("saml_relay_states_sso_provider_id_idx").using("btree", table.ssoProviderId.asc().nullsLast()),
check("request_id not empty", sql`(char_length(request_id) > 0)`),]);

export const schemaMigrationsInAuth = auth.table.withRLS("schema_migrations", {
	version: varchar({ length: 255 }).primaryKey(),
});

export const sessionsInAuth = auth.table.withRLS("sessions", {
	id: uuid().primaryKey(),
	userId: uuid("user_id").notNull().references(() => usersInAuth.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
	factorId: uuid("factor_id"),
	aal: aalLevelInAuth(),
	notAfter: timestamp("not_after", { withTimezone: true }),
	refreshedAt: timestamp("refreshed_at"),
	userAgent: text("user_agent"),
	ip: inet(),
	tag: text(),
	oauthClientId: uuid("oauth_client_id").references(() => oauthClientsInAuth.id, { onDelete: "cascade" } ),
	refreshTokenHmacKey: text("refresh_token_hmac_key"),
	refreshTokenCounter: bigint("refresh_token_counter", { mode: 'number' }),
	scopes: text(),
}, (table) => [
	index("sessions_not_after_idx").using("btree", table.notAfter.desc().nullsFirst()),
	index("sessions_oauth_client_id_idx").using("btree", table.oauthClientId.asc().nullsLast()),
	index("sessions_user_id_idx").using("btree", table.userId.asc().nullsLast()),
	index("user_id_created_at_idx").using("btree", table.userId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
check("sessions_scopes_length", sql`(char_length(scopes) <= 4096)`),]);

export const ssoDomainsInAuth = auth.table.withRLS("sso_domains", {
	id: uuid().primaryKey(),
	ssoProviderId: uuid("sso_provider_id").notNull().references(() => ssoProvidersInAuth.id, { onDelete: "cascade" } ),
	domain: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
	uniqueIndex("sso_domains_domain_idx").using("btree", sql`lower(domain)`),
	index("sso_domains_sso_provider_id_idx").using("btree", table.ssoProviderId.asc().nullsLast()),
check("domain not empty", sql`(char_length(domain) > 0)`),]);

export const ssoProvidersInAuth = auth.table.withRLS("sso_providers", {
	id: uuid().primaryKey(),
	resourceId: text("resource_id"),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
	disabled: boolean(),
}, (table) => [
	uniqueIndex("sso_providers_resource_id_idx").using("btree", sql`lower(resource_id)`),
	index("sso_providers_resource_id_pattern_idx").using("btree", table.resourceId.asc().nullsLast().op("text_pattern_ops")),
check("resource_id not empty", sql`((resource_id = NULL::text) OR (char_length(resource_id) > 0))`),]);

export const usersInAuth = auth.table.withRLS("users", {
	instanceId: uuid("instance_id"),
	id: uuid().primaryKey(),
	aud: varchar({ length: 255 }),
	role: varchar({ length: 255 }),
	email: varchar({ length: 255 }),
	encryptedPassword: varchar("encrypted_password", { length: 255 }),
	emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true }),
	invitedAt: timestamp("invited_at", { withTimezone: true }),
	confirmationToken: varchar("confirmation_token", { length: 255 }),
	confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
	recoveryToken: varchar("recovery_token", { length: 255 }),
	recoverySentAt: timestamp("recovery_sent_at", { withTimezone: true }),
	emailChangeTokenNew: varchar("email_change_token_new", { length: 255 }),
	emailChange: varchar("email_change", { length: 255 }),
	emailChangeSentAt: timestamp("email_change_sent_at", { withTimezone: true }),
	lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
	rawAppMetaData: jsonb("raw_app_meta_data"),
	rawUserMetaData: jsonb("raw_user_meta_data"),
	isSuperAdmin: boolean("is_super_admin"),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
	phone: text().default(sql`NULL`),
	phoneConfirmedAt: timestamp("phone_confirmed_at", { withTimezone: true }),
	phoneChange: text("phone_change").default(""),
	phoneChangeToken: varchar("phone_change_token", { length: 255 }).default(""),
	phoneChangeSentAt: timestamp("phone_change_sent_at", { withTimezone: true }),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true }).generatedAlwaysAs(sql`LEAST(email_confirmed_at, phone_confirmed_at)`),
	emailChangeTokenCurrent: varchar("email_change_token_current", { length: 255 }).default(""),
	emailChangeConfirmStatus: smallint("email_change_confirm_status").default(0),
	bannedUntil: timestamp("banned_until", { withTimezone: true }),
	reauthenticationToken: varchar("reauthentication_token", { length: 255 }).default(""),
	reauthenticationSentAt: timestamp("reauthentication_sent_at", { withTimezone: true }),
	isSsoUser: boolean("is_sso_user").default(false).notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true }),
	isAnonymous: boolean("is_anonymous").default(false).notNull(),
}, (table) => [
	uniqueIndex("confirmation_token_idx").using("btree", table.confirmationToken.asc().nullsLast()).where(sql`((confirmation_token)::text !~ '^[0-9 ]*$'::text)`),
	uniqueIndex("email_change_token_current_idx").using("btree", table.emailChangeTokenCurrent.asc().nullsLast()).where(sql`((email_change_token_current)::text !~ '^[0-9 ]*$'::text)`),
	uniqueIndex("email_change_token_new_idx").using("btree", table.emailChangeTokenNew.asc().nullsLast()).where(sql`((email_change_token_new)::text !~ '^[0-9 ]*$'::text)`),
	uniqueIndex("reauthentication_token_idx").using("btree", table.reauthenticationToken.asc().nullsLast()).where(sql`((reauthentication_token)::text !~ '^[0-9 ]*$'::text)`),
	uniqueIndex("recovery_token_idx").using("btree", table.recoveryToken.asc().nullsLast()).where(sql`((recovery_token)::text !~ '^[0-9 ]*$'::text)`),
	uniqueIndex("users_email_partial_key").using("btree", table.email.asc().nullsLast()).where(sql`(is_sso_user = false)`),
	index("users_instance_id_email_idx").using("btree", table.instanceId.asc().nullsLast(), sql`lower((email)::text)`),
	index("users_instance_id_idx").using("btree", table.instanceId.asc().nullsLast()),
	index("users_is_anonymous_idx").using("btree", table.isAnonymous.asc().nullsLast()),
	unique("users_phone_key").on(table.phone),check("users_email_change_confirm_status_check", sql`((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2))`),]);

export const webauthnChallengesInAuth = auth.table("webauthn_challenges", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid("user_id").references(() => usersInAuth.id, { onDelete: "cascade" } ),
	challengeType: text("challenge_type").notNull(),
	sessionData: jsonb("session_data").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
	index("webauthn_challenges_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
	index("webauthn_challenges_user_id_idx").using("btree", table.userId.asc().nullsLast()),
check("webauthn_challenges_challenge_type_check", sql`(challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text]))`),]);

export const webauthnCredentialsInAuth = auth.table("webauthn_credentials", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid("user_id").notNull().references(() => usersInAuth.id, { onDelete: "cascade" } ),
	credentialId: customType({ dataType: () => 'bytea' })("credential_id").notNull(),
	publicKey: customType({ dataType: () => 'bytea' })("public_key").notNull(),
	attestationType: text("attestation_type").default("").notNull(),
	aaguid: uuid(),
	signCount: bigint("sign_count", { mode: 'number' }).default(0).notNull(),
	transports: jsonb().default([]).notNull(),
	backupEligible: boolean("backup_eligible").default(false).notNull(),
	backedUp: boolean("backed_up").default(false).notNull(),
	friendlyName: text("friendly_name").default("").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, (table) => [
	uniqueIndex("webauthn_credentials_credential_id_key").using("btree", table.credentialId.asc().nullsLast()),
	index("webauthn_credentials_user_id_idx").using("btree", table.userId.asc().nullsLast()),
]);

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
	userId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "cascade", onUpdate: "cascade" } ),
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
	userId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "cascade" } ),
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
	userId: uuid().references(() => usersInAuth.id, { onDelete: "set null", onUpdate: "cascade" } ),
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
	configId: text(),
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
}, (table) => [
	uniqueIndex("meetings_configId_live_key").using("btree", table.configId.asc().nullsLast()).where(sql`("deletedAt" IS NULL)`),
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
	clientId: uuid().notNull().references(() => oauthClientsInAuth.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	clientSecret: text().notNull(),
	userId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "cascade", onUpdate: "cascade" } ),
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
	userId: uuid().references(() => usersInAuth.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	clientId: uuid().references(() => oauthClientsInAuth.id, { onDelete: "cascade", onUpdate: "cascade" } ),
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
	clientId: uuid().primaryKey().references(() => oauthClientsInAuth.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	userId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	type: oauthRegistrationTypeInPlatform().default("development").notNull(),
	label: text().default("Default Client").notNull(),
}, (table) => [

	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const oauthTestAccountsInPlatform = platform.table.withRLS("oauthTestAccounts", {
	testUserId: uuid().primaryKey().references(() => usersInAuth.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	ownerUserId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	createdAt: timestamp().default(sql`now()`).notNull(),
}, (table) => [
	unique("oauthTestAccounts_ownerUserId_key").on(table.ownerUserId),
	pgPolicy("crud_public_policy_delete", { as: "restrictive", for: "delete", using: sql`false` }),

	pgPolicy("crud_public_policy_insert", { as: "restrictive", for: "insert", withCheck: sql`false` }),

	pgPolicy("crud_public_policy_select", { as: "restrictive", for: "select", using: sql`false` }),

	pgPolicy("crud_public_policy_update", { as: "restrictive", for: "update", using: sql`false`, withCheck: sql`false` }),
]);

export const officerDiscordIdsInPlatform = platform.table.withRLS("officerDiscordIds", {
	userId: uuid().primaryKey().references(() => usersInAuth.id, { onDelete: "cascade" } ),
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
	userId: uuid().primaryKey().references(() => usersInAuth.id, { onDelete: "cascade", onUpdate: "cascade" } ),
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
}, (table) => [
	uniqueIndex("profile_ugaEmail_key").using("btree", table.ugaEmail.asc().nullsLast()),

	pgPolicy("crud_authenticated_policy_delete", { as: "restrictive", for: "delete", to: ["authenticated"], using: sql`false` }),

	pgPolicy("crud_authenticated_policy_insert", { as: "restrictive", for: "insert", to: ["authenticated"], withCheck: sql`false` }),

	pgPolicy("crud_authenticated_policy_select", { for: "select", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = "userId")` }),

	pgPolicy("crud_authenticated_policy_update", { for: "update", to: ["authenticated"], using: sql`((( SELECT auth.uid() AS uid) = "userId") AND ("quarantinedBy" IS NULL) AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid))))`, withCheck: sql`((( SELECT auth.uid() AS uid) = "userId") AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid))))` }),
check("profile_ugaEmail_lowercase", sql`(("ugaEmail" IS NULL) OR ("ugaEmail" = lower("ugaEmail")))`),]);

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
	userId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "cascade", onUpdate: "cascade" } ),
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
	reporterUserId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "cascade" } ),
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
	moderatorUserId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "restrict" } ),
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
	reporterUserId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "cascade" } ),
	reportedUserId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "cascade" } ),
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
	userId: uuid().references(() => usersInAuth.id, { onDelete: "cascade" } ),
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
	userId: uuid().references(() => usersInAuth.id, { onDelete: "set null" } ),
	guestId: uuid().references(() => supportGuestsInPlatform.id, { onDelete: "set null" } ),
	createdAt: timestamp({ withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("supportMessages_threadId_idx").using("btree", table.threadId.asc().nullsLast()),

	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),
]);

export const teamMembersInPlatform = platform.table.withRLS("teamMembers", {
	id: uuid().defaultRandom().primaryKey(),
	teamId: uuid().notNull().references(() => teamsInPlatform.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	userId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "cascade", onUpdate: "cascade" } ),
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
	userId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "cascade", onUpdate: "cascade" } ),
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
	userId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "cascade" } ),
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
	userId: uuid().notNull().references(() => usersInAuth.id, { onDelete: "cascade" } ),
	service: text().notNull(),
	reason: text(),
	suspendedAt: timestamp().default(sql`now()`).notNull(),
	suspendedBy: uuid().references(() => usersInAuth.id, { onDelete: "set null" } ),
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
	configId: text(),
	deletedAt: timestamp({ withTimezone: true }),
	title: text(),
	description: text(),
}, (table) => [
	uniqueIndex("workshops_configId_live_key").using("btree", table.configId.asc().nullsLast()).where(sql`("deletedAt" IS NULL)`),
	index("workshops_live_idx").using("btree", table.meetingId.asc().nullsLast()).where(sql`("deletedAt" IS NULL)`),
	unique("workshops_id_meetingId_key").on(table.id, table.meetingId),
	pgPolicy("no_client_delete", { as: "restrictive", for: "delete", to: ["anon", "authenticated"], using: sql`false` }),

	pgPolicy("no_client_insert", { as: "restrictive", for: "insert", to: ["anon", "authenticated"], withCheck: sql`false` }),

	pgPolicy("no_client_update", { as: "restrictive", for: "update", to: ["anon", "authenticated"], using: sql`false`, withCheck: sql`false` }),

	pgPolicy("public_select", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
check("workshops_description_length", sql`((description IS NULL) OR (char_length(description) <= 280))`),check("workshops_title_length", sql`((title IS NULL) OR (char_length(title) <= 80))`),]);

export const bucketsInStorage = storage.table.withRLS("buckets", {
	id: text().primaryKey(),
	name: text().notNull(),
	owner: uuid(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	public: boolean().default(false),
	avifAutodetection: boolean("avif_autodetection").default(false),
	fileSizeLimit: bigint("file_size_limit", { mode: 'number' }),
	allowedMimeTypes: text("allowed_mime_types").array(),
	ownerId: text("owner_id"),
	type: buckettypeInStorage().default("STANDARD").notNull(),
	versioningStatus: text("versioning_status").default("DISABLED").notNull(),
}, (table) => [
	uniqueIndex("bname").using("btree", table.name.asc().nullsLast()),
check("buckets_versioning_dark_check", sql`(versioning_status = 'DISABLED'::text)`),check("buckets_versioning_standard_only_check", sql`((type = 'STANDARD'::storage.buckettype) OR (versioning_status = 'DISABLED'::text))`),check("buckets_versioning_status_check", sql`(versioning_status = ANY (ARRAY['DISABLED'::text, 'ENABLED'::text, 'SUSPENDED'::text]))`),]);

export const bucketsAnalyticsInStorage = storage.table.withRLS("buckets_analytics", {
	name: text().notNull(),
	type: buckettypeInStorage().default("ANALYTICS").notNull(),
	format: text().default("ICEBERG").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	id: uuid().defaultRandom().primaryKey(),
	deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
	uniqueIndex("buckets_analytics_unique_name_idx").using("btree", table.name.asc().nullsLast()).where(sql`(deleted_at IS NULL)`),
]);

export const bucketsVectorsInStorage = storage.table.withRLS("buckets_vectors", {
	id: text().primaryKey(),
	type: buckettypeInStorage().default("VECTOR").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const icebergNamespacesInStorage = storage.table.withRLS("iceberg_namespaces", {
	id: uuid().defaultRandom().primaryKey(),
	bucketName: text("bucket_name").notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	metadata: jsonb().default({}).notNull(),
	catalogId: uuid("catalog_id").notNull().references(() => bucketsAnalyticsInStorage.id, { onDelete: "cascade" } ),
}, (table) => [
	uniqueIndex("idx_iceberg_namespaces_bucket_id").using("btree", table.catalogId.asc().nullsLast(), table.name.asc().nullsLast()),
]);

export const icebergTablesInStorage = storage.table.withRLS("iceberg_tables", {
	id: uuid().defaultRandom().primaryKey(),
	namespaceId: uuid("namespace_id").notNull().references(() => icebergNamespacesInStorage.id, { onDelete: "cascade" } ),
	bucketName: text("bucket_name").notNull(),
	name: text().notNull(),
	location: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	remoteTableId: text("remote_table_id"),
	shardKey: text("shard_key"),
	shardId: text("shard_id"),
	catalogId: uuid("catalog_id").notNull().references(() => bucketsAnalyticsInStorage.id, { onDelete: "cascade" } ),
}, (table) => [
	uniqueIndex("idx_iceberg_tables_location").using("btree", table.location.asc().nullsLast()),
	uniqueIndex("idx_iceberg_tables_namespace_id").using("btree", table.catalogId.asc().nullsLast(), table.namespaceId.asc().nullsLast(), table.name.asc().nullsLast()),
]);

export const migrationsInStorage = storage.table.withRLS("migrations", {
	id: integer().primaryKey(),
	name: varchar({ length: 100 }).notNull(),
	hash: varchar({ length: 40 }).notNull(),
	executedAt: timestamp("executed_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	unique("migrations_name_key").on(table.name),]);

export const objectsInStorage = storage.table.withRLS("objects", {
	id: uuid().defaultRandom().primaryKey(),
	bucketId: text("bucket_id").references(() => bucketsInStorage.id),
	name: text(),
	owner: uuid(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }).default(sql`now()`),
	metadata: jsonb(),
	pathTokens: text("path_tokens").array().generatedAlwaysAs(sql`string_to_array(name, '/'::text)`),
	version: text(),
	ownerId: text("owner_id"),
	userMetadata: jsonb("user_metadata"),
	archivedAt: timestamp("archived_at", { withTimezone: true }),
	isDeleteMarker: boolean("is_delete_marker").default(false).notNull(),
	isVersioned: boolean("is_versioned").default(false).notNull(),
}, (table) => [
	uniqueIndex("bucketid_objname").using("btree", table.bucketId.asc().nullsLast(), table.name.asc().nullsLast()),
	index("idx_objects_bucket_id_name").using("btree", table.bucketId.asc().nullsLast(), table.name.asc().nullsLast()),
	index("idx_objects_bucket_id_name_lower").using("btree", table.bucketId.asc().nullsLast(), sql`lower(name)`),
	uniqueIndex("idx_objects_current_version").using("btree", table.bucketId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(archived_at IS NULL)`),
	uniqueIndex("idx_objects_null_version").using("btree", table.bucketId.asc().nullsLast(), table.name.asc().nullsLast()).where(sql`(NOT is_versioned)`),
	index("name_prefix_search").using("btree", table.name.asc().nullsLast().op("text_pattern_ops")),
	uniqueIndex("objects_bucket_id_name_version_key").using("btree", table.bucketId.asc().nullsLast(), table.name.asc().nullsLast(), table.version.asc().nullsLast()),

	pgPolicy("avatar_delete_policy", { for: "delete", to: ["authenticated"], using: sql`((bucket_id = 'avatars'::text) AND (name = (auth.uid())::text) AND (NOT platform.is_profile_frozen(( SELECT auth.uid() AS uid))))` }),

	pgPolicy("avatar_insert_policy", { for: "insert", to: ["authenticated"], withCheck: sql`((bucket_id = 'avatars'::text) AND (name = (auth.uid())::text) AND (path_tokens = ARRAY[(auth.uid())::text]) AND (NOT platform.is_profile_frozen(( SELECT auth.uid() AS uid))))` }),

	pgPolicy("avatar_update_policy", { for: "update", to: ["authenticated"], using: sql`((bucket_id = 'avatars'::text) AND (name = (auth.uid())::text) AND (path_tokens = ARRAY[(auth.uid())::text]) AND (NOT platform.is_profile_frozen(( SELECT auth.uid() AS uid))))`, withCheck: sql`((bucket_id = 'avatars'::text) AND (name = (auth.uid())::text) AND (path_tokens = ARRAY[(auth.uid())::text]) AND (NOT platform.is_profile_frozen(( SELECT auth.uid() AS uid))))` }),
]);

export const s3MultipartUploadsInStorage = storage.table.withRLS("s3_multipart_uploads", {
	id: text().primaryKey(),
	inProgressSize: bigint("in_progress_size", { mode: 'number' }).default(0).notNull(),
	uploadSignature: text("upload_signature").notNull(),
	bucketId: text("bucket_id").notNull().references(() => bucketsInStorage.id),
	key: text().notNull(),
	version: text().notNull(),
	ownerId: text("owner_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	userMetadata: jsonb("user_metadata"),
	metadata: jsonb(),
}, (table) => [
	index("idx_multipart_uploads_list").using("btree", table.bucketId.asc().nullsLast(), table.key.asc().nullsLast(), table.createdAt.asc().nullsLast()),
]);

export const s3MultipartUploadsPartsInStorage = storage.table.withRLS("s3_multipart_uploads_parts", {
	id: uuid().defaultRandom().primaryKey(),
	uploadId: text("upload_id").notNull().references(() => s3MultipartUploadsInStorage.id, { onDelete: "cascade" } ),
	size: bigint({ mode: 'number' }).default(0).notNull(),
	partNumber: integer("part_number").notNull(),
	bucketId: text("bucket_id").notNull().references(() => bucketsInStorage.id),
	key: text().notNull(),
	etag: text().notNull(),
	ownerId: text("owner_id"),
	version: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const vectorIndexesInStorage = storage.table.withRLS("vector_indexes", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	name: text().notNull(),
	bucketId: text("bucket_id").notNull().references(() => bucketsVectorsInStorage.id),
	dataType: text("data_type").notNull(),
	dimension: integer().notNull(),
	distanceMetric: text("distance_metric").notNull(),
	metadataConfiguration: jsonb("metadata_configuration"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("vector_indexes_name_bucket_id_idx").using("btree", table.name.asc().nullsLast(), table.bucketId.asc().nullsLast()),
]);

export const hooksInSupabaseFunctions = supabaseFunctions.table("hooks", {
	id: bigserial({ mode: 'number' }).primaryKey(),
	hookTableId: integer("hook_table_id").notNull(),
	hookName: text("hook_name").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	requestId: bigint("request_id", { mode: 'number' }),
}, (table) => [
	index("supabase_functions_hooks_h_table_id_h_name_idx").using("btree", table.hookTableId.asc().nullsLast(), table.hookName.asc().nullsLast()),
	index("supabase_functions_hooks_request_id_idx").using("btree", table.requestId.asc().nullsLast()),
]);

export const migrationsInSupabaseFunctions = supabaseFunctions.table("migrations", {
	version: text().primaryKey(),
	insertedAt: timestamp("inserted_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const schemaMigrationsInSupabaseMigrations = supabaseMigrations.table("schema_migrations", {
	version: text().primaryKey(),
	statements: text().array(),
	name: text(),
});

export const seedFilesInSupabaseMigrations = supabaseMigrations.table("seed_files", {
	path: text().primaryKey(),
	hash: text().notNull(),
});

export const secretsInVault = vault.table("secrets", {
	id: uuid().defaultRandom().primaryKey(),
	name: text(),
	description: text().default("").notNull(),
	secret: text().notNull(),
	keyId: uuid("key_id"),
	nonce: customType({ dataType: () => 'bytea' })().default("vault._crypto_aead_det_noncegen()"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	uniqueIndex("secrets_name_idx").using("btree", table.name.asc().nullsLast()).where(sql`(name IS NOT NULL)`),
]);
export const pgStatStatementsInExtensions = extensions.view("pg_stat_statements", {	userid: customType({ dataType: () => 'oid' })(),
	dbid: customType({ dataType: () => 'oid' })(),
	toplevel: boolean(),
	queryid: bigint({ mode: 'number' }),
	query: text(),
	plans: bigint({ mode: 'number' }),
	totalPlanTime: doublePrecision("total_plan_time"),
	minPlanTime: doublePrecision("min_plan_time"),
	maxPlanTime: doublePrecision("max_plan_time"),
	meanPlanTime: doublePrecision("mean_plan_time"),
	stddevPlanTime: doublePrecision("stddev_plan_time"),
	calls: bigint({ mode: 'number' }),
	totalExecTime: doublePrecision("total_exec_time"),
	minExecTime: doublePrecision("min_exec_time"),
	maxExecTime: doublePrecision("max_exec_time"),
	meanExecTime: doublePrecision("mean_exec_time"),
	stddevExecTime: doublePrecision("stddev_exec_time"),
	rows: bigint({ mode: 'number' }),
	sharedBlksHit: bigint("shared_blks_hit", { mode: 'number' }),
	sharedBlksRead: bigint("shared_blks_read", { mode: 'number' }),
	sharedBlksDirtied: bigint("shared_blks_dirtied", { mode: 'number' }),
	sharedBlksWritten: bigint("shared_blks_written", { mode: 'number' }),
	localBlksHit: bigint("local_blks_hit", { mode: 'number' }),
	localBlksRead: bigint("local_blks_read", { mode: 'number' }),
	localBlksDirtied: bigint("local_blks_dirtied", { mode: 'number' }),
	localBlksWritten: bigint("local_blks_written", { mode: 'number' }),
	tempBlksRead: bigint("temp_blks_read", { mode: 'number' }),
	tempBlksWritten: bigint("temp_blks_written", { mode: 'number' }),
	sharedBlkReadTime: doublePrecision("shared_blk_read_time"),
	sharedBlkWriteTime: doublePrecision("shared_blk_write_time"),
	localBlkReadTime: doublePrecision("local_blk_read_time"),
	localBlkWriteTime: doublePrecision("local_blk_write_time"),
	tempBlkReadTime: doublePrecision("temp_blk_read_time"),
	tempBlkWriteTime: doublePrecision("temp_blk_write_time"),
	walRecords: bigint("wal_records", { mode: 'number' }),
	walFpi: bigint("wal_fpi", { mode: 'number' }),
	walBytes: numeric("wal_bytes"),
	jitFunctions: bigint("jit_functions", { mode: 'number' }),
	jitGenerationTime: doublePrecision("jit_generation_time"),
	jitInliningCount: bigint("jit_inlining_count", { mode: 'number' }),
	jitInliningTime: doublePrecision("jit_inlining_time"),
	jitOptimizationCount: bigint("jit_optimization_count", { mode: 'number' }),
	jitOptimizationTime: doublePrecision("jit_optimization_time"),
	jitEmissionCount: bigint("jit_emission_count", { mode: 'number' }),
	jitEmissionTime: doublePrecision("jit_emission_time"),
	jitDeformCount: bigint("jit_deform_count", { mode: 'number' }),
	jitDeformTime: doublePrecision("jit_deform_time"),
	statsSince: timestamp("stats_since", { withTimezone: true }),
	minmaxStatsSince: timestamp("minmax_stats_since", { withTimezone: true }),
}).as(sql`SELECT userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time, max_plan_time, mean_plan_time, stddev_plan_time, calls, total_exec_time, min_exec_time, max_exec_time, mean_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written, local_blks_hit, local_blks_read, local_blks_dirtied, local_blks_written, temp_blks_read, temp_blks_written, shared_blk_read_time, shared_blk_write_time, local_blk_read_time, local_blk_write_time, temp_blk_read_time, temp_blk_write_time, wal_records, wal_fpi, wal_bytes, jit_functions, jit_generation_time, jit_inlining_count, jit_inlining_time, jit_optimization_count, jit_optimization_time, jit_emission_count, jit_emission_time, jit_deform_count, jit_deform_time, stats_since, minmax_stats_since FROM pg_stat_statements(true) pg_stat_statements(userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time, max_plan_time, mean_plan_time, stddev_plan_time, calls, total_exec_time, min_exec_time, max_exec_time, mean_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written, local_blks_hit, local_blks_read, local_blks_dirtied, local_blks_written, temp_blks_read, temp_blks_written, shared_blk_read_time, shared_blk_write_time, local_blk_read_time, local_blk_write_time, temp_blk_read_time, temp_blk_write_time, wal_records, wal_fpi, wal_bytes, jit_functions, jit_generation_time, jit_inlining_count, jit_inlining_time, jit_optimization_count, jit_optimization_time, jit_emission_count, jit_emission_time, jit_deform_count, jit_deform_time, stats_since, minmax_stats_since)`);

export const pgStatStatementsInfoInExtensions = extensions.view("pg_stat_statements_info", {	dealloc: bigint({ mode: 'number' }),
	statsReset: timestamp("stats_reset", { withTimezone: true }),
}).as(sql`SELECT dealloc, stats_reset FROM pg_stat_statements_info() pg_stat_statements_info(dealloc, stats_reset)`);

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

export const decryptedSecretsInVault = vault.view("decrypted_secrets", {	id: uuid(),
	name: text(),
	description: text(),
	secret: text(),
	decryptedSecret: text("decrypted_secret"),
	keyId: uuid("key_id"),
	nonce: customType({ dataType: () => 'bytea' })(),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
}).as(sql`SELECT id, name, description, secret, convert_from(vault._crypto_aead_det_decrypt(message => decode(secret, 'base64'::text), additional => convert_to(id::text, 'utf8'::name), key_id => 0::bigint, context => '\x7067736f6469756d'::bytea, nonce => nonce), 'utf8'::name) AS decrypted_secret, key_id, nonce, created_at, updated_at FROM vault.secrets s`);