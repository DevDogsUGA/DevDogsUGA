/**
 * Sets every marked `<github-username>` under `root` to the login, or back
 * to the compiled literal when there is none (see DocsGithubLogin).
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
