"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ssr";
import { Dialog, DialogContent, DialogTitle } from "~/ui/dialog";
import LeaderCard from "./LeaderCard";
import Headshot, { formatLeaderMeta } from "./Headshot";

/**
 * One officer, as the cards render them.
 *
 * `~/server/loaders/officers.ts` shapes this out of `platform.profile` and the
 * leadership roles its holder has been given. It was a hand-maintained array of
 * object literals until 20260827000000, and three consequences of that move
 * show up in these types.
 *
 * `imageSrc` is a URL string rather than a `StaticImageData`, because the image
 * is no longer a build-time import from `~/assets`. It is the officer's avatar,
 * keyed by user id in the `avatars` bucket, and can 404. The blur placeholder a
 * static import used to carry is gone, because an avatar uploaded from /account
 * has none to carry.
 *
 * `links` replaced the fixed portfolio/github/linkedin/email fields. Members
 * curate `platform."profileLinks"` from /account, so a card shows whatever the
 * officer put there rather than four slots the data has to be bent into.
 * GitHub, Discord and LinkedIn are separately modelled as linked identities
 * gated on `showGithub`/`showDiscord`/`showLinkedin`, which this section does
 * not read yet.
 *
 * Everything optional is explicitly `| null` rather than `?`, because the
 * database distinguishes "no answer" from "not asked". No officer has stated
 * pronouns, and a card must render that as silence rather than as a gap in a
 * sentence.
 */
export interface LeaderProfile {
  /** The officer's user id, which is also their avatar's key. */
  slug: string;
  name: string;
  titles: string[];
  imageSrc: string | null;
  pronouns: string | null;
  year: string | null;
  majors: string[];
  minors: string[];
  certificates: string[];
  /** `profile.roleDescription`. Null until the officer writes one. */
  bio: string | null;
  links: { title: string; url: string }[];
}

const linkCls =
  "flex items-center gap-1.5 rounded-sm border-2 border-black px-2.5 py-1 text-xs font-semibold text-black transition-lift hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-block-sm";

function MobileContent({ profile }: { profile: LeaderProfile }) {
  const meta = formatLeaderMeta(profile.pronouns, profile.year);

  return (
    <div className="flex flex-col gap-4 p-6 pt-10">
      <div className="flex items-start gap-4">
        <div className="shadow-block-md relative size-20 shrink-0 overflow-hidden rounded-full border-2 border-amber-900 shadow-amber-500">
          <Headshot
            name={profile.name}
            src={profile.imageSrc}
            // `size-20`, fixed. This sheet only ever opens below md.
            sizes="80px"
          />
        </div>
        <div>
          <p className="font-display text-base leading-tight font-extrabold text-black">
            {profile.name}
          </p>
          {meta && <p className="mt-0.5 text-xs text-mauve-500">{meta}</p>}
          {profile.titles.map((t) => (
            <p key={t} className="mt-0.5 text-xs font-semibold text-amber-700">
              {t}
            </p>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-mauve-600">
        {profile.majors.length > 0 && (
          <p>
            <span className="font-semibold text-mauve-800">
              Major{profile.majors.length > 1 ? "s" : ""}:
            </span>{" "}
            {profile.majors.join(", ")}
          </p>
        )}
        {profile.minors.length > 0 && (
          <p>
            <span className="font-semibold text-mauve-800">
              Minor{profile.minors.length > 1 ? "s" : ""}:
            </span>{" "}
            {profile.minors.join(", ")}
          </p>
        )}
        {profile.certificates.length > 0 && (
          <p>
            <span className="font-semibold text-mauve-800">
              Cert{profile.certificates.length > 1 ? "s" : ""}:
            </span>{" "}
            {profile.certificates.join(", ")}
          </p>
        )}
      </div>
      {profile.bio && (
        <p className="text-xs leading-relaxed text-mauve-700">{profile.bio}</p>
      )}
      {profile.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {profile.links.map((link) => (
            <Link
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={linkCls}
            >
              <ArrowSquareOutIcon size={12} /> {link.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export interface LeaderHoverCardProps extends LeaderProfile {
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  hoverSide?: "left" | "right" | "top" | "bottom";
  hoverLocked?: boolean;
}

export default function LeaderHoverCard(props: LeaderHoverCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);

  function handleOpenChange(open: boolean) {
    if (open && props.hoverLocked) return;
    setCardOpen(open);
    if (open) props.onHoverStart?.();
  }

  return (
    <>
      <div
        style={{
          paddingLeft: cardOpen && props.hoverSide === "left" ? 24 : 0,
          paddingRight: cardOpen && props.hoverSide === "right" ? 24 : 0,
          paddingTop: cardOpen && props.hoverSide === "top" ? 24 : 0,
          paddingBottom: cardOpen && props.hoverSide === "bottom" ? 24 : 0,
        }}
        onMouseEnter={() => props.onHoverStart?.()}
        onMouseLeave={() => props.onHoverEnd?.()}
        onClick={() => {
          if (typeof window !== "undefined" && window.innerWidth < 768) {
            setDialogOpen(true);
          }
        }}
      >
        <LeaderCard
          profile={props}
          side={props.hoverSide}
          open={cardOpen}
          onHoverStart={props.onHoverStart}
          onHoverEnd={props.onHoverEnd}
          onOpenChange={handleOpenChange}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="fixed inset-x-0 top-auto bottom-0 max-h-[85dvh] overflow-y-auto border-t-2 border-black bg-white md:hidden">
          <DialogTitle className="sr-only">{props.name}</DialogTitle>
          <MobileContent profile={props} />
        </DialogContent>
      </Dialog>
    </>
  );
}
