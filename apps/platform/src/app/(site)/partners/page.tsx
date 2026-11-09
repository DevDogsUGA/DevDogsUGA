import type { Metadata } from "next";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import PageShell from "~/classic/components/PageShell";
import LinkButton from "~/classic/ui/link-button";

/**
 * Static copy; changes only with a deploy.
 */
export const revalidate = false;

/**
 * Title and description follow the same rule as `/community`: the description
 * is the navbar entry's, from `config/nav.ts`.
 */
export const metadata: Metadata = {
  title: "Partners | DevDogs",
  description: "Organizations and sponsors that partner with DevDogs.",
};

/**
 * `/partners`. The same pitch the homepage's Partners section makes, with the
 * contact link, until there are partners to list. It used to render an
 * under-construction placeholder.
 */
export default function Partners() {
  return (
    <PageShell
      accent="violet"
      title="Partners"
      description="Organizations and sponsors that partner with DevDogs."
    >
      <div className="flex max-w-prose flex-col gap-4 text-mauve-200">
        <p>
          DevDogs is the large-scale application development club at UGA
          building real products for the community every semester.
        </p>
        <p>
          Partnering with us puts your brand in front of driven students, with
          sponsorship, recruiting, and mentorship opportunities.
        </p>
        <p>If you want in on the action, let&rsquo;s talk.</p>
        <LinkButton
          href="mailto:devdogs@uga.edu"
          className="flex w-fit items-center gap-2 rounded-sm border-2 border-black bg-white px-4 py-2 text-sm font-semibold text-black"
        >
          Get in Touch <ArrowRightIcon />
        </LinkButton>
      </div>
    </PageShell>
  );
}
