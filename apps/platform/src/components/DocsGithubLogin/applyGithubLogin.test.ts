// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { blockText } from "~/components/DocsCodeCopy";
import { applyGithubLogin } from "./applyGithubLogin";

const html =
  `<figure class="docs-code" data-kind="terminal"><pre><code>` +
  `<span class="line"><span class="docs-prompt"><span class="docs-prompt-git"> ` +
  `<span data-github-username="">&lt;github-username></span>/02 </span>❯ </span>` +
  `<span>git switch -c </span><span data-github-username="">` +
  `<span>&lt;</span><span>github-username</span><span>></span></span>` +
  `<span>/02-supabase origin/01</span></span>` +
  `</code></pre></figure>`;

function page(): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("applyGithubLogin", () => {
  it("fills the login into every marked placeholder, and the copy text follows", () => {
    const root = page();
    applyGithubLogin(root, "ada");
    expect(root.querySelectorAll("[data-substituted]")).toHaveLength(2);
    expect(root.textContent).not.toContain("<github-username>");
    expect(blockText(root.firstElementChild!)).toBe(
      "git switch -c ada/02-supabase origin/01",
    );
  });

  it("leaves the literal, and copies it, without a login", () => {
    const root = page();
    applyGithubLogin(root, null);
    expect(root.querySelectorAll("[data-substituted]")).toHaveLength(0);
    expect(blockText(root.firstElementChild!)).toBe(
      "git switch -c <github-username>/02-supabase origin/01",
    );
  });

  it("restores the literal when the login goes away", () => {
    const root = page();
    applyGithubLogin(root, "ada");
    applyGithubLogin(root, null);
    expect(
      root.querySelectorAll("[data-github-username]")[1]!.textContent,
    ).toBe("<github-username>");
    expect(root.querySelector("[data-substituted]")).toBeNull();
  });
});
