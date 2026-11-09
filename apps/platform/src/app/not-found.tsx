import NotFoundPage from "~/classic/components/NotFoundPage";
import SiteLayout from "./(site)/layout";

/**
 * An unmatched URL. Next renders this inside the root layout only, so it
 * wraps itself in the site layout to keep the nav and footer.
 */
export default function NotFound() {
  return (
    <SiteLayout {...({ children: <NotFoundPage /> } as LayoutProps<"/">)} />
  );
}
