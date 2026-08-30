import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import SignInUnavailableDialog from "~/components/SignInUnavailableDialog";

export default function SignInButton() {
  return (
    // The sign-in flow is unfinished, so this opens an explainer rather than
    // linking to /auth, which would start an OAuth handshake that can't be
    // completed. Restore the <Link href="/auth" prefetch={false}> once the flow
    // lands. The prefetch guard matters. See ~/server/auth/oauthLinkRoute.
    <SignInUnavailableDialog>
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-sm border border-black bg-cyan-400 px-3 py-1 text-sm font-semibold text-black transition-[translate,box-shadow] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_var(--color-amber-400)] md:px-4 md:py-1.5"
      >
        Sign In
        <ArrowRightIcon />
      </button>
    </SignInUnavailableDialog>
  );
}
