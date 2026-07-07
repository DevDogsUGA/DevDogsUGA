import * as z from "zod";

export const docs = z
  .object({
    /** GitHub repository name within the org — used in URLs and API calls (e.g. "DevDogs-Website") */
    slug: z.string(),
    /** Friendly display name shown in the docs UI (e.g. "DevDogs Website") */
    name: z.string(),
    /** Short human-readable description shown on the docs landing page and in repo tabs */
    description: z.string().optional(),
  })
  .array()
  .default([
    { slug: "DevDogs-Website", name: "DevDogs Website", description: "What" },
    //{ slug: "Community-Resource-Forum", name: "Community Resource Forum" },
    //{ slug: "Optimal-Schedule-Builder", name: "Optimal Schedule Builder" },
  ]);
