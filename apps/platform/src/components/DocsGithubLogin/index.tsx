"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "~/components/TopNav/NavUserProvider";
import { applyGithubLogin } from "./applyGithubLogin";

/**
 * Fills the signed-in reader's GitHub login into a docs page's commands.
 *
 * The compiler wraps every literal `<github-username>` in a code block, and in
 * a terminal prompt's branch label, in `<span data-github-username>`
 * (@devdogsuga/docs-compiler's codeblocks.ts). The page's HTML is cached and
 * shared, so the server render always has the literal; this swaps it after
 * hydration, from the `/me` answer `NavUserProvider` already fetches. Anyone
 * without a linked GitHub account keeps the literal, which the stylesheet
 * highlights as something to replace.
 *
 * It edits text in the DOM rather than rendering, so the copy button (which
 * reads the block's text, see DocsCodeCopy) copies what is shown.
 */
export default function DocsGithubLogin() {
  const login = useMe()?.githubLogin ?? null;
  // A client navigation swaps the page's HTML under this component, bringing
  // the literals back.
  const pathname = usePathname();

  useEffect(() => {
    applyGithubLogin(document, login);
  }, [login, pathname]);

  return null;
}
