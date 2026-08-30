import { createServerClient } from "@devdogsuga/supabase";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env";
import { APP_SCHEMA } from "./schema";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    schema: APP_SCHEMA,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh session. Do not add logic between createServerClient and getUser
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user };
}
