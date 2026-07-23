-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE SCHEMA "_realtime";
--> statement-breakpoint
CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE SCHEMA "extensions";
--> statement-breakpoint
CREATE SCHEMA "graphql";
--> statement-breakpoint
CREATE SCHEMA "graphql_public";
--> statement-breakpoint
CREATE SCHEMA "net";
--> statement-breakpoint
CREATE SCHEMA "pgbouncer";
--> statement-breakpoint
CREATE SCHEMA "realtime";
--> statement-breakpoint
CREATE SCHEMA "storage";
--> statement-breakpoint
CREATE SCHEMA "supabase_functions";
--> statement-breakpoint
CREATE SCHEMA "vault";
--> statement-breakpoint
CREATE TYPE "net"."request_status" AS ENUM('PENDING', 'SUCCESS', 'ERROR');--> statement-breakpoint
CREATE TYPE "storage"."buckettype" AS ENUM('STANDARD', 'ANALYTICS', 'VECTOR');--> statement-breakpoint
CREATE TYPE "auth"."factor_type" AS ENUM('totp', 'webauthn', 'phone');--> statement-breakpoint
CREATE TYPE "auth"."factor_status" AS ENUM('unverified', 'verified');--> statement-breakpoint
CREATE TYPE "auth"."aal_level" AS ENUM('aal1', 'aal2', 'aal3');--> statement-breakpoint
CREATE TYPE "auth"."code_challenge_method" AS ENUM('s256', 'plain');--> statement-breakpoint
CREATE TYPE "auth"."one_time_token_type" AS ENUM('confirmation_token', 'reauthentication_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current', 'phone_change_token');--> statement-breakpoint
CREATE TYPE "auth"."oauth_registration_type" AS ENUM('dynamic', 'manual');--> statement-breakpoint
CREATE TYPE "auth"."oauth_authorization_status" AS ENUM('pending', 'approved', 'denied', 'expired');--> statement-breakpoint
CREATE TYPE "auth"."oauth_response_type" AS ENUM('code');--> statement-breakpoint
CREATE TYPE "auth"."oauth_client_type" AS ENUM('public', 'confidential');--> statement-breakpoint
CREATE TYPE "oauthClientType" AS ENUM('development', 'production');--> statement-breakpoint
CREATE SEQUENCE "graphql"."seq_schema_version" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 CYCLE;--> statement-breakpoint
CREATE TABLE "auth"."audit_log_entries" (
	"instance_id" uuid,
	"id" uuid PRIMARY KEY,
	"payload" json,
	"created_at" timestamp with time zone,
	"ip_address" varchar(64) DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."audit_log_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."custom_oauth_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"provider_type" text NOT NULL,
	"identifier" text NOT NULL CONSTRAINT "custom_oauth_providers_identifier_key" UNIQUE,
	"name" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"acceptable_client_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"pkce_enabled" boolean DEFAULT true NOT NULL,
	"attribute_mapping" jsonb DEFAULT '{}' NOT NULL,
	"authorization_params" jsonb DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"email_optional" boolean DEFAULT false NOT NULL,
	"issuer" text,
	"discovery_url" text,
	"skip_nonce_check" boolean DEFAULT false NOT NULL,
	"cached_discovery" jsonb,
	"discovery_cached_at" timestamp with time zone,
	"authorization_url" text,
	"token_url" text,
	"userinfo_url" text,
	"jwks_uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_oauth_providers_authorization_url_https" CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
	CONSTRAINT "custom_oauth_providers_authorization_url_length" CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
	CONSTRAINT "custom_oauth_providers_client_id_length" CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
	CONSTRAINT "custom_oauth_providers_discovery_url_length" CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
	CONSTRAINT "custom_oauth_providers_identifier_format" CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
	CONSTRAINT "custom_oauth_providers_issuer_length" CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
	CONSTRAINT "custom_oauth_providers_jwks_uri_https" CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
	CONSTRAINT "custom_oauth_providers_jwks_uri_length" CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
	CONSTRAINT "custom_oauth_providers_name_length" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
	CONSTRAINT "custom_oauth_providers_oauth2_requires_endpoints" CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
	CONSTRAINT "custom_oauth_providers_oidc_discovery_url_https" CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
	CONSTRAINT "custom_oauth_providers_oidc_issuer_https" CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
	CONSTRAINT "custom_oauth_providers_oidc_requires_issuer" CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
	CONSTRAINT "custom_oauth_providers_provider_type_check" CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
	CONSTRAINT "custom_oauth_providers_token_url_https" CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
	CONSTRAINT "custom_oauth_providers_token_url_length" CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
	CONSTRAINT "custom_oauth_providers_userinfo_url_https" CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
	CONSTRAINT "custom_oauth_providers_userinfo_url_length" CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);
--> statement-breakpoint
CREATE TABLE "auth"."flow_state" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid,
	"auth_code" text,
	"code_challenge_method" "auth"."code_challenge_method",
	"code_challenge" text,
	"provider_type" text NOT NULL,
	"provider_access_token" text,
	"provider_refresh_token" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"authentication_method" text NOT NULL,
	"auth_code_issued_at" timestamp with time zone,
	"invite_token" text,
	"referrer" text,
	"oauth_client_state_id" uuid,
	"linking_target_id" uuid,
	"email_optional" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."flow_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."identities" (
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"identity_data" jsonb NOT NULL,
	"provider" text NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"email" text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	CONSTRAINT "identities_provider_id_provider_unique" UNIQUE("provider_id","provider")
);
--> statement-breakpoint
ALTER TABLE "auth"."identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."instances" (
	"id" uuid PRIMARY KEY,
	"uuid" uuid,
	"raw_base_config" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth"."instances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."mfa_amr_claims" (
	"session_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"authentication_method" text NOT NULL,
	"id" uuid,
	CONSTRAINT "amr_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "mfa_amr_claims_session_id_authentication_method_pkey" UNIQUE("session_id","authentication_method")
);
--> statement-breakpoint
ALTER TABLE "auth"."mfa_amr_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."mfa_challenges" (
	"id" uuid PRIMARY KEY,
	"factor_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"ip_address" inet NOT NULL,
	"otp_code" text,
	"web_authn_session_data" jsonb
);
--> statement-breakpoint
ALTER TABLE "auth"."mfa_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."mfa_factors" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"friendly_name" text,
	"factor_type" "auth"."factor_type" NOT NULL,
	"status" "auth"."factor_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"secret" text,
	"phone" text,
	"last_challenged_at" timestamp with time zone CONSTRAINT "mfa_factors_last_challenged_at_key" UNIQUE,
	"web_authn_credential" jsonb,
	"web_authn_aaguid" uuid,
	"last_webauthn_challenge_data" jsonb
);
--> statement-breakpoint
ALTER TABLE "auth"."mfa_factors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."oauth_authorizations" (
	"id" uuid PRIMARY KEY,
	"authorization_id" text NOT NULL CONSTRAINT "oauth_authorizations_authorization_id_key" UNIQUE,
	"client_id" uuid NOT NULL,
	"user_id" uuid,
	"redirect_uri" text NOT NULL,
	"scope" text NOT NULL,
	"state" text,
	"resource" text,
	"code_challenge" text,
	"code_challenge_method" "auth"."code_challenge_method",
	"response_type" "auth"."oauth_response_type" DEFAULT 'code'::"auth"."oauth_response_type" NOT NULL,
	"status" "auth"."oauth_authorization_status" DEFAULT 'pending'::"auth"."oauth_authorization_status" NOT NULL,
	"authorization_code" text CONSTRAINT "oauth_authorizations_authorization_code_key" UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
	"approved_at" timestamp with time zone,
	"nonce" text,
	CONSTRAINT "oauth_authorizations_authorization_code_length" CHECK ((char_length(authorization_code) <= 255)),
	CONSTRAINT "oauth_authorizations_code_challenge_length" CHECK ((char_length(code_challenge) <= 128)),
	CONSTRAINT "oauth_authorizations_expires_at_future" CHECK ((expires_at > created_at)),
	CONSTRAINT "oauth_authorizations_nonce_length" CHECK ((char_length(nonce) <= 255)),
	CONSTRAINT "oauth_authorizations_redirect_uri_length" CHECK ((char_length(redirect_uri) <= 2048)),
	CONSTRAINT "oauth_authorizations_resource_length" CHECK ((char_length(resource) <= 2048)),
	CONSTRAINT "oauth_authorizations_scope_length" CHECK ((char_length(scope) <= 4096)),
	CONSTRAINT "oauth_authorizations_state_length" CHECK ((char_length(state) <= 4096))
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_client_states" (
	"id" uuid PRIMARY KEY,
	"provider_type" text NOT NULL,
	"code_verifier" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_clients" (
	"id" uuid PRIMARY KEY,
	"client_secret_hash" text,
	"registration_type" "auth"."oauth_registration_type" NOT NULL,
	"redirect_uris" text NOT NULL,
	"grant_types" text NOT NULL,
	"client_name" text,
	"client_uri" text,
	"logo_uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"client_type" "auth"."oauth_client_type" DEFAULT 'confidential'::"auth"."oauth_client_type" NOT NULL,
	"token_endpoint_auth_method" text NOT NULL,
	CONSTRAINT "oauth_clients_client_name_length" CHECK ((char_length(client_name) <= 1024)),
	CONSTRAINT "oauth_clients_client_uri_length" CHECK ((char_length(client_uri) <= 2048)),
	CONSTRAINT "oauth_clients_logo_uri_length" CHECK ((char_length(logo_uri) <= 2048)),
	CONSTRAINT "oauth_clients_token_endpoint_auth_method_check" CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_consents" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"scopes" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "oauth_consents_user_client_unique" UNIQUE("user_id","client_id"),
	CONSTRAINT "oauth_consents_revoked_after_granted" CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
	CONSTRAINT "oauth_consents_scopes_length" CHECK ((char_length(scopes) <= 2048)),
	CONSTRAINT "oauth_consents_scopes_not_empty" CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);
--> statement-breakpoint
CREATE TABLE "auth"."one_time_tokens" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"token_type" "auth"."one_time_token_type" NOT NULL,
	"token_hash" text NOT NULL,
	"relates_to" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "one_time_tokens_token_hash_check" CHECK ((char_length(token_hash) > 0))
);
--> statement-breakpoint
ALTER TABLE "auth"."one_time_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."refresh_tokens" (
	"instance_id" uuid,
	"id" bigserial PRIMARY KEY,
	"token" varchar(255) CONSTRAINT "refresh_tokens_token_unique" UNIQUE,
	"user_id" varchar(255),
	"revoked" boolean,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"parent" varchar(255),
	"session_id" uuid
);
--> statement-breakpoint
ALTER TABLE "auth"."refresh_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."saml_providers" (
	"id" uuid PRIMARY KEY,
	"sso_provider_id" uuid NOT NULL,
	"entity_id" text NOT NULL CONSTRAINT "saml_providers_entity_id_key" UNIQUE,
	"metadata_xml" text NOT NULL,
	"metadata_url" text,
	"attribute_mapping" jsonb,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"name_id_format" text,
	CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
	CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
	CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);
--> statement-breakpoint
ALTER TABLE "auth"."saml_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."saml_relay_states" (
	"id" uuid PRIMARY KEY,
	"sso_provider_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"for_email" text,
	"redirect_to" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"flow_state_id" uuid,
	CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);
--> statement-breakpoint
ALTER TABLE "auth"."saml_relay_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."schema_migrations" (
	"version" varchar(255) PRIMARY KEY
);
--> statement-breakpoint
ALTER TABLE "auth"."schema_migrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."sessions" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"factor_id" uuid,
	"aal" "auth"."aal_level",
	"not_after" timestamp with time zone,
	"refreshed_at" timestamp,
	"user_agent" text,
	"ip" inet,
	"tag" text,
	"oauth_client_id" uuid,
	"refresh_token_hmac_key" text,
	"refresh_token_counter" bigint,
	"scopes" text,
	CONSTRAINT "sessions_scopes_length" CHECK ((char_length(scopes) <= 4096))
);
--> statement-breakpoint
ALTER TABLE "auth"."sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."sso_domains" (
	"id" uuid PRIMARY KEY,
	"sso_provider_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);
--> statement-breakpoint
ALTER TABLE "auth"."sso_domains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."sso_providers" (
	"id" uuid PRIMARY KEY,
	"resource_id" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"disabled" boolean,
	CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);
--> statement-breakpoint
ALTER TABLE "auth"."sso_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"instance_id" uuid,
	"id" uuid PRIMARY KEY,
	"aud" varchar(255),
	"role" varchar(255),
	"email" varchar(255),
	"encrypted_password" varchar(255),
	"email_confirmed_at" timestamp with time zone,
	"invited_at" timestamp with time zone,
	"confirmation_token" varchar(255),
	"confirmation_sent_at" timestamp with time zone,
	"recovery_token" varchar(255),
	"recovery_sent_at" timestamp with time zone,
	"email_change_token_new" varchar(255),
	"email_change" varchar(255),
	"email_change_sent_at" timestamp with time zone,
	"last_sign_in_at" timestamp with time zone,
	"raw_app_meta_data" jsonb,
	"raw_user_meta_data" jsonb,
	"is_super_admin" boolean,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"phone" text DEFAULT NULL CONSTRAINT "users_phone_key" UNIQUE,
	"phone_confirmed_at" timestamp with time zone,
	"phone_change" text DEFAULT '',
	"phone_change_token" varchar(255) DEFAULT '',
	"phone_change_sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
	"email_change_token_current" varchar(255) DEFAULT '',
	"email_change_confirm_status" smallint DEFAULT 0,
	"banned_until" timestamp with time zone,
	"reauthentication_token" varchar(255) DEFAULT '',
	"reauthentication_sent_at" timestamp with time zone,
	"is_sso_user" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_change_confirm_status_check" CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);
--> statement-breakpoint
ALTER TABLE "auth"."users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid,
	"challenge_type" text NOT NULL,
	"session_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "webauthn_challenges_challenge_type_check" CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);
--> statement-breakpoint
CREATE TABLE "auth"."webauthn_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"credential_id" bytea NOT NULL,
	"public_key" bytea NOT NULL,
	"attestation_type" text DEFAULT '' NOT NULL,
	"aaguid" uuid,
	"sign_count" bigint DEFAULT 0 NOT NULL,
	"transports" jsonb DEFAULT '[]' NOT NULL,
	"backup_eligible" boolean DEFAULT false NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"friendly_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "net"."_http_response" (
	"id" bigint,
	"status_code" integer,
	"content_type" text,
	"headers" jsonb,
	"content" text,
	"timed_out" boolean,
	"error_msg" text,
	"created" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net"."http_request_queue" (
	"id" bigserial,
	"method" net.http_method NOT NULL,
	"url" text NOT NULL,
	"headers" jsonb,
	"body" bytea,
	"timeout_milliseconds" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboardProfiles" (
	"githubId" varchar(255),
	"githubLogin" varchar(255) NOT NULL CONSTRAINT "leaderboard_profile_githubLogin_key" UNIQUE,
	"avatarUrl" text,
	"allTimePoints" integer DEFAULT 0 NOT NULL,
	"allTimeRanking" integer,
	"currentYearPoints" integer DEFAULT 0 NOT NULL,
	"currentYearRanking" integer,
	CONSTRAINT "leaderboard_profile_pkey" PRIMARY KEY("githubId")
);
--> statement-breakpoint
ALTER TABLE "leaderboardProfiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauthRegistrations" (
	"userId" uuid,
	"clientId" varchar(255) NOT NULL CONSTRAINT "profile_oauth_client_client_id_key" UNIQUE,
	"type" "oauthClientType" DEFAULT 'development'::"oauthClientType" NOT NULL,
	CONSTRAINT "profile_oauth_client_pkey" PRIMARY KEY("userId")
);
--> statement-breakpoint
ALTER TABLE "oauthRegistrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauthTestAccounts" (
	"authUserId" uuid PRIMARY KEY,
	"clientId" varchar(255) NOT NULL,
	"displayName" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauthTestAccounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "points" (
	"year" integer,
	"streakStart" date NOT NULL,
	"streakLength" integer DEFAULT 0 NOT NULL,
	"longestStreakLength" integer DEFAULT 0 NOT NULL,
	"projectPoints" integer DEFAULT 0 NOT NULL,
	"streakBonusPoints" integer DEFAULT 0 NOT NULL,
	"academyPoints" integer DEFAULT 0 NOT NULL,
	"points" integer GENERATED ALWAYS AS ((("projectPoints" + "streakBonusPoints") + "academyPoints")) STORED NOT NULL,
	"leaderboardProfileId" varchar(255),
	CONSTRAINT "points_pkey" PRIMARY KEY("leaderboardProfileId","year")
);
--> statement-breakpoint
ALTER TABLE "points" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profile" (
	"userId" uuid PRIMARY KEY,
	"preferredName" varchar(255) NOT NULL,
	"showGithub" boolean DEFAULT false NOT NULL,
	"showDiscord" boolean DEFAULT false NOT NULL,
	"viewedSettings" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profileLinks" (
	"id" uuid DEFAULT gen_random_uuid(),
	"userId" uuid NOT NULL,
	"url" text NOT NULL,
	"title" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "profile_link_pkey" PRIMARY KEY("id")
);
--> statement-breakpoint
ALTER TABLE "profileLinks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storage"."buckets" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"owner" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"public" boolean DEFAULT false,
	"avif_autodetection" boolean DEFAULT false,
	"file_size_limit" bigint,
	"allowed_mime_types" text[],
	"owner_id" text,
	"type" "storage"."buckettype" DEFAULT 'STANDARD'::"storage"."buckettype" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storage"."buckets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storage"."buckets_analytics" (
	"name" text NOT NULL,
	"type" "storage"."buckettype" DEFAULT 'ANALYTICS'::"storage"."buckettype" NOT NULL,
	"format" text DEFAULT 'ICEBERG' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "storage"."buckets_analytics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storage"."buckets_vectors" (
	"id" text PRIMARY KEY,
	"type" "storage"."buckettype" DEFAULT 'VECTOR'::"storage"."buckettype" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storage"."buckets_vectors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storage"."iceberg_namespaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"bucket_name" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"catalog_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storage"."iceberg_namespaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storage"."iceberg_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"namespace_id" uuid NOT NULL,
	"bucket_name" text NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"remote_table_id" text,
	"shard_key" text,
	"shard_id" text,
	"catalog_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storage"."iceberg_tables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storage"."migrations" (
	"id" integer PRIMARY KEY,
	"name" varchar(100) NOT NULL CONSTRAINT "migrations_name_key" UNIQUE,
	"hash" varchar(40) NOT NULL,
	"executed_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE "storage"."migrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storage"."objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"bucket_id" text,
	"name" text,
	"owner" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"last_accessed_at" timestamp with time zone DEFAULT now(),
	"metadata" jsonb,
	"path_tokens" text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
	"version" text,
	"owner_id" text,
	"user_metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storage"."s3_multipart_uploads" (
	"id" text PRIMARY KEY,
	"in_progress_size" bigint DEFAULT 0 NOT NULL,
	"upload_signature" text NOT NULL,
	"bucket_id" text NOT NULL,
	"key" text NOT NULL,
	"version" text NOT NULL,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_metadata" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "storage"."s3_multipart_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storage"."s3_multipart_uploads_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"upload_id" text NOT NULL,
	"size" bigint DEFAULT 0 NOT NULL,
	"part_number" integer NOT NULL,
	"bucket_id" text NOT NULL,
	"key" text NOT NULL,
	"etag" text NOT NULL,
	"owner_id" text,
	"version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storage"."s3_multipart_uploads_parts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storage"."vector_indexes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"bucket_id" text NOT NULL,
	"data_type" text NOT NULL,
	"dimension" integer NOT NULL,
	"distance_metric" text NOT NULL,
	"metadata_configuration" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storage"."vector_indexes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supabase_functions"."hooks" (
	"id" bigserial PRIMARY KEY,
	"hook_table_id" integer NOT NULL,
	"hook_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" bigint
);
--> statement-breakpoint
CREATE TABLE "supabase_functions"."migrations" (
	"version" text PRIMARY KEY,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault"."secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text,
	"description" text DEFAULT '' NOT NULL,
	"secret" text NOT NULL,
	"key_id" uuid,
	"nonce" bytea DEFAULT vault._crypto_aead_det_noncegen(),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_logs_instance_id_idx" ON "auth"."audit_log_entries" ("instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "confirmation_token_idx" ON "auth"."users" ("confirmation_token") WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);--> statement-breakpoint
CREATE UNIQUE INDEX "email_change_token_current_idx" ON "auth"."users" ("email_change_token_current") WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);--> statement-breakpoint
CREATE UNIQUE INDEX "email_change_token_new_idx" ON "auth"."users" ("email_change_token_new") WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);--> statement-breakpoint
CREATE UNIQUE INDEX "reauthentication_token_idx" ON "auth"."users" ("reauthentication_token") WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_token_idx" ON "auth"."users" ("recovery_token") WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_partial_key" ON "auth"."users" ("email") WHERE (is_sso_user = false);--> statement-breakpoint
CREATE INDEX "users_instance_id_email_idx" ON "auth"."users" ("instance_id",lower((email)::text));--> statement-breakpoint
CREATE INDEX "users_instance_id_idx" ON "auth"."users" ("instance_id");--> statement-breakpoint
CREATE INDEX "users_is_anonymous_idx" ON "auth"."users" ("is_anonymous");--> statement-breakpoint
CREATE INDEX "custom_oauth_providers_created_at_idx" ON "auth"."custom_oauth_providers" ("created_at");--> statement-breakpoint
CREATE INDEX "custom_oauth_providers_enabled_idx" ON "auth"."custom_oauth_providers" ("enabled");--> statement-breakpoint
CREATE INDEX "custom_oauth_providers_identifier_idx" ON "auth"."custom_oauth_providers" ("identifier");--> statement-breakpoint
CREATE INDEX "custom_oauth_providers_provider_type_idx" ON "auth"."custom_oauth_providers" ("provider_type");--> statement-breakpoint
CREATE INDEX "factor_id_created_at_idx" ON "auth"."mfa_factors" ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_factors_user_friendly_name_unique" ON "auth"."mfa_factors" ("friendly_name","user_id") WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);--> statement-breakpoint
CREATE INDEX "mfa_factors_user_id_idx" ON "auth"."mfa_factors" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_phone_factor_per_user" ON "auth"."mfa_factors" ("user_id","phone");--> statement-breakpoint
CREATE INDEX "flow_state_created_at_idx" ON "auth"."flow_state" ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_auth_code" ON "auth"."flow_state" ("auth_code");--> statement-breakpoint
CREATE INDEX "idx_user_id_auth_method" ON "auth"."flow_state" ("user_id","authentication_method");--> statement-breakpoint
CREATE INDEX "identities_email_idx" ON "auth"."identities" ("email" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "identities_user_id_idx" ON "auth"."identities" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_client_states_created_at" ON "auth"."oauth_client_states" ("created_at");--> statement-breakpoint
CREATE INDEX "mfa_challenge_created_at_idx" ON "auth"."mfa_challenges" ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "oauth_auth_pending_exp_idx" ON "auth"."oauth_authorizations" ("expires_at") WHERE (status = 'pending'::auth.oauth_authorization_status);--> statement-breakpoint
CREATE INDEX "oauth_clients_deleted_at_idx" ON "auth"."oauth_clients" ("deleted_at");--> statement-breakpoint
CREATE INDEX "oauth_consents_active_client_idx" ON "auth"."oauth_consents" ("client_id") WHERE (revoked_at IS NULL);--> statement-breakpoint
CREATE INDEX "oauth_consents_active_user_client_idx" ON "auth"."oauth_consents" ("user_id","client_id") WHERE (revoked_at IS NULL);--> statement-breakpoint
CREATE INDEX "oauth_consents_user_order_idx" ON "auth"."oauth_consents" ("user_id","granted_at" DESC);--> statement-breakpoint
CREATE INDEX "one_time_tokens_relates_to_hash_idx" ON "auth"."one_time_tokens" USING hash ("relates_to");--> statement-breakpoint
CREATE INDEX "one_time_tokens_token_hash_hash_idx" ON "auth"."one_time_tokens" USING hash ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "one_time_tokens_user_id_token_type_key" ON "auth"."one_time_tokens" ("user_id","token_type");--> statement-breakpoint
CREATE INDEX "refresh_tokens_instance_id_idx" ON "auth"."refresh_tokens" ("instance_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_instance_id_user_id_idx" ON "auth"."refresh_tokens" ("instance_id","user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_parent_idx" ON "auth"."refresh_tokens" ("parent");--> statement-breakpoint
CREATE INDEX "refresh_tokens_session_id_revoked_idx" ON "auth"."refresh_tokens" ("session_id","revoked");--> statement-breakpoint
CREATE INDEX "refresh_tokens_updated_at_idx" ON "auth"."refresh_tokens" ("updated_at" DESC);--> statement-breakpoint
CREATE INDEX "saml_providers_sso_provider_id_idx" ON "auth"."saml_providers" ("sso_provider_id");--> statement-breakpoint
CREATE INDEX "saml_relay_states_created_at_idx" ON "auth"."saml_relay_states" ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "saml_relay_states_for_email_idx" ON "auth"."saml_relay_states" ("for_email");--> statement-breakpoint
CREATE INDEX "saml_relay_states_sso_provider_id_idx" ON "auth"."saml_relay_states" ("sso_provider_id");--> statement-breakpoint
CREATE INDEX "sessions_not_after_idx" ON "auth"."sessions" ("not_after" DESC);--> statement-breakpoint
CREATE INDEX "sessions_oauth_client_id_idx" ON "auth"."sessions" ("oauth_client_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "auth"."sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "user_id_created_at_idx" ON "auth"."sessions" ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sso_domains_domain_idx" ON "auth"."sso_domains" (lower(domain));--> statement-breakpoint
CREATE INDEX "sso_domains_sso_provider_id_idx" ON "auth"."sso_domains" ("sso_provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sso_providers_resource_id_idx" ON "auth"."sso_providers" (lower(resource_id));--> statement-breakpoint
CREATE INDEX "sso_providers_resource_id_pattern_idx" ON "auth"."sso_providers" ("resource_id" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "webauthn_challenges_expires_at_idx" ON "auth"."webauthn_challenges" ("expires_at");--> statement-breakpoint
CREATE INDEX "webauthn_challenges_user_id_idx" ON "auth"."webauthn_challenges" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webauthn_credentials_credential_id_key" ON "auth"."webauthn_credentials" ("credential_id");--> statement-breakpoint
CREATE INDEX "webauthn_credentials_user_id_idx" ON "auth"."webauthn_credentials" ("user_id");--> statement-breakpoint
CREATE INDEX "_http_response_created_idx" ON "net"."_http_response" ("created");--> statement-breakpoint
CREATE UNIQUE INDEX "login_idx" ON "leaderboardProfiles" (lower(("githubLogin")::text));--> statement-breakpoint
CREATE UNIQUE INDEX "bname" ON "storage"."buckets" ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "bucketid_objname" ON "storage"."objects" ("bucket_id","name");--> statement-breakpoint
CREATE INDEX "idx_objects_bucket_id_name" ON "storage"."objects" ("bucket_id","name");--> statement-breakpoint
CREATE INDEX "idx_objects_bucket_id_name_lower" ON "storage"."objects" ("bucket_id",lower(name));--> statement-breakpoint
CREATE INDEX "name_prefix_search" ON "storage"."objects" ("name" text_pattern_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "buckets_analytics_unique_name_idx" ON "storage"."buckets_analytics" ("name") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_iceberg_namespaces_bucket_id" ON "storage"."iceberg_namespaces" ("catalog_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_iceberg_tables_location" ON "storage"."iceberg_tables" ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_iceberg_tables_namespace_id" ON "storage"."iceberg_tables" ("catalog_id","namespace_id","name");--> statement-breakpoint
CREATE INDEX "idx_multipart_uploads_list" ON "storage"."s3_multipart_uploads" ("bucket_id","key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vector_indexes_name_bucket_id_idx" ON "storage"."vector_indexes" ("name","bucket_id");--> statement-breakpoint
CREATE INDEX "supabase_functions_hooks_h_table_id_h_name_idx" ON "supabase_functions"."hooks" ("hook_table_id","hook_name");--> statement-breakpoint
CREATE INDEX "supabase_functions_hooks_request_id_idx" ON "supabase_functions"."hooks" ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "secrets_name_idx" ON "vault"."secrets" ("name") WHERE (name IS NOT NULL);--> statement-breakpoint
ALTER TABLE "auth"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "storage"."objects" ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");--> statement-breakpoint
ALTER TABLE "storage"."s3_multipart_uploads" ADD CONSTRAINT "s3_multipart_uploads_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");--> statement-breakpoint
ALTER TABLE "storage"."s3_multipart_uploads_parts" ADD CONSTRAINT "s3_multipart_uploads_parts_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");--> statement-breakpoint
ALTER TABLE "storage"."s3_multipart_uploads_parts" ADD CONSTRAINT "s3_multipart_uploads_parts_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "storage"."s3_multipart_uploads"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "storage"."iceberg_namespaces" ADD CONSTRAINT "iceberg_namespaces_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "storage"."buckets_analytics"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "storage"."iceberg_tables" ADD CONSTRAINT "iceberg_tables_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "storage"."buckets_analytics"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "storage"."iceberg_tables" ADD CONSTRAINT "iceberg_tables_namespace_id_fkey" FOREIGN KEY ("namespace_id") REFERENCES "storage"."iceberg_namespaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "storage"."vector_indexes" ADD CONSTRAINT "vector_indexes_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets_vectors"("id");--> statement-breakpoint
ALTER TABLE "auth"."identities" ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_oauth_client_id_fkey" FOREIGN KEY ("oauth_client_id") REFERENCES "auth"."oauth_clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."mfa_factors" ADD CONSTRAINT "mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."mfa_challenges" ADD CONSTRAINT "mfa_challenges_auth_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "auth"."mfa_factors"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."mfa_amr_claims" ADD CONSTRAINT "mfa_amr_claims_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."sso_domains" ADD CONSTRAINT "sso_domains_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "auth"."sso_providers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."saml_providers" ADD CONSTRAINT "saml_providers_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "auth"."sso_providers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."saml_relay_states" ADD CONSTRAINT "saml_relay_states_flow_state_id_fkey" FOREIGN KEY ("flow_state_id") REFERENCES "auth"."flow_state"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."saml_relay_states" ADD CONSTRAINT "saml_relay_states_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "auth"."sso_providers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."one_time_tokens" ADD CONSTRAINT "one_time_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."oauth_clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."oauth_clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_leaderboardProfileId_leaderboard_profile_githubId_fkey" FOREIGN KEY ("leaderboardProfileId") REFERENCES "leaderboardProfiles"("githubId") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "profileLinks" ADD CONSTRAINT "profile_link_user_id_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "oauthTestAccounts" ADD CONSTRAINT "oauthTestAccounts_authUserId_users_id_fkey" FOREIGN KEY ("authUserId") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "oauthTestAccounts" ADD CONSTRAINT "oauthTestAccounts_clientId_oauthClients_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthRegistrations"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
CREATE VIEW "extensions"."pg_stat_statements" AS (SELECT userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time, max_plan_time, mean_plan_time, stddev_plan_time, calls, total_exec_time, min_exec_time, max_exec_time, mean_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written, local_blks_hit, local_blks_read, local_blks_dirtied, local_blks_written, temp_blks_read, temp_blks_written, shared_blk_read_time, shared_blk_write_time, local_blk_read_time, local_blk_write_time, temp_blk_read_time, temp_blk_write_time, wal_records, wal_fpi, wal_bytes, jit_functions, jit_generation_time, jit_inlining_count, jit_inlining_time, jit_optimization_count, jit_optimization_time, jit_emission_count, jit_emission_time, jit_deform_count, jit_deform_time, stats_since, minmax_stats_since FROM pg_stat_statements(true) pg_stat_statements(userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time, max_plan_time, mean_plan_time, stddev_plan_time, calls, total_exec_time, min_exec_time, max_exec_time, mean_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written, local_blks_hit, local_blks_read, local_blks_dirtied, local_blks_written, temp_blks_read, temp_blks_written, shared_blk_read_time, shared_blk_write_time, local_blk_read_time, local_blk_write_time, temp_blk_read_time, temp_blk_write_time, wal_records, wal_fpi, wal_bytes, jit_functions, jit_generation_time, jit_inlining_count, jit_inlining_time, jit_optimization_count, jit_optimization_time, jit_emission_count, jit_emission_time, jit_deform_count, jit_deform_time, stats_since, minmax_stats_since));--> statement-breakpoint
CREATE VIEW "extensions"."pg_stat_statements_info" AS (SELECT dealloc, stats_reset FROM pg_stat_statements_info() pg_stat_statements_info(dealloc, stats_reset));--> statement-breakpoint
CREATE VIEW "vault"."decrypted_secrets" AS (SELECT id, name, description, secret, convert_from(vault._crypto_aead_det_decrypt(message => decode(secret, 'base64'::text), additional => convert_to(id::text, 'utf8'::name), key_id => 0::bigint, context => '\x7067736f6469756d'::bytea, nonce => nonce), 'utf8'::name) AS decrypted_secret, key_id, nonce, created_at, updated_at FROM vault.secrets s);--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "leaderboardProfiles" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "leaderboardProfiles" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "leaderboardProfiles" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "leaderboardProfiles" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "oauthRegistrations" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "oauthRegistrations" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "oauthRegistrations" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "oauthRegistrations" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "oauthTestAccounts" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "oauthTestAccounts" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "oauthTestAccounts" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "oauthTestAccounts" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "points" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "points" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "points" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "points" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_delete" ON "profile" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_insert" ON "profile" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_select" ON "profile" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_update" ON "profile" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = "userId")) WITH CHECK ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_delete" ON "profileLinks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_insert" ON "profileLinks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_select" ON "profileLinks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_update" ON "profileLinks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = "userId")) WITH CHECK ((( SELECT auth.uid() AS uid) = "userId"));
*/