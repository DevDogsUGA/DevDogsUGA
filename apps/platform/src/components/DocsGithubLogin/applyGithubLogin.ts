/**
 * Fills the signed-in reader's GitHub login into a docs page's commands.
 *
 * The compiler wraps every literal `<github-username>` in a code block, and in
 * a terminal prompt's branch label, in `<span data-github-username>`
 * (@devdogsuga/docs-compiler's codeblocks.ts). The page's HTML is cached and
 * shared, so the server render always has the literal; this swaps it after
 * hydration, from the `/me` answer `NavUserProvider` already fetches. Anyone
 * without a linked GitHub account keeps the literal, which the stylesheet
 * highlights as something to replace. It edits the DOM's text, so the copy button (which
 * reads the block's text; see DocsCodeCopy) copies what is shown.
 */
export function applyGithubLogin(root: ParentNode, login: string | null): void {
  for (const el of root.querySelectorAll<HTMLElement>(
    "[data-github-username]",
  )) {
    // The compiled text, remembered before it is first replaced.
    el.dataset.template ??= el.textContent ?? "";
    if (login) {
      el.textContent = login;
      el.setAttribute("data-substituted", "");
    } else {
      el.textContent = el.dataset.template;
      el.removeAttribute("data-substituted");
    }
  }
}
