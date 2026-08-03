import { cacheLife } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import {
  GithubLogoIcon,
  InstagramLogoIcon,
  LinkedinLogoIcon,
} from "@phosphor-icons/react/ssr";
import devdog from "~/assets/devdog.png";

/**
 * `"use cache"` is required, not an optimisation. This renders in the site
 * layout, above the page's own <Suspense> boundary, and the copyright line
 * reads the clock. Outside a cache scope that read would postpone the layout
 * shell itself — every route on the site would prerender to nothing but the
 * <html> wrapper. Inside one, the year resolves at prerender time and is baked
 * into the static output, which also means it refreshes on each deploy rather
 * than per request. See docs/platform/caching.md.
 *
 * `cacheLife("max")` is required for the same reason. A route's revalidate
 * window is the *minimum* across its cache entries, so leaving this on the
 * default 15m profile pulled every route on the site down to 15m — including
 * the docs pages, whose own `cacheLife("max")` had earned them 30d. Nothing
 * here can go stale between deploys, so "max" is accurate as well as harmless.
 */
export default async function Footer() {
  "use cache";
  cacheLife("max");

  return (
    <footer
      className="relative overflow-hidden border-t-2 border-t-mauve-700 bg-mauve-950 px-8 py-10 text-sm text-mauve-400"
      id="footer"
    >
      {/* Dense dot pattern — top-left */}
      <div
        aria-hidden
        className="bg-dot-grid-dense pointer-events-none absolute top-0 left-0 h-full w-1/2 text-mauve-700/35"
        style={{
          maskImage: "linear-gradient(135deg, black 0%, transparent 60%)",
          WebkitMaskImage: "linear-gradient(135deg, black 0%, transparent 60%)",
        }}
      />
      {/* Dense dot pattern — bottom-right */}
      <div
        aria-hidden
        className="bg-dot-grid-dense pointer-events-none absolute right-0 bottom-0 h-full w-1/2 text-mauve-700/35"
        style={{
          maskImage: "linear-gradient(315deg, black 0%, transparent 60%)",
          WebkitMaskImage: "linear-gradient(315deg, black 0%, transparent 60%)",
        }}
      />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-10 lg:gap-15">
        <nav className="flex flex-col gap-12 lg:flex-row">
          <div className="flex flex-1 flex-col items-center gap-4 lg:items-start">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg md:text-xl lg:gap-2.5"
            >
              <figure className="size-[1.5em]">
                <Image alt="Home" src={devdog} />
              </figure>
              {/* Not a heading: this renders on every page now, and the site's
                  one <h1> belongs to the page content. Matches TopNav. */}
              <span className="font-display font-semibold text-white">
                DevDogs
              </span>
            </Link>

            <p className="text-center text-balance lg:text-left">
              DevDogs is a student-run club at UGA dedicated to benefiting our
              community through code.
            </p>

            <p className="text-center text-balance lg:text-left">
              Each year, we work to develop impactful software from concept to
              completion, learning real-world skills and industry-standard tech
              along the way.
            </p>
          </div>

          <div className="hidden justify-between md:flex lg:contents">
            <div className="flex flex-col gap-2">
              <p className="pb-2 text-lg font-bold text-mauve-100">
                Explore DevDogs
              </p>
              <ul className="contents">
                <li>
                  <Link href="/events" className="hover:underline">
                    Events
                  </Link>
                </li>

                <li>
                  <Link
                    href="mailto:devdogs@uga.edu"
                    className="hover:underline"
                  >
                    Partners
                  </Link>
                </li>

                <li>
                  {/* Starts an OAuth handshake, not a page — never prefetch. */}
                  <Link
                    href="/join"
                    prefetch={false}
                    className="hover:underline"
                  >
                    Join Us
                  </Link>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <p className="pb-2 text-lg font-bold text-mauve-100">Resources</p>
              <ul className="contents">
                <li>
                  <Link
                    href="https://forum.devdogsuga.org"
                    className="hover:underline"
                    target="_blank"
                  >
                    Community Resource Forum
                  </Link>
                </li>

                <li>
                  <Link
                    href="https://github.com/DevDogs-UGA/Community-Resource-Forum"
                    className="hover:underline"
                    target="_blank"
                  >
                    Current Project Repository
                  </Link>
                </li>

                <li>
                  <Link
                    href="https://github.com/DevDogs-UGA/Community-Resource-Forum/wiki"
                    className="hover:underline"
                    target="_blank"
                  >
                    Current Project Wiki
                  </Link>
                </li>

                <li>
                  <Link href="/legal/privacy" className="hover:underline">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-4">
              <p className="text-lg font-bold text-mauve-100">
                Stay in the Loop
              </p>

              <p className="max-w-50">
                Stay up-to-date with the latest from DevDogs by following us on
                our various social channels.
              </p>

              <ul className="flex items-center gap-2">
                <li className="contents">
                  <Link
                    className="rounded-sm border border-mauve-700 p-1 text-lg transition-colors hover:bg-mauve-800"
                    href="https://instagram.com/DevDogs_UGA"
                    target="_blank"
                  >
                    <InstagramLogoIcon />
                  </Link>
                </li>

                <li className="contents">
                  <Link
                    className="rounded-sm border border-mauve-700 p-1 text-lg transition-colors hover:bg-mauve-800"
                    href="https://linkedin.com/company/DevDogs-UGA"
                    target="_blank"
                  >
                    <LinkedinLogoIcon />
                  </Link>
                </li>

                <li className="contents">
                  <Link
                    className="rounded-sm border border-mauve-700 p-1 text-lg transition-colors hover:bg-mauve-800"
                    href="https://github.com/DevDogs-UGA"
                    target="_blank"
                  >
                    <GithubLogoIcon />
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </nav>

        <p className="flex flex-col items-center justify-between gap-1 border-t border-mauve-700 pt-4 text-mauve-500 sm:flex-row">
          <Link href="mailto:devdogs@uga.edu" className="hover:underline">
            devdogs@uga.edu
          </Link>
          <span>&copy; {new Date().getFullYear()} DevDogs</span>
          <span>&ldquo;Building for better&rdquo;</span>
        </p>
      </div>{" "}
      {/* relative z-10 */}
    </footer>
  );
}
