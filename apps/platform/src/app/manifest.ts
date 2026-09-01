import type { MetadataRoute } from "next";

/**
 * /manifest.webmanifest: the name, colours and icon a browser uses when this
 * app is pinned, installed, or opened from a phone's home screen.
 *
 * Not a service worker and no offline story. Nothing here makes the app
 * installable in the PWA sense. What a browser reads whether or not an app is
 * installed is the name under a pinned tile, the colour of the Android address
 * bar, and a `<link rel="manifest">` that search engines and share sheets read
 * as a signal of a real site rather than a page.
 *
 * The name and description repeat the two strings `app/layout.tsx` exports as
 * `title` and `description`. They are written out rather than imported because
 * importing the root layout's `metadata` here would make a metadata route
 * depend on a layout module. Keep the three in step.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DevDogs",
    short_name: "DevDogs",
    description:
      "DevDogs is a club at UGA devoted to bettering our community through open-source software.",
    start_url: "/",
    display: "standalone",
    /**
     * Both black, matching `<body className="bg-black">` in the root layout.
     * `background_color` is what a browser paints during launch, before any CSS
     * has parsed, so a light default there is a white flash in front of a site
     * that is dark everywhere. `theme_color` is the Android address bar. The
     * rose/cyan/amber accents are per-section and would be arbitrary as a
     * single site-wide colour, so the one colour the whole app agrees on wins.
     */
    background_color: "#000000",
    theme_color: "#000000",
    /**
     * `app/icon.png` is served at `/icon.png`, the URL Next derives for a
     * STATIC metadata icon file. (The `?<generated>` hash in the docs is on the
     * `<link>` it writes, not on the route.)
     *
     * This used to be one 299x299 rendering, and this comment used to say that
     * Chrome wants 192 and 512 before it offers to install, that there was no
     * second rendering of the logo to point at, and that making one was a
     * design task. That task is done: `pnpm devtools images icons` renders the
     * mark at every size a platform asks for, from one template in
     * `@devdogsuga/og`. So the two Chrome wants are declared here, and the app
     * is installable.
     *
     * `purpose` stays `any` and does NOT claim `maskable`. A maskable icon has
     * to keep its content inside the middle 80% so a launcher can crop it to
     * whatever shape it likes, and this mark spends its outer edge on the
     * border and the block shadow that make it look like the rest of the site.
     * Declaring it maskable would let Android crop those off.
     */
    icons: [
      {
        src: "/brand/icons/platform-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
