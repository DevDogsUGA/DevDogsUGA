"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowSquareOutIcon,
  GithubLogoIcon,
  LinkedinLogoIcon,
  EnvelopeIcon,
} from "@phosphor-icons/react/ssr";
import { Dialog, DialogContent, DialogTitle } from "~/ui/dialog";
import LeaderCard from "./LeaderCard";
import Headshot, { formatLeaderMeta } from "./Headshot";

/**
 * One officer, as the cards render them.
 *
 * Shaped by `~/server/loaders/officers.ts` out of `platform.officers`; it was
 * a hand-maintained array of object literals until 20260827000000. Two
 * consequences of that move show up in these types.
 *
 * `imageSrc` is a URL string rather than a `StaticImageData`, because the
 * image is no longer a build-time import from `~/assets` — it lives in the
 * `leadership` bucket and the row stores its key. That is also why
 * `imageBlurDataUrl` exists: a static import carried a blur placeholder with
 * it, and a runtime URL does not.
 *
 * Everything optional is now explicitly `| null` rather than `?`, because the
 * database distinguishes "no answer" from "not asked" and the difference is
 * load-bearing here — six of seven officers stated no pronouns, and a card
 * must render that as silence rather than as a gap in a sentence.
 */
export interface LeaderProfile {
  slug: string;
  name: string;
  titles: string[];
  imageSrc: string | null;
  imageBlurDataUrl: string | null;
  pronouns: string | null;
  year: string | null;
  majors: string[];
  minors: string[];
  certificates: string[];
  bio: string;
  portfolioUrl: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  email: string | null;
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
            blurDataUrl={profile.imageBlurDataUrl}
            // `size-20`, fixed — this sheet only ever opens below md.
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
        <p>
          <span className="font-semibold text-mauve-800">
            Major{profile.majors.length > 1 ? "s" : ""}:
          </span>{" "}
          {profile.majors.join(", ")}
        </p>
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
      <p className="text-xs leading-relaxed text-mauve-700">{profile.bio}</p>
      <div className="flex flex-wrap gap-2">
        {profile.portfolioUrl && (
          <Link href={profile.portfolioUrl} target="_blank" className={linkCls}>
            <ArrowSquareOutIcon size={12} /> Portfolio
          </Link>
        )}
        {profile.githubUrl && (
          <Link href={profile.githubUrl} target="_blank" className={linkCls}>
            <GithubLogoIcon size={12} /> GitHub
          </Link>
        )}
        {profile.linkedinUrl && (
          <Link href={profile.linkedinUrl} target="_blank" className={linkCls}>
            <LinkedinLogoIcon size={12} /> LinkedIn
          </Link>
        )}
        {profile.email && (
          <Link href={`mailto:${profile.email}`} className={linkCls}>
            <EnvelopeIcon size={12} /> Email
          </Link>
        )}
      </div>
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
