import { defineDevDogsCloudflareConfig } from "@devdogsuga/config/opennext/cloudflare";

// Shared across every Next.js app in the repo — see the factory for why an
// incremental cache is mandatory rather than an optimisation, and for the
// per-app wrangler bindings it expects.
export default defineDevDogsCloudflareConfig();
