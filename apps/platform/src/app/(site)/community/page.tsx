"use cache";

import UnderConstruction from "~/components/UnderConstruction";

export default async function Community() {
  if (process.env.DEPLOY_ENV === "production") return <UnderConstruction />;

  return <UnderConstruction />;
}
