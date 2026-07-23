import { createClient } from "@supabase/supabase-js";

const url = process.env.API_URL!;
const key = process.env.SECRET_KEY!;

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "jsf51288@uga.edu",
});

if (error || !data.properties?.hashed_token) {
  console.error(error);
  process.exit(1);
}

console.log(data.properties.hashed_token);
