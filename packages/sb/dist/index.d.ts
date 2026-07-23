import { type CookieMethodsServer } from "@supabase/ssr";
import type { Database } from "./database.types";
export type { Database };
export { SCHEMAS, type AppKey, type SchemaName } from "./schemas";
/** Any schema exposed by the shared Supabase project's generated types. */
export type DatabaseSchema = keyof Database & string;
interface ClientOptions<S extends DatabaseSchema> {
    /** Supabase API URL (e.g. `env.API_URL` / `env.NEXT_PUBLIC_SUPABASE_URL`). */
    url: string;
    /** Publishable/anon key for browser & server clients; secret key for admin. */
    key: string;
    /** The app's Postgres schema — becomes the client's default for `.from()`. */
    schema: S;
}
/**
 * Browser (anon) client, scoped to `schema` as its default. Memoized by
 * `@supabase/ssr` on its arguments, so repeated calls return one instance.
 */
export declare function createBrowserClient<S extends DatabaseSchema>(opts: ClientOptions<S>): import("@supabase/supabase-js").SupabaseClient<Database, S, S extends "platform" | "schedule_builder" | "storage" | "graphql_public" | "public" ? S : "public", Omit<Database, "__InternalSupabase">[S extends "platform" | "schedule_builder" | "storage" | "graphql_public" | "public" ? S : "public"] extends {
    Tables: Record<string, {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: {
            foreignKeyName: string;
            columns: string[];
            isOneToOne?: boolean;
            referencedRelation: string;
            referencedColumns: string[];
        }[];
    }>;
    Views: Record<string, {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: {
            foreignKeyName: string;
            columns: string[];
            isOneToOne?: boolean;
            referencedRelation: string;
            referencedColumns: string[];
        }[];
    } | {
        Row: Record<string, unknown>;
        Relationships: {
            foreignKeyName: string;
            columns: string[];
            isOneToOne?: boolean;
            referencedRelation: string;
            referencedColumns: string[];
        }[];
    }>;
    Functions: Record<string, {
        Args: Record<string, unknown> | never;
        Returns: unknown;
        SetofOptions?: {
            isSetofReturn?: boolean | undefined;
            isOneToOne?: boolean | undefined;
            isNotNullable?: boolean | undefined;
            to: string;
            from: string;
        };
    }>;
} ? Omit<Database, "__InternalSupabase">[S extends "platform" | "schedule_builder" | "storage" | "graphql_public" | "public" ? S : "public"] : never, S extends "platform" | "schedule_builder" | "storage" | "graphql_public" | "public" ? {
    PostgrestVersion: "12";
} : S extends {
    PostgrestVersion: string;
} ? S : never>;
/**
 * Cookie-backed server client (RSC / Route Handlers / Server Actions),
 * scoped to `schema`. The caller supplies the framework's cookie adapter.
 */
export declare function createServerClient<S extends DatabaseSchema>(opts: ClientOptions<S> & {
    cookies: CookieMethodsServer;
}): import("@supabase/supabase-js").SupabaseClient<Database, S, S extends "platform" | "schedule_builder" | "storage" | "graphql_public" | "public" ? S : "public", Omit<Database, "__InternalSupabase">[S extends "platform" | "schedule_builder" | "storage" | "graphql_public" | "public" ? S : "public"] extends {
    Tables: Record<string, {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: {
            foreignKeyName: string;
            columns: string[];
            isOneToOne?: boolean;
            referencedRelation: string;
            referencedColumns: string[];
        }[];
    }>;
    Views: Record<string, {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: {
            foreignKeyName: string;
            columns: string[];
            isOneToOne?: boolean;
            referencedRelation: string;
            referencedColumns: string[];
        }[];
    } | {
        Row: Record<string, unknown>;
        Relationships: {
            foreignKeyName: string;
            columns: string[];
            isOneToOne?: boolean;
            referencedRelation: string;
            referencedColumns: string[];
        }[];
    }>;
    Functions: Record<string, {
        Args: Record<string, unknown> | never;
        Returns: unknown;
        SetofOptions?: {
            isSetofReturn?: boolean | undefined;
            isOneToOne?: boolean | undefined;
            isNotNullable?: boolean | undefined;
            to: string;
            from: string;
        };
    }>;
} ? Omit<Database, "__InternalSupabase">[S extends "platform" | "schedule_builder" | "storage" | "graphql_public" | "public" ? S : "public"] : never, S extends "platform" | "schedule_builder" | "storage" | "graphql_public" | "public" ? {
    PostgrestVersion: "12";
} : S extends {
    PostgrestVersion: string;
} ? S : never>;
/**
 * Service-role admin client. Bypasses RLS — server-only, never ship to the
 * browser. Session auto-refresh/persistence are disabled.
 */
export declare function createAdminClient<S extends DatabaseSchema>(opts: ClientOptions<S>): import("@supabase/supabase-js").SupabaseClient<Database, S, S extends "platform" | "schedule_builder" | "storage" | "graphql_public" | "public" ? S : "public", Omit<Database, "__InternalSupabase">[S extends "platform" | "schedule_builder" | "storage" | "graphql_public" | "public" ? S : "public"] extends {
    Tables: Record<string, {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: {
            foreignKeyName: string;
            columns: string[];
            isOneToOne?: boolean;
            referencedRelation: string;
            referencedColumns: string[];
        }[];
    }>;
    Views: Record<string, {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: {
            foreignKeyName: string;
            columns: string[];
            isOneToOne?: boolean;
            referencedRelation: string;
            referencedColumns: string[];
        }[];
    } | {
        Row: Record<string, unknown>;
        Relationships: {
            foreignKeyName: string;
            columns: string[];
            isOneToOne?: boolean;
            referencedRelation: string;
            referencedColumns: string[];
        }[];
    }>;
    Functions: Record<string, {
        Args: Record<string, unknown> | never;
        Returns: unknown;
        SetofOptions?: {
            isSetofReturn?: boolean | undefined;
            isOneToOne?: boolean | undefined;
            isNotNullable?: boolean | undefined;
            to: string;
            from: string;
        };
    }>;
} ? Omit<Database, "__InternalSupabase">[S extends "platform" | "schedule_builder" | "storage" | "graphql_public" | "public" ? S : "public"] : never, S extends "platform" | "schedule_builder" | "storage" | "graphql_public" | "public" ? {
    PostgrestVersion: "12";
} : S extends {
    PostgrestVersion: string;
} ? S : never>;
