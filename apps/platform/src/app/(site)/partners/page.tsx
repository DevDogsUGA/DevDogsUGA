"use cache";

import UnderConstruction from "~/components/UnderConstruction";

export default async function Partners() {
  if (process.env.VERCEL_ENV === "production") return <UnderConstruction />;

  return <UnderConstruction />;
}
