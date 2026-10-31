import { permanentRedirect } from "next/navigation";
import { approvalPath } from "~/app/(auth)/oauth/approvalPath";

/** Permanent compatibility redirect from `/tools/oauth/connect`, keeping the query. */
export default async function ApprovalRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(approvalPath("/oauth/connect", await searchParams));
}
