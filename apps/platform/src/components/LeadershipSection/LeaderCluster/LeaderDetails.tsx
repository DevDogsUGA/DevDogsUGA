import Link from "next/link";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ssr";
import type { LeaderProfile } from "./profile";

const linkCls =
  "flex items-center gap-1.5 rounded-sm border-2 border-black px-2.5 py-1 text-xs font-semibold text-black transition-lift hover:bg-rose-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-block-sm";

function FieldLine({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <p>
      <span className="font-semibold text-mauve-800">
        {label}
        {values.length > 1 ? "s" : ""}:
      </span>{" "}
      {values.join(", ")}
    </p>
  );
}

/**
 * The body an officer's popup and bottom sheet share: academics, bio, links.
 * Returns bare flex items — the host provides the column and its gap. Name
 * and meta line stay with the host, because the popup sits next to a tile
 * that already shows the name while the sheet has to repeat it.
 */
export default function LeaderDetails({ profile }: { profile: LeaderProfile }) {
  return (
    <>
      <div className="flex flex-col gap-0.5 text-xs text-mauve-600">
        <FieldLine label="Major" values={profile.majors} />
        <FieldLine label="Minor" values={profile.minors} />
        <FieldLine label="Cert" values={profile.certificates} />
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
    </>
  );
}
