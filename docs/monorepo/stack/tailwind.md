---
name: Tailwind
description: Tailwind v4 CSS-first in the platform and v3-style config in schedule-builder, plus the @theme ordering trap that silently killed a whole palette.
order: 6
---

# Tailwind

Tailwind CSS 4.3.3, through `@tailwindcss/postcss` as the only PostCSS plugin in either Next app. Read this before adding a color token, a plugin, or a theme block — the two apps configure Tailwind differently, and v4's ordering rules have already cost this repo an entire palette. [Tailwind's docs](https://tailwindcss.com/docs) cover the utilities themselves. Class order in markup is handled for you by `prettier-plugin-tailwindcss`, so `pnpm format:write` sorts it.

## Two apps, two setups

**`platform` is CSS-first.** Everything lives in `src/styles/globals.css`: `@import "tailwindcss"`, then the moderation styles, `tw-animate-css` and `shadcn/tailwind.css`, then `@custom-variant dark (&:is(.dark *))` and the plugins. There is no `tailwind.config.ts`.

**`schedule-builder` keeps a v3-style config**, `tailwind.config.ts`, loaded from its own `globals.css` with `@config`. Keyframes, animations and the forms plugin are declared there in JavaScript.

## A later `@theme` block wins

> [!WARNING]
> The platform's mauve palette is declared in the `:root, .dark` block near the **bottom** of `globals.css`, not in the `@theme` block at the top. It used to be at the top, and every declaration there was silently dead: the `@theme inline` block further down re-maps the same names to `var(--background)`, `var(--primary)` and friends, a later `@theme` wins, and the whole UI rendered shadcn's stock zero-chroma grays instead of mauve.

Two consumers have to agree on those colors. Utilities like `bg-card` reach them through the `@theme inline` indirection, while a handful of call sites read the raw token directly — `button.tsx` does `color-mix(in oklch, var(--secondary), var(--foreground) 5%)`. Setting the raw `--*` tokens is what keeps both paths on one palette, so only names with no counterpart in the `@theme inline` block belong in the top `@theme`.

<details>
<summary>Why is the palette bound to both <code>:root</code> and <code>.dark</code>?</summary>

`<html>` is hardcoded to `class="dark"` in `app/layout.tsx`, so dark is the only theme the platform ever renders and the `:root` values above the palette are shadcn scaffolding nothing reaches. Binding to `:root` as well is for the design-system bundle, which has no such host element to inherit from and would otherwise fall through to that unused light scaffolding and render near-white. The `dark:` variant is a separate mechanism — `@custom-variant dark (&:is(.dark *))` — and still needs a real `.dark` ancestor.

</details>

## Plugins are opt-in on purpose

`@tailwindcss/forms` is loaded with `strategy: class` in both apps. The default strategy emits a base layer that restyles every bare `input`, `select` and `textarea` — white background, gray border, square corners, blue focus ring — which fights any shadcn component rendering a raw control. It was rendering cmdk's `<input>` as a white box inside the search dialog's pill. Anything that wants those styles asks for them with `form-input` or `form-textarea`.

`@tailwindcss/typography` is loaded plainly, and the docs pages depend on it: their bodies are bare HTML under a `prose prose-invert` wrapper. `globals.css` remaps the plugin's eighteen `--tw-prose-invert-*` names onto the design tokens rather than styling elements one by one, in an **unlayered** `.prose` rule — the plugin registers `.prose` in the `utilities` layer, and unlayered rules outrank layered ones whatever the source order.
