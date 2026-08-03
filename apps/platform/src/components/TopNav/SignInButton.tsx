import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";

export default function SignInButton() {
  return (
    <Link
      href="/auth"
      // /auth starts an OAuth handshake rather than rendering a page, so a
      // prefetch would begin one before the visitor clicks. See
      // ~/server/auth/oauthLinkRoute.
      prefetch={false}
      className="flex items-center gap-1.5 rounded-sm border border-black bg-cyan-400 px-3 py-1 text-sm font-semibold text-black transition-[translate,box-shadow] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_var(--color-amber-400)] md:px-4 md:py-1.5"
    >
      Sign In
      <ArrowRightIcon />
    </Link>
  );
}
