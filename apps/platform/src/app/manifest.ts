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
     * `<link>` it writes, not on the route.) It is 299x299, declared honestly
     * rather than rounded to 512: a browser scales the icon it is given, and a
     * lie here only misleads whichever one picks by size.
     *
     * That single size is also why this manifest does not claim installability.
     * Chrome wants 192 and 512 before it offers to install, and there is no
     * second rendering of the logo in this repo to point at. Adding one is a
     * design task.
     */
    icons: [
      {
        src: "/icon.png",
        sizes: "299x299",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
