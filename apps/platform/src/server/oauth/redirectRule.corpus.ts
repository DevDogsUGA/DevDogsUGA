/** One corpus for the redirect rule, shared by its unit test and its db test. */

export const ACCEPTED = [
  "https://dogdays.dev/auth/callback",
  "https://abc123.supabase.co/auth/v1/callback",
  "https://api.devdogsuga.org/auth/v1/callback",
  "https://example.com",
  "https://example.com:8443/cb?x=1#frag",
  "https://EXAMPLE.com/cb",
  "http://localhost",
  "http://localhost:3000/auth",
  "http://127.0.0.1:54321/auth/v1/callback",
  "http://[::1]:8080/cb",
  "http://LOCALHOST:3000/cb",
];

export const REFUSED = [
  "http://example.com/cb",
  "http://localhost.evil.test/cb",
  "http://localhost@evil.test/cb",
  "http://127.0.0.1.evil.test/cb",
  "http://192.168.1.5:3000/cb",
  "http://0.0.0.0:3000/cb",
  "http://[::2]/cb",
  "https://user:pw@example.com/cb",
  "https://user@example.com/cb",
  "https://",
  "https:///cb",
  "myapp://callback",
  "com.example.app:/oauth",
  "ftp://example.com/cb",
  "javascript:alert(1)",
  "/relative/path",
  "example.com",
  "https://exa mple.com/cb",
  "https://example.com/c b",
  "",
];
