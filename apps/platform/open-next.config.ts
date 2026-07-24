import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default OpenNext -> Cloudflare config. Add caching/queue overrides here as
// the deployment matures (R2 incremental cache, D1 tag cache, etc.).
export default defineCloudflareConfig();
