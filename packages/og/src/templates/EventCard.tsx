import { ACCENT, MAUVE, THEME } from "../brand.js";
import type { EventDetail } from "../event.js";
import { Icon } from "../primitives.js";
import { CardShell, cardContext, type CardContext } from "./CardShell.js";

/**
 * One meeting, as everything a person needs to decide whether to come.
 *
 * This is the card the club posts to the GDG on Campus platform, so it is
 * rendered at that platform's banner and square as often as at a link unfurl's
 * 1.91:1 — see `CardShell` for how the three shapes differ. What does not
 * differ is the content: the same night, the same fields, the same rules about
 * what a cancellation withdraws.
 *
 * Every field arrives pre-formatted from `@devdogsuga/og/event`. This card does
 * no date maths and holds no timezone.
 */
export interface EventCardProps extends EventDetail {
  width: number;
  height: number;
}

function titleSize(title: string, { layout }: CardContext): number {
  const base = layout === "square" ? 96 : layout === "wide" ? 72 : 80;
  if (title.length > 34) return base * 0.68;
  if (title.length > 22) return base * 0.82;

  return base;
}

export function EventCard({
  width,
  height,
  title,
  date,
  time,
  location,
  kind,
  agenda,
  cancelled,
  path,
}: EventCardProps) {
  const accent = cancelled ? ACCENT.red400 : ACCENT.cyan400;
  const context = cardContext(width, height);
  const { u } = context;

  // At most two agenda lines, and the count that would have been a third is
  // folded onto the second: "how much else is on" is worth a few words, not a
  // whole row that pushes the club's address off the card. The square layout
  // has the height for a third.
  const room = context.layout === "square" ? 3 : 2;
  const items = agenda ?? [];
  const listed = items.slice(0, room);
  const rest = items.length - listed.length;

  return (
    <CardShell
      width={width}
      height={height}
      eyebrow={kind ?? "Events"}
      accent={accent}
      footer={`devdogsuga.org${path ?? "/events"}`}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18 * u,
          maxWidth: context.contentWidth,
        }}
      >
        {cancelled ? (
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              fontFamily: "Hanken Grotesk",
              fontWeight: 700,
              fontSize: 26 * u,
              letterSpacing: 1.4 * u,
              color: THEME.ink,
              background: ACCENT.red400,
              padding: `${8 * u}px ${20 * u}px`,
              borderRadius: 8 * u,
            }}
          >
            CANCELLED
          </div>
        ) : null}

        <div
          style={{
            fontFamily: "Alan Sans",
            fontWeight: 800,
            fontSize: titleSize(title, context) * u,
            lineHeight: 1.05,
            color: THEME.heading,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 * u }}>
          <Detail icon="CalendarDot" text={date} u={u} />
          {/* The hour and the room go with the meeting. A cancelled night
              keeps its URL — the link is already in Discord and people walk
              over anyway — so the card keeps its date and drops the
              instructions. */}
          {cancelled ? null : <Detail icon="Clock" text={time} u={u} />}
          {cancelled || !location ? null : (
            <Detail icon="MapPin" text={location} u={u} />
          )}
        </div>

        {cancelled?.reason ? (
          <div
            style={{
              fontFamily: "Hanken Grotesk",
              fontSize: 30 * u,
              color: MAUVE[300],
            }}
          >
            {cancelled.reason}
          </div>
        ) : null}

        {listed.length > 0 && !cancelled ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 * u }}>
            {listed.map((item, index) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  fontFamily: "Hanken Grotesk",
                  fontSize: 26 * u,
                  color: MAUVE[400],
                }}
              >
                {index === listed.length - 1 && rest > 0
                  ? `· ${item}  +${rest} more`
                  : `· ${item}`}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}

function Detail({
  icon,
  text,
  u,
}: {
  icon: "CalendarDot" | "Clock" | "MapPin";
  text: string;
  u: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 * u }}>
      <Icon name={icon} size={34 * u} color={MAUVE[400]} />
      <div
        style={{
          fontFamily: "Hanken Grotesk",
          fontWeight: 700,
          fontSize: 30 * u,
          color: MAUVE[200],
        }}
      >
        {text}
      </div>
    </div>
  );
}
