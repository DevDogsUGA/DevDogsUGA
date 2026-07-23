"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowSquareOutIcon,
  GithubLogoIcon,
  LinkedinLogoIcon,
  EnvelopeIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import { Dialog, DialogContent, DialogTitle } from "~/ui/dialog";
import LeaderCard from "./LeaderCard";

export interface LeaderProfile {
  name: string;
  titles: string[];
  imageSrc: StaticImageData;
  pronouns: string;
  year: string;
  majors: string[];
  minors?: string[];
  certificates?: string[];
  bio: string;
  portfolioUrl?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  email?: string;
}

const linkCls =
  "flex items-center gap-1.5 rounded-sm border-2 border-black px-2.5 py-1 text-xs font-semibold text-black transition-lift hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-block-sm";

function MobileContent({ profile }: { profile: LeaderProfile }) {
  return (
    <div className="flex flex-col gap-4 p-6 pt-10">
      <div className="flex items-start gap-4">
        <div className="shadow-block-md relative size-20 shrink-0 overflow-hidden rounded-full border-2 border-amber-900 shadow-amber-500">
          <Image
            fill
            alt={profile.name}
            src={profile.imageSrc}
            className="object-cover object-center"
          />
        </div>
        <div>
          <p className="font-display text-base leading-tight font-extrabold text-black">
            {profile.name}
          </p>
          <p className="mt-0.5 text-xs text-mauve-500">
            {profile.pronouns} · Class of {profile.year}
          </p>
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
        {profile.minors && profile.minors.length > 0 && (
          <p>
            <span className="font-semibold text-mauve-800">
              Minor{profile.minors.length > 1 ? "s" : ""}:
            </span>{" "}
            {profile.minors.join(", ")}
          </p>
        )}
        {profile.certificates && profile.certificates.length > 0 && (
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
        <DialogContent className="fixed inset-x-0 bottom-0 top-auto max-h-[85dvh] overflow-y-auto border-t-2 border-black bg-white md:hidden">
          <DialogTitle className="sr-only">{props.name}</DialogTitle>
          <MobileContent profile={props} />
        </DialogContent>
      </Dialog>
    </>
  );
}
