import type { getProfilePageData } from "~/server/loaders/console";

type ProfilePageData = Awaited<ReturnType<typeof getProfilePageData>>;

/**
 * Majors, minors and certificates — read-only, on purpose.
 *
 * The columns landed with the Leadership section (20260827000000), populated
 * from what officers wrote in their submission emails. They are shown to every
 * member because they are facts about that member, not leadership decoration,
 * and they are disabled because there is no write path yet: a field a member
 * can edit needs validation, a mutation, and a moderation story, and none of
 * those exist for these three. Rendering them live but frozen is the honest
 * intermediate state — a member can see what the club has recorded about them
 * and ask for it to be fixed, which they could not do if it were hidden.
 *
 * Empty is the common case. The column defaults to `'{}'` for everyone who was
 * not in that first seed, so the placeholder carries the explanation rather
 * than leaving a blank box with no account of itself.
 */
function ReadOnlyList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-mauve-300">{label}</span>
      <div
        aria-readonly
        className="min-h-9 rounded-sm border-2 border-mauve-800 bg-mauve-950/50 px-3 py-1.5 text-sm text-mauve-400"
      >
        {values.length > 0 ? (
          values.join(", ")
        ) : (
          <span className="text-mauve-600">Not recorded</span>
        )}
      </div>
    </div>
  );
}

export default function AcademicFields({ profile }: ProfilePageData) {
  return (
    <div className="flex flex-col gap-3">
      <ReadOnlyList label="Majors" values={profile?.majors ?? []} />
      <ReadOnlyList label="Minors" values={profile?.minors ?? []} />
      <ReadOnlyList label="Certificates" values={profile?.certificates ?? []} />
    </div>
  );
}
