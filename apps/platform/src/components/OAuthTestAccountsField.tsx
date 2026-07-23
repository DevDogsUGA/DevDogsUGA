import type { getOAuthPageData } from "~/server/loaders/console";
import OAuthTestAccounts from "~/components/OAuthTestAccounts";

type OAuthData = Awaited<ReturnType<typeof getOAuthPageData>>;

export default function OAuthTestAccountsField({ testAccounts }: OAuthData) {
  return <OAuthTestAccounts initialAccounts={testAccounts} />;
}
