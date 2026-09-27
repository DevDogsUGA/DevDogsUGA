import * as React from "react";
import { ACCENT, MAUVE, THEME } from "@devdogsuga/brand";
import { eventKindVisual, type EventDetail } from "@devdogsuga/brand/event";
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
 * Every field arrives pre-formatted from `@devdogsuga/brand/event`. This card does
 * no date maths and holds no timezone.
 */
export interface EventCardProps extends EventDetail {
  width: number;
  height: number;
  cobrand?: boolean;
}

function titleSize(title: string, { layout }: CardContext): number {
  if (layout === "square") {
    if (title.length > 46) return 36;
    if (title.length > 30) return 44;
    if (title.length > 22) return 52;
    return 68;
  }

  const base = layout === "wide" ? 92 : 80;
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
  badge,
  agenda,
  cancelled,
  path,
  cobrand,
}: EventCardProps) {
  const accent = cancelled
    ? ACCENT.red400
    : (badge?.accent ?? eventKindVisual(kind)?.accent ?? ACCENT.cyan400);
  const context = cardContext(width, height);
  const { u } = context;

  // At most two agenda lines, and the count that would have been a third is
  // folded onto the second: "how much else is on" is worth a few words, not a
  // whole row that pushes the club's address off the card. The square layout
  // has the height for a third.
  const room =
    context.layout === "square" ? 3 : context.layout === "wide" ? 1 : 2;
  const items = agenda ?? [];
  const listed = items.slice(0, room);
  const rest = items.length - listed.length;
  const wide = context.layout === "wide";
  const square = context.layout === "square";
  const denseWide = wide && listed.length > 0;

  return (
    <CardShell
      width={width}
      height={height}
      eyebrow={badge?.label ?? kind ?? "Events"}
      accent={accent}
      footer={`devdogsuga.org${path ?? "/events"}`}
      cobrand={cobrand}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: (denseWide ? 12 : wide ? 22 : 18) * u,
          maxWidth: context.contentWidth,
          alignItems: square ? "center" : "stretch",
          textAlign: square ? "center" : "left",
        }}
      >
        {cancelled ? (
          <div
            style={{
              display: "flex",
              alignSelf: square ? "center" : "flex-start",
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
            fontSize: titleSize(title, context) * (denseWide ? 0.62 : 1) * u,
            lineHeight: 1.05,
            color: THEME.heading,
            width: "100%",
            textAlign: square ? "center" : "left",
            overflowWrap: "anywhere",
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: (denseWide ? 6 : wide ? 12 : 10) * u,
            alignItems: square ? "center" : "stretch",
          }}
        >
          <Detail
            icon="CalendarDot"
            text={date}
            u={u}
            wide={wide}
            dense={denseWide}
            centered={square}
          />
          {/* The hour and the room go with the meeting. A cancelled night
              keeps its URL — the link is already in Discord and people walk
              over anyway — so the card keeps its date and drops the
              instructions. */}
          {cancelled ? null : (
            <Detail
              icon="Clock"
              text={time}
              u={u}
              wide={wide}
              dense={denseWide}
              centered={square}
            />
          )}
          {cancelled || !location ? null : (
            <Detail
              icon="MapPin"
              text={location}
              u={u}
              wide={wide}
              dense={denseWide}
              centered={square}
            />
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6 * u,
              alignItems: square ? "center" : "stretch",
            }}
          >
            {listed.map((item, index) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  fontFamily: "Hanken Grotesk",
                  fontSize: (denseWide ? 21 : wide ? 32 : 26) * u,
                  color: MAUVE[400],
                  textAlign: square ? "center" : "left",
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
  wide,
  centered,
  dense,
}: {
  icon: "CalendarDot" | "Clock" | "MapPin";
  text: string;
  u: number;
  wide: boolean;
  centered?: boolean;
  dense?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: (dense ? 11 : wide ? 19 : 16) * u,
        justifyContent: centered ? "center" : "flex-start",
      }}
    >
      <Icon
        name={icon}
        size={(dense ? 28 : wide ? 42 : 34) * u}
        color={MAUVE[400]}
      />
      <div
        style={{
          fontFamily: "Hanken Grotesk",
          fontWeight: 700,
          fontSize: (dense ? 26 : wide ? 38 : 30) * u,
          color: MAUVE[200],
        }}
      >
        {text}
      </div>
    </div>
  );
}
