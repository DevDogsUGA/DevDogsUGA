import {
  pgSchema,
  pgTable,
  text,
  bigserial,
  uuid,
  bigint,
  varchar,
  integer,
  timestamp,
  pgEnum,
  customType,
  json,
  jsonb,
  boolean,
  inet,
  smallint,
  index,
  uniqueIndex,
  foreignKey,
  primaryKey,
  unique,
  check,
  doublePrecision,
  numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const auth = pgSchema("auth");
export const extensions = pgSchema("extensions");
export const graphql = pgSchema("graphql");
export const graphqlPublic = pgSchema("graphql_public");
export const net = pgSchema("net");
export const pgbouncer = pgSchema("pgbouncer");
export const realtime = pgSchema("realtime");
export const storage = pgSchema("storage");
export const supabaseFunctions = pgSchema("supabase_functions");
export const vault = pgSchema("vault");
export const requestStatusInNet = net.enum("request_status", [
  "PENDING",
  "SUCCESS",
  "ERROR",
]);
export const equalityOpInRealtime = realtime.enum("equality_op", [
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "in",
]);
export const actionInRealtime = realtime.enum("action", [
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "ERROR",
]);
export const buckettypeInStorage = storage.enum("buckettype", [
  "STANDARD",
  "ANALYTICS",
  "VECTOR",
]);
export const factorTypeInAuth = auth.enum("factor_type", [
  "totp",
  "webauthn",
  "phone",
]);
export const factorStatusInAuth = auth.enum("factor_status", [
  "unverified",
  "verified",
]);
export const aalLevelInAuth = auth.enum("aal_level", ["aal1", "aal2", "aal3"]);
export const codeChallengeMethodInAuth = auth.enum("code_challenge_method", [
  "s256",
  "plain",
]);
export const oneTimeTokenTypeInAuth = auth.enum("one_time_token_type", [
  "confirmation_token",
  "reauthentication_token",
  "recovery_token",
  "email_change_token_new",
  "email_change_token_current",
  "phone_change_token",
]);
export const oauthRegistrationTypeInAuth = auth.enum(
  "oauth_registration_type",
  ["dynamic", "manual"],
);
export const oauthAuthorizationStatusInAuth = auth.enum(
  "oauth_authorization_status",
  ["pending", "approved", "denied", "expired"],
);
export const oauthResponseTypeInAuth = auth.enum("oauth_response_type", [
  "code",
]);
export const oauthClientTypeInAuth = auth.enum("oauth_client_type", [
  "public",
  "confidential",
]);

export const seqSchemaVersionInGraphql = graphql.sequence(
  "seq_schema_version",
  {
    startWith: "1",
    increment: "1",
    minValue: "1",
    maxValue: "2147483647",
    cache: "1",
    cycle: true,
  },
);

export const auditLogEntriesInAuth = auth.table.withRLS(
  "audit_log_entries",
  {
    instanceId: uuid("instance_id"),
    id: uuid().primaryKey(),
    payload: json(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    ipAddress: varchar("ip_address", { length: 64 }).default("").notNull(),
  },
  (table) => [
    index("audit_logs_instance_id_idx").using(
      "btree",
      table.instanceId.asc().nullsLast(),
    ),
  ],
);

export const customOauthProvidersInAuth = auth.table(
  "custom_oauth_providers",
  {
    id: uuid().defaultRandom().primaryKey(),
    providerType: text("provider_type").notNull(),
    identifier: text().notNull(),
    name: text().notNull(),
    clientId: text("client_id").notNull(),
    clientSecret: text("client_secret").notNull(),
    acceptableClientIds: text("acceptable_client_ids")
      .array()
      .default([])
      .notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("custom_oauth_providers_created_at_idx").using(
      "btree",
      table.createdAt.asc().nullsLast(),
    ),
    index("custom_oauth_providers_enabled_idx").using(
      "btree",
      table.enabled.asc().nullsLast(),
    ),
    index("custom_oauth_providers_identifier_idx").using(
      "btree",
      table.identifier.asc().nullsLast(),
    ),
    index("custom_oauth_providers_provider_type_idx").using(
      "btree",
      table.providerType.asc().nullsLast(),
    ),
    unique("custom_oauth_providers_identifier_key").on(table.identifier),
    check(
      "custom_oauth_providers_authorization_url_https",
      sql`((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))`,
    ),
    check(
      "custom_oauth_providers_authorization_url_length",
      sql`((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))`,
    ),
    check(
      "custom_oauth_providers_client_id_length",
      sql`((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))`,
    ),
    check(
      "custom_oauth_providers_discovery_url_length",
      sql`((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))`,
    ),
    check(
      "custom_oauth_providers_identifier_format",
      sql`(identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)`,
    ),
    check(
      "custom_oauth_providers_issuer_length",
      sql`((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))`,
    ),
    check(
      "custom_oauth_providers_jwks_uri_https",
      sql`((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))`,
    ),
    check(
      "custom_oauth_providers_jwks_uri_length",
      sql`((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))`,
    ),
    check(
      "custom_oauth_providers_name_length",
      sql`((char_length(name) >= 1) AND (char_length(name) <= 100))`,
    ),
    check(
      "custom_oauth_providers_oauth2_requires_endpoints",
      sql`((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))`,
    ),
    check(
      "custom_oauth_providers_oidc_discovery_url_https",
      sql`((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))`,
    ),
    check(
      "custom_oauth_providers_oidc_issuer_https",
      sql`((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))`,
    ),
    check(
      "custom_oauth_providers_oidc_requires_issuer",
      sql`((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))`,
    ),
    check(
      "custom_oauth_providers_provider_type_check",
      sql`(provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))`,
    ),
    check(
      "custom_oauth_providers_token_url_https",
      sql`((token_url IS NULL) OR (token_url ~~ 'https://%'::text))`,
    ),
    check(
      "custom_oauth_providers_token_url_length",
      sql`((token_url IS NULL) OR (char_length(token_url) <= 2048))`,
    ),
    check(
      "custom_oauth_providers_userinfo_url_https",
      sql`((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))`,
    ),
    check(
      "custom_oauth_providers_userinfo_url_length",
      sql`((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048))`,
    ),
  ],
);

export const flowStateInAuth = auth.table.withRLS(
  "flow_state",
  {
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
  },
  (table) => [
    index("flow_state_created_at_idx").using(
      "btree",
      table.createdAt.desc().nullsFirst(),
    ),
    index("idx_auth_code").using("btree", table.authCode.asc().nullsLast()),
    index("idx_user_id_auth_method").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.authenticationMethod.asc().nullsLast(),
    ),
  ],
);

export const identitiesInAuth = auth.table.withRLS(
  "identities",
  {
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersInAuth.id, { onDelete: "cascade" }),
    identityData: jsonb("identity_data").notNull(),
    provider: text().notNull(),
    lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    email: text().generatedAlwaysAs(
      sql`lower((identity_data ->> 'email'::text))`,
    ),
    id: uuid().defaultRandom().primaryKey(),
  },
  (table) => [
    index("identities_email_idx").using(
      "btree",
      table.email.asc().nullsLast().op("text_pattern_ops"),
    ),
    index("identities_user_id_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
    unique("identities_provider_id_provider_unique").on(
      table.providerId,
      table.provider,
    ),
  ],
);

export const instancesInAuth = auth.table.withRLS("instances", {
  id: uuid().primaryKey(),
  uuid: uuid(),
  rawBaseConfig: text("raw_base_config"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const mfaAmrClaimsInAuth = auth.table.withRLS(
  "mfa_amr_claims",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessionsInAuth.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    authenticationMethod: text("authentication_method").notNull(),
    id: uuid().primaryKey(),
  },
  (table) => [
    unique("mfa_amr_claims_session_id_authentication_method_pkey").on(
      table.sessionId,
      table.authenticationMethod,
    ),
  ],
);

export const mfaChallengesInAuth = auth.table.withRLS(
  "mfa_challenges",
  {
    id: uuid().primaryKey(),
    factorId: uuid("factor_id")
      .notNull()
      .references(() => mfaFactorsInAuth.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ipAddress: inet("ip_address").notNull(),
    otpCode: text("otp_code"),
    webAuthnSessionData: jsonb("web_authn_session_data"),
  },
  (table) => [
    index("mfa_challenge_created_at_idx").using(
      "btree",
      table.createdAt.desc().nullsFirst(),
    ),
  ],
);

export const mfaFactorsInAuth = auth.table.withRLS(
  "mfa_factors",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersInAuth.id, { onDelete: "cascade" }),
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
  },
  (table) => [
    index("factor_id_created_at_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
    ),
    uniqueIndex("mfa_factors_user_friendly_name_unique")
      .using(
        "btree",
        table.friendlyName.asc().nullsLast(),
        table.userId.asc().nullsLast(),
      )
      .where(sql`(TRIM(BOTH FROM friendly_name) <> ''::text)`),
    index("mfa_factors_user_id_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
    uniqueIndex("unique_phone_factor_per_user").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.phone.asc().nullsLast(),
    ),
    unique("mfa_factors_last_challenged_at_key").on(table.lastChallengedAt),
  ],
);

export const oauthAuthorizationsInAuth = auth.table(
  "oauth_authorizations",
  {
    id: uuid().primaryKey(),
    authorizationId: text("authorization_id").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => oauthClientsInAuth.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => usersInAuth.id, {
      onDelete: "cascade",
    }),
    redirectUri: text("redirect_uri").notNull(),
    scope: text().notNull(),
    state: text(),
    resource: text(),
    codeChallenge: text("code_challenge"),
    codeChallengeMethod: codeChallengeMethodInAuth("code_challenge_method"),
    responseType: oauthResponseTypeInAuth("response_type")
      .default("code")
      .notNull(),
    status: oauthAuthorizationStatusInAuth().default("pending").notNull(),
    authorizationCode: text("authorization_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .default(sql`(now() + '00:03:00'::interval)`)
      .notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    nonce: text(),
  },
  (table) => [
    index("oauth_auth_pending_exp_idx")
      .using("btree", table.expiresAt.asc().nullsLast())
      .where(sql`(status = 'pending'::auth.oauth_authorization_status)`),
    unique("oauth_authorizations_authorization_code_key").on(
      table.authorizationCode,
    ),
    unique("oauth_authorizations_authorization_id_key").on(
      table.authorizationId,
    ),
    check(
      "oauth_authorizations_authorization_code_length",
      sql`(char_length(authorization_code) <= 255)`,
    ),
    check(
      "oauth_authorizations_code_challenge_length",
      sql`(char_length(code_challenge) <= 128)`,
    ),
    check(
      "oauth_authorizations_expires_at_future",
      sql`(expires_at > created_at)`,
    ),
    check(
      "oauth_authorizations_nonce_length",
      sql`(char_length(nonce) <= 255)`,
    ),
    check(
      "oauth_authorizations_redirect_uri_length",
      sql`(char_length(redirect_uri) <= 2048)`,
    ),
    check(
      "oauth_authorizations_resource_length",
      sql`(char_length(resource) <= 2048)`,
    ),
    check(
      "oauth_authorizations_scope_length",
      sql`(char_length(scope) <= 4096)`,
    ),
    check(
      "oauth_authorizations_state_length",
      sql`(char_length(state) <= 4096)`,
    ),
  ],
);

export const oauthClientStatesInAuth = auth.table(
  "oauth_client_states",
  {
    id: uuid().primaryKey(),
    providerType: text("provider_type").notNull(),
    codeVerifier: text("code_verifier"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_oauth_client_states_created_at").using(
      "btree",
      table.createdAt.asc().nullsLast(),
    ),
  ],
);

export const oauthClientsInAuth = auth.table(
  "oauth_clients",
  {
    id: uuid().primaryKey(),
    clientSecretHash: text("client_secret_hash"),
    registrationType:
      oauthRegistrationTypeInAuth("registration_type").notNull(),
    redirectUris: text("redirect_uris").notNull(),
    grantTypes: text("grant_types").notNull(),
    clientName: text("client_name"),
    clientUri: text("client_uri"),
    logoUri: text("logo_uri"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    clientType: oauthClientTypeInAuth("client_type")
      .default("confidential")
      .notNull(),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull(),
  },
  (table) => [
    index("oauth_clients_deleted_at_idx").using(
      "btree",
      table.deletedAt.asc().nullsLast(),
    ),
    check(
      "oauth_clients_client_name_length",
      sql`(char_length(client_name) <= 1024)`,
    ),
    check(
      "oauth_clients_client_uri_length",
      sql`(char_length(client_uri) <= 2048)`,
    ),
    check(
      "oauth_clients_logo_uri_length",
      sql`(char_length(logo_uri) <= 2048)`,
    ),
    check(
      "oauth_clients_token_endpoint_auth_method_check",
      sql`(token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text]))`,
    ),
  ],
);

export const oauthConsentsInAuth = auth.table(
  "oauth_consents",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersInAuth.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => oauthClientsInAuth.id, { onDelete: "cascade" }),
    scopes: text().notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("oauth_consents_active_client_idx")
      .using("btree", table.clientId.asc().nullsLast())
      .where(sql`(revoked_at IS NULL)`),
    index("oauth_consents_active_user_client_idx")
      .using(
        "btree",
        table.userId.asc().nullsLast(),
        table.clientId.asc().nullsLast(),
      )
      .where(sql`(revoked_at IS NULL)`),
    index("oauth_consents_user_order_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.grantedAt.desc().nullsFirst(),
    ),
    unique("oauth_consents_user_client_unique").on(
      table.userId,
      table.clientId,
    ),
    check(
      "oauth_consents_revoked_after_granted",
      sql`((revoked_at IS NULL) OR (revoked_at >= granted_at))`,
    ),
    check("oauth_consents_scopes_length", sql`(char_length(scopes) <= 2048)`),
    check(
      "oauth_consents_scopes_not_empty",
      sql`(char_length(TRIM(BOTH FROM scopes)) > 0)`,
    ),
  ],
);

export const oneTimeTokensInAuth = auth.table.withRLS(
  "one_time_tokens",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersInAuth.id, { onDelete: "cascade" }),
    tokenType: oneTimeTokenTypeInAuth("token_type").notNull(),
    tokenHash: text("token_hash").notNull(),
    relatesTo: text("relates_to").notNull(),
    createdAt: timestamp("created_at")
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("one_time_tokens_relates_to_hash_idx").using(
      "hash",
      table.relatesTo.asc().nullsLast(),
    ),
    index("one_time_tokens_token_hash_hash_idx").using(
      "hash",
      table.tokenHash.asc().nullsLast(),
    ),
    uniqueIndex("one_time_tokens_user_id_token_type_key").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.tokenType.asc().nullsLast(),
    ),
    check(
      "one_time_tokens_token_hash_check",
      sql`(char_length(token_hash) > 0)`,
    ),
  ],
);

export const refreshTokensInAuth = auth.table.withRLS(
  "refresh_tokens",
  {
    instanceId: uuid("instance_id"),
    id: bigserial({ mode: "number" }).primaryKey(),
    token: varchar({ length: 255 }),
    userId: varchar("user_id", { length: 255 }),
    revoked: boolean(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    parent: varchar({ length: 255 }),
    sessionId: uuid("session_id").references(() => sessionsInAuth.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    index("refresh_tokens_instance_id_idx").using(
      "btree",
      table.instanceId.asc().nullsLast(),
    ),
    index("refresh_tokens_instance_id_user_id_idx").using(
      "btree",
      table.instanceId.asc().nullsLast(),
      table.userId.asc().nullsLast(),
    ),
    index("refresh_tokens_parent_idx").using(
      "btree",
      table.parent.asc().nullsLast(),
    ),
    index("refresh_tokens_session_id_revoked_idx").using(
      "btree",
      table.sessionId.asc().nullsLast(),
      table.revoked.asc().nullsLast(),
    ),
    index("refresh_tokens_updated_at_idx").using(
      "btree",
      table.updatedAt.desc().nullsFirst(),
    ),
    unique("refresh_tokens_token_unique").on(table.token),
  ],
);

export const samlProvidersInAuth = auth.table.withRLS(
  "saml_providers",
  {
    id: uuid().primaryKey(),
    ssoProviderId: uuid("sso_provider_id")
      .notNull()
      .references(() => ssoProvidersInAuth.id, { onDelete: "cascade" }),
    entityId: text("entity_id").notNull(),
    metadataXml: text("metadata_xml").notNull(),
    metadataUrl: text("metadata_url"),
    attributeMapping: jsonb("attribute_mapping"),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    nameIdFormat: text("name_id_format"),
  },
  (table) => [
    index("saml_providers_sso_provider_id_idx").using(
      "btree",
      table.ssoProviderId.asc().nullsLast(),
    ),
    unique("saml_providers_entity_id_key").on(table.entityId),
    check("entity_id not empty", sql`(char_length(entity_id) > 0)`),
    check(
      "metadata_url not empty",
      sql`((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))`,
    ),
    check("metadata_xml not empty", sql`(char_length(metadata_xml) > 0)`),
  ],
);

export const samlRelayStatesInAuth = auth.table.withRLS(
  "saml_relay_states",
  {
    id: uuid().primaryKey(),
    ssoProviderId: uuid("sso_provider_id")
      .notNull()
      .references(() => ssoProvidersInAuth.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    forEmail: text("for_email"),
    redirectTo: text("redirect_to"),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    flowStateId: uuid("flow_state_id").references(() => flowStateInAuth.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    index("saml_relay_states_created_at_idx").using(
      "btree",
      table.createdAt.desc().nullsFirst(),
    ),
    index("saml_relay_states_for_email_idx").using(
      "btree",
      table.forEmail.asc().nullsLast(),
    ),
    index("saml_relay_states_sso_provider_id_idx").using(
      "btree",
      table.ssoProviderId.asc().nullsLast(),
    ),
    check("request_id not empty", sql`(char_length(request_id) > 0)`),
  ],
);

export const schemaMigrationsInAuth = auth.table.withRLS("schema_migrations", {
  version: varchar({ length: 255 }).primaryKey(),
});

export const sessionsInAuth = auth.table.withRLS(
  "sessions",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersInAuth.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    factorId: uuid("factor_id"),
    aal: aalLevelInAuth(),
    notAfter: timestamp("not_after", { withTimezone: true }),
    refreshedAt: timestamp("refreshed_at"),
    userAgent: text("user_agent"),
    ip: inet(),
    tag: text(),
    oauthClientId: uuid("oauth_client_id").references(
      () => oauthClientsInAuth.id,
      { onDelete: "cascade" },
    ),
    refreshTokenHmacKey: text("refresh_token_hmac_key"),
    refreshTokenCounter: bigint("refresh_token_counter", { mode: "number" }),
    scopes: text(),
  },
  (table) => [
    index("sessions_not_after_idx").using(
      "btree",
      table.notAfter.desc().nullsFirst(),
    ),
    index("sessions_oauth_client_id_idx").using(
      "btree",
      table.oauthClientId.asc().nullsLast(),
    ),
    index("sessions_user_id_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
    index("user_id_created_at_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
    ),
    check("sessions_scopes_length", sql`(char_length(scopes) <= 4096)`),
  ],
);

export const ssoDomainsInAuth = auth.table.withRLS(
  "sso_domains",
  {
    id: uuid().primaryKey(),
    ssoProviderId: uuid("sso_provider_id")
      .notNull()
      .references(() => ssoProvidersInAuth.id, { onDelete: "cascade" }),
    domain: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("sso_domains_domain_idx").using("btree", sql`lower(domain)`),
    index("sso_domains_sso_provider_id_idx").using(
      "btree",
      table.ssoProviderId.asc().nullsLast(),
    ),
    check("domain not empty", sql`(char_length(domain) > 0)`),
  ],
);

export const ssoProvidersInAuth = auth.table.withRLS(
  "sso_providers",
  {
    id: uuid().primaryKey(),
    resourceId: text("resource_id"),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    disabled: boolean(),
  },
  (table) => [
    uniqueIndex("sso_providers_resource_id_idx").using(
      "btree",
      sql`lower(resource_id)`,
    ),
    index("sso_providers_resource_id_pattern_idx").using(
      "btree",
      table.resourceId.asc().nullsLast().op("text_pattern_ops"),
    ),
    check(
      "resource_id not empty",
      sql`((resource_id = NULL::text) OR (char_length(resource_id) > 0))`,
    ),
  ],
);

export const usersInAuth = auth.table.withRLS(
  "users",
  {
    instanceId: uuid("instance_id"),
    id: uuid().primaryKey(),
    aud: varchar({ length: 255 }),
    role: varchar({ length: 255 }),
    email: varchar({ length: 255 }),
    encryptedPassword: varchar("encrypted_password", { length: 255 }),
    emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true }),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    confirmationToken: varchar("confirmation_token", { length: 255 }),
    confirmationSentAt: timestamp("confirmation_sent_at", {
      withTimezone: true,
    }),
    recoveryToken: varchar("recovery_token", { length: 255 }),
    recoverySentAt: timestamp("recovery_sent_at", { withTimezone: true }),
    emailChangeTokenNew: varchar("email_change_token_new", { length: 255 }),
    emailChange: varchar("email_change", { length: 255 }),
    emailChangeSentAt: timestamp("email_change_sent_at", {
      withTimezone: true,
    }),
    lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
    rawAppMetaData: jsonb("raw_app_meta_data"),
    rawUserMetaData: jsonb("raw_user_meta_data"),
    isSuperAdmin: boolean("is_super_admin"),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    phone: text().default(sql`NULL`),
    phoneConfirmedAt: timestamp("phone_confirmed_at", { withTimezone: true }),
    phoneChange: text("phone_change").default(""),
    phoneChangeToken: varchar("phone_change_token", { length: 255 }).default(
      "",
    ),
    phoneChangeSentAt: timestamp("phone_change_sent_at", {
      withTimezone: true,
    }),
    confirmedAt: timestamp("confirmed_at", {
      withTimezone: true,
    }).generatedAlwaysAs(sql`LEAST(email_confirmed_at, phone_confirmed_at)`),
    emailChangeTokenCurrent: varchar("email_change_token_current", {
      length: 255,
    }).default(""),
    emailChangeConfirmStatus: smallint("email_change_confirm_status").default(
      0,
    ),
    bannedUntil: timestamp("banned_until", { withTimezone: true }),
    reauthenticationToken: varchar("reauthentication_token", {
      length: 255,
    }).default(""),
    reauthenticationSentAt: timestamp("reauthentication_sent_at", {
      withTimezone: true,
    }),
    isSsoUser: boolean("is_sso_user").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    isAnonymous: boolean("is_anonymous").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("confirmation_token_idx")
      .using("btree", table.confirmationToken.asc().nullsLast())
      .where(sql`((confirmation_token)::text !~ '^[0-9 ]*$'::text)`),
    uniqueIndex("email_change_token_current_idx")
      .using("btree", table.emailChangeTokenCurrent.asc().nullsLast())
      .where(sql`((email_change_token_current)::text !~ '^[0-9 ]*$'::text)`),
    uniqueIndex("email_change_token_new_idx")
      .using("btree", table.emailChangeTokenNew.asc().nullsLast())
      .where(sql`((email_change_token_new)::text !~ '^[0-9 ]*$'::text)`),
    uniqueIndex("reauthentication_token_idx")
      .using("btree", table.reauthenticationToken.asc().nullsLast())
      .where(sql`((reauthentication_token)::text !~ '^[0-9 ]*$'::text)`),
    uniqueIndex("recovery_token_idx")
      .using("btree", table.recoveryToken.asc().nullsLast())
      .where(sql`((recovery_token)::text !~ '^[0-9 ]*$'::text)`),
    uniqueIndex("users_email_partial_key")
      .using("btree", table.email.asc().nullsLast())
      .where(sql`(is_sso_user = false)`),
    index("users_instance_id_email_idx").using(
      "btree",
      table.instanceId.asc().nullsLast(),
      sql`lower((email)::text)`,
    ),
    index("users_instance_id_idx").using(
      "btree",
      table.instanceId.asc().nullsLast(),
    ),
    index("users_is_anonymous_idx").using(
      "btree",
      table.isAnonymous.asc().nullsLast(),
    ),
    unique("users_phone_key").on(table.phone),
    check(
      "users_email_change_confirm_status_check",
      sql`((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2))`,
    ),
  ],
);

export const webauthnChallengesInAuth = auth.table(
  "webauthn_challenges",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => usersInAuth.id, {
      onDelete: "cascade",
    }),
    challengeType: text("challenge_type").notNull(),
    sessionData: jsonb("session_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("webauthn_challenges_expires_at_idx").using(
      "btree",
      table.expiresAt.asc().nullsLast(),
    ),
    index("webauthn_challenges_user_id_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
    check(
      "webauthn_challenges_challenge_type_check",
      sql`(challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text]))`,
    ),
  ],
);

export const webauthnCredentialsInAuth = auth.table(
  "webauthn_credentials",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersInAuth.id, { onDelete: "cascade" }),
    credentialId: customType({ dataType: () => "bytea" })(
      "credential_id",
    ).notNull(),
    publicKey: customType({ dataType: () => "bytea" })("public_key").notNull(),
    attestationType: text("attestation_type").default("").notNull(),
    aaguid: uuid(),
    signCount: bigint("sign_count", { mode: "number" }).default(0).notNull(),
    transports: jsonb().default([]).notNull(),
    backupEligible: boolean("backup_eligible").default(false).notNull(),
    backedUp: boolean("backed_up").default(false).notNull(),
    friendlyName: text("friendly_name").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("webauthn_credentials_credential_id_key").using(
      "btree",
      table.credentialId.asc().nullsLast(),
    ),
    index("webauthn_credentials_user_id_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
  ],
);

export const httpResponseInNet = net.table(
  "_http_response",
  {
    id: bigint({ mode: "number" }),
    statusCode: integer("status_code"),
    contentType: text("content_type"),
    headers: jsonb(),
    content: text(),
    timedOut: boolean("timed_out"),
    errorMsg: text("error_msg"),
    created: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("_http_response_created_idx").using(
      "btree",
      table.created.asc().nullsLast(),
    ),
  ],
);

export const httpRequestQueueInNet = net.table("http_request_queue", {
  id: bigserial({ mode: "number" }).notNull(),
  method: customType({ dataType: () => "net.http_method" })().notNull(),
  url: text().notNull(),
  headers: jsonb(),
  body: customType({ dataType: () => "bytea" })(),
  timeoutMilliseconds: integer("timeout_milliseconds").notNull(),
});

export const messagesInRealtime = realtime.table.withRLS(
  "messages",
  {
    topic: text().notNull(),
    extension: text().notNull(),
    payload: jsonb(),
    event: text(),
    private: boolean().default(false),
    updatedAt: timestamp("updated_at")
      .default(sql`now()`)
      .notNull(),
    insertedAt: timestamp("inserted_at")
      .default(sql`now()`)
      .notNull(),
    id: uuid().defaultRandom().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.insertedAt],
      name: "messages_pkey",
    }),
  ],
);

export const messages20260428InRealtime = realtime.table(
  "messages_2026_04_28",
  {
    topic: text().notNull(),
    extension: text().notNull(),
    payload: jsonb(),
    event: text(),
    private: boolean().default(false),
    updatedAt: timestamp("updated_at")
      .default(sql`now()`)
      .notNull(),
    insertedAt: timestamp("inserted_at")
      .default(sql`now()`)
      .notNull(),
    id: uuid().defaultRandom().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.insertedAt],
      name: "messages_2026_04_28_pkey",
    }),
    index("messages_2026_04_28_inserted_at_topic_idx")
      .using(
        "btree",
        table.insertedAt.desc().nullsFirst(),
        table.topic.asc().nullsLast(),
      )
      .where(sql`((extension = 'broadcast'::text) AND (private IS TRUE))`),
  ],
);

export const messages20260429InRealtime = realtime.table(
  "messages_2026_04_29",
  {
    topic: text().notNull(),
    extension: text().notNull(),
    payload: jsonb(),
    event: text(),
    private: boolean().default(false),
    updatedAt: timestamp("updated_at")
      .default(sql`now()`)
      .notNull(),
    insertedAt: timestamp("inserted_at")
      .default(sql`now()`)
      .notNull(),
    id: uuid().defaultRandom().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.insertedAt],
      name: "messages_2026_04_29_pkey",
    }),
    index("messages_2026_04_29_inserted_at_topic_idx")
      .using(
        "btree",
        table.insertedAt.desc().nullsFirst(),
        table.topic.asc().nullsLast(),
      )
      .where(sql`((extension = 'broadcast'::text) AND (private IS TRUE))`),
  ],
);

export const messages20260430InRealtime = realtime.table(
  "messages_2026_04_30",
  {
    topic: text().notNull(),
    extension: text().notNull(),
    payload: jsonb(),
    event: text(),
    private: boolean().default(false),
    updatedAt: timestamp("updated_at")
      .default(sql`now()`)
      .notNull(),
    insertedAt: timestamp("inserted_at")
      .default(sql`now()`)
      .notNull(),
    id: uuid().defaultRandom().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.insertedAt],
      name: "messages_2026_04_30_pkey",
    }),
    index("messages_2026_04_30_inserted_at_topic_idx")
      .using(
        "btree",
        table.insertedAt.desc().nullsFirst(),
        table.topic.asc().nullsLast(),
      )
      .where(sql`((extension = 'broadcast'::text) AND (private IS TRUE))`),
  ],
);

export const messages20260501InRealtime = realtime.table(
  "messages_2026_05_01",
  {
    topic: text().notNull(),
    extension: text().notNull(),
    payload: jsonb(),
    event: text(),
    private: boolean().default(false),
    updatedAt: timestamp("updated_at")
      .default(sql`now()`)
      .notNull(),
    insertedAt: timestamp("inserted_at")
      .default(sql`now()`)
      .notNull(),
    id: uuid().defaultRandom().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.insertedAt],
      name: "messages_2026_05_01_pkey",
    }),
    index("messages_2026_05_01_inserted_at_topic_idx")
      .using(
        "btree",
        table.insertedAt.desc().nullsFirst(),
        table.topic.asc().nullsLast(),
      )
      .where(sql`((extension = 'broadcast'::text) AND (private IS TRUE))`),
  ],
);

export const messages20260502InRealtime = realtime.table(
  "messages_2026_05_02",
  {
    topic: text().notNull(),
    extension: text().notNull(),
    payload: jsonb(),
    event: text(),
    private: boolean().default(false),
    updatedAt: timestamp("updated_at")
      .default(sql`now()`)
      .notNull(),
    insertedAt: timestamp("inserted_at")
      .default(sql`now()`)
      .notNull(),
    id: uuid().defaultRandom().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.insertedAt],
      name: "messages_2026_05_02_pkey",
    }),
    index("messages_2026_05_02_inserted_at_topic_idx")
      .using(
        "btree",
        table.insertedAt.desc().nullsFirst(),
        table.topic.asc().nullsLast(),
      )
      .where(sql`((extension = 'broadcast'::text) AND (private IS TRUE))`),
  ],
);

export const messages20260503InRealtime = realtime.table(
  "messages_2026_05_03",
  {
    topic: text().notNull(),
    extension: text().notNull(),
    payload: jsonb(),
    event: text(),
    private: boolean().default(false),
    updatedAt: timestamp("updated_at")
      .default(sql`now()`)
      .notNull(),
    insertedAt: timestamp("inserted_at")
      .default(sql`now()`)
      .notNull(),
    id: uuid().defaultRandom().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.insertedAt],
      name: "messages_2026_05_03_pkey",
    }),
    index("messages_2026_05_03_inserted_at_topic_idx")
      .using(
        "btree",
        table.insertedAt.desc().nullsFirst(),
        table.topic.asc().nullsLast(),
      )
      .where(sql`((extension = 'broadcast'::text) AND (private IS TRUE))`),
  ],
);

export const messages20260504InRealtime = realtime.table(
  "messages_2026_05_04",
  {
    topic: text().notNull(),
    extension: text().notNull(),
    payload: jsonb(),
    event: text(),
    private: boolean().default(false),
    updatedAt: timestamp("updated_at")
      .default(sql`now()`)
      .notNull(),
    insertedAt: timestamp("inserted_at")
      .default(sql`now()`)
      .notNull(),
    id: uuid().defaultRandom().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.insertedAt],
      name: "messages_2026_05_04_pkey",
    }),
    index("messages_2026_05_04_inserted_at_topic_idx")
      .using(
        "btree",
        table.insertedAt.desc().nullsFirst(),
        table.topic.asc().nullsLast(),
      )
      .where(sql`((extension = 'broadcast'::text) AND (private IS TRUE))`),
  ],
);

export const schemaMigrationsInRealtime = realtime.table("schema_migrations", {
  version: bigint({ mode: "number" }).primaryKey(),
  insertedAt: timestamp("inserted_at", { precision: 0 }),
});

export const subscriptionInRealtime = realtime.table(
  "subscription",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    subscriptionId: uuid("subscription_id").notNull(),
    entity: customType({ dataType: () => "regclass" })().notNull(),
    filters: customType({ dataType: () => "realtime.user_defined_filter" })()
      .array()
      .default([])
      .notNull(),
    claims: jsonb().notNull(),
    claimsRole: customType({ dataType: () => "regrole" })("claims_role")
      .notNull()
      .generatedAlwaysAs(sql`realtime.to_regrole((claims ->> 'role'::text))`),
    createdAt: timestamp("created_at")
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    actionFilter: text("action_filter").default("*"),
  },
  (table) => [
    index("ix_realtime_subscription_entity").using(
      "btree",
      table.entity.asc().nullsLast(),
    ),
    uniqueIndex(
      "subscription_subscription_id_entity_filters_action_filter_key",
    ).using(
      "btree",
      table.subscriptionId.asc().nullsLast(),
      table.entity.asc().nullsLast(),
      table.filters.asc().nullsLast(),
      table.actionFilter.asc().nullsLast(),
    ),
    check(
      "subscription_action_filter_check",
      sql`(action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text]))`,
    ),
  ],
);

export const bucketsInStorage = storage.table.withRLS(
  "buckets",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    owner: uuid(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(
      sql`now()`,
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(
      sql`now()`,
    ),
    public: boolean().default(false),
    avifAutodetection: boolean("avif_autodetection").default(false),
    fileSizeLimit: bigint("file_size_limit", { mode: "number" }),
    allowedMimeTypes: text("allowed_mime_types").array(),
    ownerId: text("owner_id"),
    type: buckettypeInStorage().default("STANDARD").notNull(),
  },
  (table) => [
    uniqueIndex("bname").using("btree", table.name.asc().nullsLast()),
  ],
);

export const bucketsAnalyticsInStorage = storage.table.withRLS(
  "buckets_analytics",
  {
    name: text().notNull(),
    type: buckettypeInStorage().default("ANALYTICS").notNull(),
    format: text().default("ICEBERG").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    id: uuid().defaultRandom().primaryKey(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("buckets_analytics_unique_name_idx")
      .using("btree", table.name.asc().nullsLast())
      .where(sql`(deleted_at IS NULL)`),
  ],
);

export const bucketsVectorsInStorage = storage.table.withRLS(
  "buckets_vectors",
  {
    id: text().primaryKey(),
    type: buckettypeInStorage().default("VECTOR").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
);

export const icebergNamespacesInStorage = storage.table.withRLS(
  "iceberg_namespaces",
  {
    id: uuid().defaultRandom().primaryKey(),
    bucketName: text("bucket_name").notNull(),
    name: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    metadata: jsonb().default({}).notNull(),
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => bucketsAnalyticsInStorage.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("idx_iceberg_namespaces_bucket_id").using(
      "btree",
      table.catalogId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
);

export const icebergTablesInStorage = storage.table.withRLS(
  "iceberg_tables",
  {
    id: uuid().defaultRandom().primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => icebergNamespacesInStorage.id, { onDelete: "cascade" }),
    bucketName: text("bucket_name").notNull(),
    name: text().notNull(),
    location: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    remoteTableId: text("remote_table_id"),
    shardKey: text("shard_key"),
    shardId: text("shard_id"),
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => bucketsAnalyticsInStorage.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("idx_iceberg_tables_location").using(
      "btree",
      table.location.asc().nullsLast(),
    ),
    uniqueIndex("idx_iceberg_tables_namespace_id").using(
      "btree",
      table.catalogId.asc().nullsLast(),
      table.namespaceId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
);

export const migrationsInStorage = storage.table.withRLS(
  "migrations",
  {
    id: integer().primaryKey(),
    name: varchar({ length: 100 }).notNull(),
    hash: varchar({ length: 40 }).notNull(),
    executedAt: timestamp("executed_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [unique("migrations_name_key").on(table.name)],
);

export const objectsInStorage = storage.table.withRLS(
  "objects",
  {
    id: uuid().defaultRandom().primaryKey(),
    bucketId: text("bucket_id").references(() => bucketsInStorage.id),
    name: text(),
    owner: uuid(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(
      sql`now()`,
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(
      sql`now()`,
    ),
    lastAccessedAt: timestamp("last_accessed_at", {
      withTimezone: true,
    }).default(sql`now()`),
    metadata: jsonb(),
    pathTokens: text("path_tokens")
      .array()
      .generatedAlwaysAs(sql`string_to_array(name, '/'::text)`),
    version: text(),
    ownerId: text("owner_id"),
    userMetadata: jsonb("user_metadata"),
  },
  (table) => [
    uniqueIndex("bucketid_objname").using(
      "btree",
      table.bucketId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
    index("idx_objects_bucket_id_name").using(
      "btree",
      table.bucketId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
    index("idx_objects_bucket_id_name_lower").using(
      "btree",
      table.bucketId.asc().nullsLast(),
      sql`lower(name)`,
    ),
    index("name_prefix_search").using(
      "btree",
      table.name.asc().nullsLast().op("text_pattern_ops"),
    ),
  ],
);

export const s3MultipartUploadsInStorage = storage.table.withRLS(
  "s3_multipart_uploads",
  {
    id: text().primaryKey(),
    inProgressSize: bigint("in_progress_size", { mode: "number" })
      .default(0)
      .notNull(),
    uploadSignature: text("upload_signature").notNull(),
    bucketId: text("bucket_id")
      .notNull()
      .references(() => bucketsInStorage.id),
    key: text().notNull(),
    version: text().notNull(),
    ownerId: text("owner_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    userMetadata: jsonb("user_metadata"),
    metadata: jsonb(),
  },
  (table) => [
    index("idx_multipart_uploads_list").using(
      "btree",
      table.bucketId.asc().nullsLast(),
      table.key.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
    ),
  ],
);

export const s3MultipartUploadsPartsInStorage = storage.table.withRLS(
  "s3_multipart_uploads_parts",
  {
    id: uuid().defaultRandom().primaryKey(),
    uploadId: text("upload_id")
      .notNull()
      .references(() => s3MultipartUploadsInStorage.id, {
        onDelete: "cascade",
      }),
    size: bigint({ mode: "number" }).default(0).notNull(),
    partNumber: integer("part_number").notNull(),
    bucketId: text("bucket_id")
      .notNull()
      .references(() => bucketsInStorage.id),
    key: text().notNull(),
    etag: text().notNull(),
    ownerId: text("owner_id"),
    version: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
);

export const vectorIndexesInStorage = storage.table.withRLS(
  "vector_indexes",
  {
    id: text()
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    name: text().notNull(),
    bucketId: text("bucket_id")
      .notNull()
      .references(() => bucketsVectorsInStorage.id),
    dataType: text("data_type").notNull(),
    dimension: integer().notNull(),
    distanceMetric: text("distance_metric").notNull(),
    metadataConfiguration: jsonb("metadata_configuration"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("vector_indexes_name_bucket_id_idx").using(
      "btree",
      table.name.asc().nullsLast(),
      table.bucketId.asc().nullsLast(),
    ),
  ],
);

export const hooksInSupabaseFunctions = supabaseFunctions.table(
  "hooks",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    hookTableId: integer("hook_table_id").notNull(),
    hookName: text("hook_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    requestId: bigint("request_id", { mode: "number" }),
  },
  (table) => [
    index("supabase_functions_hooks_h_table_id_h_name_idx").using(
      "btree",
      table.hookTableId.asc().nullsLast(),
      table.hookName.asc().nullsLast(),
    ),
    index("supabase_functions_hooks_request_id_idx").using(
      "btree",
      table.requestId.asc().nullsLast(),
    ),
  ],
);

export const migrationsInSupabaseFunctions = supabaseFunctions.table(
  "migrations",
  {
    version: text().primaryKey(),
    insertedAt: timestamp("inserted_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
);

export const secretsInVault = vault.table(
  "secrets",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text(),
    description: text().default("").notNull(),
    secret: text().notNull(),
    keyId: uuid("key_id"),
    nonce: customType({ dataType: () => "bytea" })().default(
      "vault._crypto_aead_det_noncegen()",
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("secrets_name_idx")
      .using("btree", table.name.asc().nullsLast())
      .where(sql`(name IS NOT NULL)`),
  ],
);
export const pgStatStatementsInExtensions = extensions
  .view("pg_stat_statements", {
    userid: customType({ dataType: () => "oid" })(),
    dbid: customType({ dataType: () => "oid" })(),
    toplevel: boolean(),
    queryid: bigint({ mode: "number" }),
    query: text(),
    plans: bigint({ mode: "number" }),
    totalPlanTime: doublePrecision("total_plan_time"),
    minPlanTime: doublePrecision("min_plan_time"),
    maxPlanTime: doublePrecision("max_plan_time"),
    meanPlanTime: doublePrecision("mean_plan_time"),
    stddevPlanTime: doublePrecision("stddev_plan_time"),
    calls: bigint({ mode: "number" }),
    totalExecTime: doublePrecision("total_exec_time"),
    minExecTime: doublePrecision("min_exec_time"),
    maxExecTime: doublePrecision("max_exec_time"),
    meanExecTime: doublePrecision("mean_exec_time"),
    stddevExecTime: doublePrecision("stddev_exec_time"),
    rows: bigint({ mode: "number" }),
    sharedBlksHit: bigint("shared_blks_hit", { mode: "number" }),
    sharedBlksRead: bigint("shared_blks_read", { mode: "number" }),
    sharedBlksDirtied: bigint("shared_blks_dirtied", { mode: "number" }),
    sharedBlksWritten: bigint("shared_blks_written", { mode: "number" }),
    localBlksHit: bigint("local_blks_hit", { mode: "number" }),
    localBlksRead: bigint("local_blks_read", { mode: "number" }),
    localBlksDirtied: bigint("local_blks_dirtied", { mode: "number" }),
    localBlksWritten: bigint("local_blks_written", { mode: "number" }),
    tempBlksRead: bigint("temp_blks_read", { mode: "number" }),
    tempBlksWritten: bigint("temp_blks_written", { mode: "number" }),
    sharedBlkReadTime: doublePrecision("shared_blk_read_time"),
    sharedBlkWriteTime: doublePrecision("shared_blk_write_time"),
    localBlkReadTime: doublePrecision("local_blk_read_time"),
    localBlkWriteTime: doublePrecision("local_blk_write_time"),
    tempBlkReadTime: doublePrecision("temp_blk_read_time"),
    tempBlkWriteTime: doublePrecision("temp_blk_write_time"),
    walRecords: bigint("wal_records", { mode: "number" }),
    walFpi: bigint("wal_fpi", { mode: "number" }),
    walBytes: numeric("wal_bytes"),
    jitFunctions: bigint("jit_functions", { mode: "number" }),
    jitGenerationTime: doublePrecision("jit_generation_time"),
    jitInliningCount: bigint("jit_inlining_count", { mode: "number" }),
    jitInliningTime: doublePrecision("jit_inlining_time"),
    jitOptimizationCount: bigint("jit_optimization_count", { mode: "number" }),
    jitOptimizationTime: doublePrecision("jit_optimization_time"),
    jitEmissionCount: bigint("jit_emission_count", { mode: "number" }),
    jitEmissionTime: doublePrecision("jit_emission_time"),
    jitDeformCount: bigint("jit_deform_count", { mode: "number" }),
    jitDeformTime: doublePrecision("jit_deform_time"),
    statsSince: timestamp("stats_since", { withTimezone: true }),
    minmaxStatsSince: timestamp("minmax_stats_since", { withTimezone: true }),
  })
  .as(
    sql`SELECT userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time, max_plan_time, mean_plan_time, stddev_plan_time, calls, total_exec_time, min_exec_time, max_exec_time, mean_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written, local_blks_hit, local_blks_read, local_blks_dirtied, local_blks_written, temp_blks_read, temp_blks_written, shared_blk_read_time, shared_blk_write_time, local_blk_read_time, local_blk_write_time, temp_blk_read_time, temp_blk_write_time, wal_records, wal_fpi, wal_bytes, jit_functions, jit_generation_time, jit_inlining_count, jit_inlining_time, jit_optimization_count, jit_optimization_time, jit_emission_count, jit_emission_time, jit_deform_count, jit_deform_time, stats_since, minmax_stats_since FROM pg_stat_statements(true) pg_stat_statements(userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time, max_plan_time, mean_plan_time, stddev_plan_time, calls, total_exec_time, min_exec_time, max_exec_time, mean_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written, local_blks_hit, local_blks_read, local_blks_dirtied, local_blks_written, temp_blks_read, temp_blks_written, shared_blk_read_time, shared_blk_write_time, local_blk_read_time, local_blk_write_time, temp_blk_read_time, temp_blk_write_time, wal_records, wal_fpi, wal_bytes, jit_functions, jit_generation_time, jit_inlining_count, jit_inlining_time, jit_optimization_count, jit_optimization_time, jit_emission_count, jit_emission_time, jit_deform_count, jit_deform_time, stats_since, minmax_stats_since)`,
  );

export const pgStatStatementsInfoInExtensions = extensions
  .view("pg_stat_statements_info", {
    dealloc: bigint({ mode: "number" }),
    statsReset: timestamp("stats_reset", { withTimezone: true }),
  })
  .as(
    sql`SELECT dealloc, stats_reset FROM pg_stat_statements_info() pg_stat_statements_info(dealloc, stats_reset)`,
  );

export const decryptedSecretsInVault = vault
  .view("decrypted_secrets", {
    id: uuid(),
    name: text(),
    description: text(),
    secret: text(),
    decryptedSecret: text("decrypted_secret"),
    keyId: uuid("key_id"),
    nonce: customType({ dataType: () => "bytea" })(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  })
  .as(
    sql`SELECT id, name, description, secret, convert_from(vault._crypto_aead_det_decrypt(message => decode(secret, 'base64'::text), additional => convert_to(id::text, 'utf8'::name), key_id => 0::bigint, context => '\x7067736f6469756d'::bytea, nonce => nonce), 'utf8'::name) AS decrypted_secret, key_id, nonce, created_at, updated_at FROM vault.secrets s`,
  );
