CREATE TYPE "platform"."oauthStatus" AS ENUM (
  'testing',
  'in_production'
);

GRANT USAGE ON TYPE "platform"."oauthStatus" TO "postgres";
