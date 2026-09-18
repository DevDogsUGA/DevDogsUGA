/**
 * The Changelog, as one component tree with two render targets.
 *
 * The platform mounts `<ChangelogEmail>` inside a server page; the export CLI
 * feeds `<ChangelogDocument>` to `renderToStaticMarkup` and mails the string.
 * Which is why everything here is written to the WORST renderer it will meet
 * — classic Outlook's Word engine — and the page simply inherits the
 * conservatism: tables for layout, longhand font properties (never the `font:`
 * shorthand, which Word applies unreliably), and no alpha anywhere (see
 * `mix`).
 *
 * Backgrounds are never painted inline. The web Outlooks' dark mode rewrites
 * every inline background in place with inline `!important`, which nothing
 * can outrank — so each painted element carries a `bc-` class that
 * `paintCss()` colors from the stylesheet (where those clients leave colors
 * alone), doubled by a `bgcolor` attribute for clients without `<style>`.
 * Text and border colors stay inline with `tc-`/`brc-` classes alongside, so
 * the pinning rules in `darkModeCss()` can re-assert them where a client's
 * dark mode rewrites stylesheets instead. The platform's /changelog pages
 * embed `paintCss()` too; only `ChangelogDocument` adds the pins.
 *
 * The two targets differ only through `RenderContext`: the page passes
 * `next/font` CSS variables and SVG image sources, the exporter passes literal
 * font stacks and `cid:` references to embedded PNGs (Gmail and Outlook strip
 * SVG, which is also why og ships its email signature as PNG).
 */
import type { CSSProperties, ReactNode } from "react";

import { MARK_SIZES, type RenderContext } from "./assets.js";
import {
  bc,
  brc,
  darkModeCss,
  DOT_GRID_CLASS,
  paintCss,
  SLANTS_CLASS,
  tc,
} from "./darkmode.js";
import type { ChangelogEvent, ChangelogIssue } from "./issues.js";
import {
  blockShadow,
  chipColors,
  font,
  type FontStacks,
  HEADING_TINTS,
  KIND,
  PALETTE,
  SITE,
  SOCIAL_LINKS,
  solidBg,
  FONTS_HREF,
  UGA,
} from "./theme.js";

/**
 * React hyphenates unknown camelCase style keys, which is how the two
 * Outlook-only `mso-*` hints reach the wire; CSSProperties just has to be
 * taught they exist.
 */
type EmailCSSProperties = CSSProperties & {
  msoPaddingAlt?: string;
  msoLineHeightRule?: string;
};

const WIDTH = 600;

/** Every layout table shares these; email clients honor the attributes where they ignore the CSS. */
const TABLE_RESET = {
  role: "presentation",
  cellPadding: 0,
  cellSpacing: 0,
  border: 0,
} as const;

/**
 * React 19's types dropped the legacy `bgcolor` from `<td>` (it survives on
 * `<table>`). Classic Outlook still reads the attribute where it ignores the
 * CSS, so it arrives through a spread the checker cannot veto; React renders
 * lowercase unknown attributes verbatim.
 */
function bgAttr(color: string): Record<string, string> {
  return { bgcolor: color };
}

/**
 * A 1px divider as a painted cell, never a border: the web Outlooks' dark
 * mode repaints border colors inline with `!important` (turning dividers
 * near-white on the pinned dark surfaces), while a painted cell gets the
 * full background armor. Card outlines stay true borders — their repaint
 * reads as an intentional outline.
 */
function DividerCell({ vertical = false }: { vertical?: boolean }) {
  const size = vertical ? { width: "1px" } : { height: "1px" };
  return (
    <td
      {...bgAttr(PALETTE.border)}
      {...(vertical ? { width: 1 } : { height: 1 })}
      className={bc(PALETTE.border)}
      style={{ ...size, fontSize: "0px", lineHeight: 0 }}
    >
      {" "}
    </td>
  );
}

/** Three title-bar dots in event-type colors, echoing terminal window controls. */
function KindDots() {
  return (
    <span style={{ fontSize: "0px", lineHeight: 0 }}>
      {[KIND.interest, KIND.build, KIND.study].map((color) => (
        <span
          key={color}
          className={bc(color)}
          style={{
            display: "inline-block",
            width: "11px",
            height: "11px",
            borderRadius: "50%",
            marginLeft: "6px",
          }}
        />
      ))}
    </span>
  );
}

/** The site's event chip: a tinted pill with a faint accent border and lightened accent text, flattened to hex. */
function Chip({
  label,
  color,
  ground = PALETTE.card,
  fonts,
}: {
  label: string;
  color: string;
  ground?: string;
  fonts: FontStacks;
}) {
  const colors = chipColors(color, ground);
  return (
    <span
      className={`${tc(colors.text)} ${bc(colors.fill)} ${brc(colors.border)}`}
      style={{
        display: "inline-block",
        border: `1px solid ${colors.border}`,
        color: colors.text,
        ...font(700, 11, 1, fonts.sans),
        letterSpacing: "0.4px",
        textTransform: "uppercase",
        padding: "5px 10px",
        borderRadius: "20px",
      }}
    >
      {label}
    </span>
  );
}

/**
 * Outlook's Word engine does not reliably apply padding, borders, or
 * backgrounds to anchors. All button geometry lives on a table cell; the
 * anchor is responsible only for the label.
 */
function CtaButton({
  label,
  url,
  color,
  ground,
  fonts,
  compact = false,
}: {
  label: string;
  url: string;
  color: string;
  ground?: string;
  fonts: FontStacks;
  compact?: boolean;
}) {
  const fill = ground ?? color;
  return (
    <table {...TABLE_RESET}>
      <tbody>
        <tr>
          <td
            align="center"
            valign="middle"
            {...bgAttr(fill)}
            className={`${bc(fill)} ${brc(color)}`}
            style={
              {
                border: `1px solid ${color}`,
                borderRadius: "8px",
                padding: compact ? "9px 13px" : "14px 26px",
                msoPaddingAlt: "0",
                whiteSpace: "nowrap",
              } as EmailCSSProperties
            }
          >
            <a
              href={url}
              className={tc(PALETTE.ink)}
              style={
                {
                  display: "block",
                  ...font(
                    compact ? 700 : 800,
                    compact ? 12 : 15,
                    1,
                    fonts.sans,
                  ),
                  color: PALETTE.ink,
                  textDecoration: "none",
                  msoLineHeightRule: "exactly",
                } as EmailCSSProperties
              }
            >
              {label}
              {" "}▸
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * An upcoming-event row, drawn the way the site's schedule list draws one: a
 * stacked weekday / day-number date column, a chip pill, a display-face
 * title, and the time + room in quiet sans.
 */
function EventRow({
  event,
  ctx,
}: {
  event: ChangelogEvent;
  ctx: RenderContext;
}) {
  const { fonts } = ctx;
  const [month, day] = event.date.split(" ");
  return (
    <table
      {...TABLE_RESET}
      width="100%"
      bgcolor={PALETTE.card}
      className={`${bc(PALETTE.card)} ${brc(PALETTE.border)}`}
      style={{
        border: `1px solid ${PALETTE.border}`,
        borderRadius: "10px",
        margin: "0 0 12px",
      }}
    >
      <tbody>
        <tr>
          <td
            width={66}
            align="center"
            valign="middle"
            style={{
              padding: "16px 2px 16px 8px",
            }}
          >
            <div
              className={tc(PALETTE.mute)}
              style={{
                ...font(800, 10, 1, fonts.display),
                letterSpacing: "2px",
                color: PALETTE.mute,
                textTransform: "uppercase",
              }}
            >
              {event.dow}
            </div>
            <div
              className={tc(PALETTE.ink)}
              style={{
                ...font(800, 28, 1.1, fonts.display),
                color: PALETTE.ink,
                fontVariantNumeric: "tabular-nums",
                padding: "3px 0 2px",
              }}
            >
              {day}
            </div>
            <div
              className={tc(PALETTE.dim)}
              style={{
                ...font(700, 10, 1, fonts.display),
                letterSpacing: "2px",
                color: PALETTE.dim,
                textTransform: "uppercase",
              }}
            >
              {month}
            </div>
          </td>
          <DividerCell vertical />
          <td valign="middle" style={{ padding: "15px 17px" }}>
            <table {...TABLE_RESET} width="100%">
              <tbody>
                <tr>
                  <td valign="middle">
                    <Chip
                      label={event.chip}
                      color={event.color}
                      fonts={fonts}
                    />
                    <div
                      className={tc(PALETTE.ink)}
                      style={{
                        ...font(800, 18, 1.25, fonts.display),
                        color: PALETTE.ink,
                        letterSpacing: "-0.2px",
                        padding: "9px 0 5px",
                      }}
                    >
                      {event.title}
                    </div>
                    <div
                      className={tc(PALETTE.mute)}
                      style={{
                        ...font(400, 13, 1.5, fonts.sans),
                        color: PALETTE.mute,
                      }}
                    >
                      {event.time}{" "}
                      <span
                        className={tc(PALETTE.dim)}
                        style={{ color: PALETTE.dim }}
                      >
                        ·
                      </span>{" "}
                      {event.loc}
                    </div>
                    {event.blurb ? (
                      <div
                        className={tc(PALETTE.dim)}
                        style={{
                          ...font(400, 13, 1.55, fonts.sans),
                          color: PALETTE.dim,
                          paddingTop: "7px",
                        }}
                      >
                        {event.blurb}
                      </div>
                    ) : null}
                  </td>
                  {event.rsvp ? (
                    <td
                      valign="middle"
                      align="right"
                      width={74}
                      style={{ paddingLeft: "10px" }}
                    >
                      <CtaButton
                        label="RSVP"
                        url={event.rsvp}
                        color={event.color}
                        ground={PALETTE.card}
                        fonts={fonts}
                        compact
                      />
                    </td>
                  ) : null}
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** A `## heading` in the terminal voice. */
function SectionHeading({
  children,
  color,
  fonts,
  paddingBottom = 14,
}: {
  children: ReactNode;
  color: string;
  fonts: FontStacks;
  paddingBottom?: number;
}) {
  return (
    <div
      className={tc(color)}
      style={{
        ...font(700, 13, 1, fonts.mono),
        color,
        padding: `0 0 ${paddingBottom}px`,
      }}
    >
      ## {children}
    </div>
  );
}

/** One quiet bottom card — the shared frame under "new here?" and "sign-off". */
function QuietCard({ children }: { children: ReactNode }) {
  return (
    <table
      {...TABLE_RESET}
      width="100%"
      bgcolor={PALETTE.card}
      className={`${bc(PALETTE.card)} ${brc(PALETTE.border)}`}
      style={{
        border: `1px solid ${PALETTE.border}`,
        borderRadius: "10px",
      }}
    >
      <tbody>
        <tr>
          <td style={{ padding: "18px 20px" }}>{children}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * The complete issue, from the terminal title bar to the footer lockups —
 * everything inside (and including) the 600px shell.
 */
export function ChangelogEmail({
  issue,
  ctx,
}: {
  issue: ChangelogIssue;
  ctx: RenderContext;
}) {
  const { fonts, assets } = ctx;
  const featured = issue.featured;
  const arrowLinkStyle: CSSProperties = {
    color: PALETTE.ink,
    textDecoration: "none",
  };

  return (
    <table
      {...TABLE_RESET}
      width={WIDTH}
      bgcolor={PALETTE.bg}
      className={`${bc(PALETTE.bg)} ${brc(PALETTE.border)}`}
      style={{
        maxWidth: `${WIDTH}px`,
        width: "100%",
        border: `1px solid ${PALETTE.border}`,
        borderRadius: "14px",
        overflow: "hidden",
      }}
    >
      <tbody>
        {/* terminal title bar */}
        <tr>
          <td
            {...bgAttr(PALETTE.bar)}
            className={`${bc(PALETTE.bar)} ${DOT_GRID_CLASS}`}
            style={{
              padding: "12px 18px",
            }}
          >
            <table {...TABLE_RESET} width="100%">
              <tbody>
                <tr>
                  <td width={86}>
                    <KindDots />
                  </td>
                  <td
                    align="center"
                    className={tc(PALETTE.dim)}
                    style={{
                      ...font(600, 12, 1, fonts.mono),
                      color: PALETTE.dim,
                    }}
                  >
                    devdogs -{" "}
                    <span
                      className={tc(KIND.workshop)}
                      style={{ color: KIND.workshop }}
                    >
                      changelog
                    </span>{" "}
                    - 80×24
                  </td>
                  <td
                    width={86}
                    align="right"
                    className={tc(PALETTE.dim)}
                    style={{
                      ...font(600, 12, 1, fonts.mono),
                      color: PALETTE.dim,
                    }}
                  >
                    {issue.sendLabel}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>

        <tr>
          <DividerCell />
        </tr>

        {/* masthead: the DevDogs lockup and "Changelog_" on one shared line */}
        <tr>
          <td style={{ padding: "24px 22px 4px" }}>
            <table {...TABLE_RESET} width="100%">
              <tbody>
                <tr>
                  <td valign="middle">
                    <table {...TABLE_RESET}>
                      <tbody>
                        <tr>
                          <td valign="middle">
                            <img
                              src={assets.devdogsLockup}
                              width={MARK_SIZES.devdogsLockup.width}
                              height={MARK_SIZES.devdogsLockup.height}
                              alt="DevDogs"
                              style={{ display: "block" }}
                            />
                          </td>
                          <td
                            valign="bottom"
                            style={{ padding: "0 0 5px 8px" }}
                          >
                            <span
                              className={tc(KIND.workshop)}
                              style={{
                                ...font(700, 22, 1, fonts.mono),
                                letterSpacing: "-0.4px",
                                color: KIND.workshop,
                              }}
                            >
                              Changelog_
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                  <td valign="middle" align="right">
                    <div
                      className={tc(UGA)}
                      style={{ ...font(800, 12, 1, fonts.mono), color: UGA }}
                    >
                      v{issue.version}
                    </div>
                    <div
                      className={tc(PALETTE.mute)}
                      style={{
                        ...font(600, 12, 1, fonts.mono),
                        color: PALETTE.mute,
                        paddingTop: "5px",
                      }}
                    >
                      {issue.term}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div
              className={tc(PALETTE.mute)}
              style={{
                ...font(400, 13, 1.6, fonts.mono),
                color: PALETTE.mute,
                paddingTop: "16px",
              }}
            >
              <span
                className={tc(KIND.workshop)}
                style={{ color: KIND.workshop, fontWeight: 700 }}
              >
                $
              </span>{" "}
              <span
                className={tc(KIND.workshop)}
                style={{ color: KIND.workshop }}
              >
                changelog
              </span>{" "}
              <span className={tc(PALETTE.ink)} style={{ color: PALETTE.ink }}>
                {issue.command.replace(/^changelog\s*/, "")}
              </span>
            </div>
            {/* The "view in browser" escape hatch, in the terminal costume:
                the command's output points at the archive page rendering this
                same tree, phrased as the curl that would fetch it. */}
            <div
              className={tc(PALETTE.dim)}
              style={{
                ...font(400, 13, 1.6, fonts.mono),
                color: PALETTE.dim,
                paddingTop: "3px",
              }}
            >
              → mirror:{" "}
              <a
                href={`${SITE}/changelog/${issue.version}`}
                className={tc(KIND.build)}
                style={{ color: KIND.build, textDecoration: "none" }}
              >
                curl devdogsuga.org/changelog/{issue.version}
              </a>
            </div>
          </td>
        </tr>

        {/* slant stripe */}
        <tr>
          <td style={{ padding: "14px 22px 0" }}>
            {/* a table cell rather than a div so the stripe can carry the
                bgcolor attribute every other painted surface has */}
            <table {...TABLE_RESET} width="100%">
              <tbody>
                <tr>
                  <td
                    {...bgAttr(UGA)}
                    className={`${bc(UGA)} ${SLANTS_CLASS}`}
                    height={9}
                    style={{
                      height: "9px",
                      borderRadius: "4px",
                      fontSize: "0px",
                      lineHeight: 0,
                    }}
                  >
                    {" "}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>

        {/* intro */}
        <tr>
          <td style={{ padding: "20px 22px 6px" }}>
            <div
              className={tc(PALETTE.ink)}
              style={{
                ...font(800, 24, 1.25, fonts.display),
                color: PALETTE.ink,
                letterSpacing: "-0.3px",
              }}
            >
              {issue.tagline}
            </div>
            <div
              className={tc(PALETTE.mute)}
              style={{
                ...font(400, 15, 1.6, fonts.sans),
                color: PALETTE.mute,
                paddingTop: "11px",
              }}
            >
              {issue.intro}
            </div>
          </td>
        </tr>

        {/* featured / hero event */}
        <tr>
          <td style={{ padding: "20px 22px 6px" }}>
            <SectionHeading color={featured.color} fonts={fonts}>
              {issue.featuredLabel}
            </SectionHeading>
            <table
              {...TABLE_RESET}
              width="100%"
              bgcolor={PALETTE.card2}
              className={`${bc(PALETTE.card2)} ${brc(featured.color)}`}
              style={{
                border: `1px solid ${featured.color}`,
                borderRadius: "10px",
                ...blockShadow(featured.color),
              }}
            >
              <tbody>
                <tr>
                  <td style={{ padding: "22px 22px 24px" }}>
                    <Chip
                      label={featured.chip}
                      color={featured.color}
                      ground={PALETTE.card2}
                      fonts={fonts}
                    />
                    <div
                      className={tc(PALETTE.ink)}
                      style={{
                        ...font(700, 30, 1.1, fonts.display),
                        color: PALETTE.ink,
                        letterSpacing: "-0.4px",
                        padding: "14px 0 8px",
                      }}
                    >
                      {featured.title}
                    </div>
                    <table {...TABLE_RESET} style={{ margin: "2px 0 4px" }}>
                      <tbody>
                        <tr>
                          <td
                            className={tc(PALETTE.ink)}
                            style={{
                              ...font(700, 14, 1.5, fonts.sans),
                              color: PALETTE.ink,
                              paddingRight: "8px",
                            }}
                          >
                            {featured.dow}, {featured.date}
                          </td>
                          <DividerCell vertical />
                          <td
                            className={tc(PALETTE.mute)}
                            style={{
                              ...font(400, 14, 1.5, fonts.sans),
                              color: PALETTE.mute,
                              padding: "0 8px",
                            }}
                          >
                            {featured.time}
                          </td>
                          <DividerCell vertical />
                          <td
                            className={tc(PALETTE.mute)}
                            style={{
                              ...font(400, 14, 1.5, fonts.sans),
                              color: PALETTE.mute,
                              padding: "0 8px",
                            }}
                          >
                            {featured.loc}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div
                      className={tc(PALETTE.mute)}
                      style={{
                        ...font(400, 15, 1.6, fonts.sans),
                        color: PALETTE.mute,
                        paddingTop: "10px",
                      }}
                    >
                      {featured.blurb}
                    </div>
                    <div
                      style={{
                        height: "18px",
                        lineHeight: "18px",
                        fontSize: "0px",
                      }}
                    >
                      {" "}
                    </div>
                    <CtaButton
                      label={issue.cta}
                      url={featured.rsvp ?? `${SITE}/events`}
                      color={UGA}
                      fonts={fonts}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>

        {/* upcoming events */}
        <tr>
          <td style={{ padding: "22px 22px 0" }}>
            <SectionHeading color={PALETTE.ink} fonts={fonts}>
              upcoming
            </SectionHeading>
            {issue.upcoming.map((event, index) => (
              <EventRow
                key={`${event.date}-${index}`}
                event={event}
                ctx={ctx}
              />
            ))}
            <div style={{ padding: "2px 0 4px", textAlign: "center" }}>
              <a
                href={`${SITE}/events`}
                className={tc(KIND.build)}
                style={{
                  ...font(700, 13, 1, fonts.mono),
                  color: KIND.build,
                  textDecoration: "none",
                }}
              >
                → full calendar &amp; subscribe (.ics)
              </a>
            </div>
          </td>
        </tr>

        {/* new here? */}
        <tr>
          <td style={{ padding: "18px 22px 0" }}>
            <QuietCard>
              <SectionHeading
                color={HEADING_TINTS.newHere}
                fonts={fonts}
                paddingBottom={11}
              >
                new here?
              </SectionHeading>
              <div
                className={tc(PALETTE.mute)}
                style={{
                  ...font(400, 14, 1.6, fonts.sans),
                  color: PALETTE.mute,
                  paddingBottom: "12px",
                }}
              >
                No experience required, ever. Bring a laptop if you've got one,
                curiosity if you don't. Start here:
              </div>
              <div
                className={tc(PALETTE.ink)}
                style={{ ...font(600, 14, 2, fonts.mono), color: PALETTE.ink }}
              >
                <a
                  href="https://discord.gg/devdogs"
                  className={tc(PALETTE.ink)}
                  style={arrowLinkStyle}
                >
                  <span
                    className={tc(KIND.build)}
                    style={{ color: KIND.build }}
                  >
                    →
                  </span>{" "}
                  join the Discord
                </a>
                <br />
                <a
                  href={`${SITE}/events`}
                  className={tc(PALETTE.ink)}
                  style={arrowLinkStyle}
                >
                  <span
                    className={tc(KIND.workshop)}
                    style={{ color: KIND.workshop }}
                  >
                    →
                  </span>{" "}
                  add our events to your calendar
                </a>
                <br />
                <a
                  href="https://github.com/devdogsuga"
                  className={tc(PALETTE.ink)}
                  style={arrowLinkStyle}
                >
                  <span
                    className={tc(KIND.social)}
                    style={{ color: KIND.social }}
                  >
                    →
                  </span>{" "}
                  browse what members are building
                </a>
              </div>
            </QuietCard>
          </td>
        </tr>

        {/* sign-off */}
        <tr>
          {/* 24px below the last card, mirroring the 24px above the masthead,
              so the content column meets both bar dividers evenly. */}
          <td style={{ padding: "18px 22px 24px" }}>
            <QuietCard>
              <SectionHeading
                color={HEADING_TINTS.signoff}
                fonts={fonts}
                paddingBottom={11}
              >
                sign-off
              </SectionHeading>
              <div
                className={tc(PALETTE.mute)}
                style={{
                  ...font(400, 14, 1.6, fonts.sans),
                  color: PALETTE.mute,
                }}
              >
                {issue.signoff}
                <div
                  className={tc(PALETTE.dim)}
                  style={{
                    color: PALETTE.dim,
                    fontSize: "13px",
                    textAlign: "right",
                    paddingTop: "4px",
                  }}
                >
                  {"— the DevDogs officers"}
                </div>
              </div>
            </QuietCard>
          </td>
        </tr>

        <tr>
          <DividerCell />
        </tr>

        {/* footer: both lockups on one centered line, then the socials.
            No unsubscribe — this goes out over the University listserv. */}
        <tr>
          <td
            align="center"
            {...bgAttr(PALETTE.bar)}
            className={`${bc(PALETTE.bar)} ${DOT_GRID_CLASS}`}
            style={{
              padding: "28px 22px 30px",
            }}
          >
            <table {...TABLE_RESET} style={{ margin: "0 auto" }}>
              <tbody>
                <tr>
                  <td align="center" valign="top" style={{ padding: "0 20px" }}>
                    <img
                      src={assets.devdogsLockup}
                      width={MARK_SIZES.devdogsLockup.width}
                      height={MARK_SIZES.devdogsLockup.height}
                      alt="DevDogs"
                      style={{ display: "block" }}
                    />
                  </td>
                  {/* 7px down so the GDG wordmark's baseline sits on the DevDogs
                      wordmark's, with "On Campus · UGA" hanging as a subtitle. */}
                  <td
                    align="center"
                    valign="top"
                    style={{ padding: "7px 20px 0" }}
                  >
                    <img
                      src={assets.gdgcLockup}
                      width={MARK_SIZES.gdgcLockup.width}
                      height={MARK_SIZES.gdgcLockup.height}
                      alt="Google Developer Groups On Campus · University of Georgia"
                      style={{ display: "block" }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <table {...TABLE_RESET} style={{ margin: "20px auto 0" }}>
              <tbody>
                <tr>
                  {SOCIAL_LINKS.map((social) => (
                    <td
                      key={social.label}
                      align="center"
                      valign="middle"
                      style={{ padding: "0 10px", whiteSpace: "nowrap" }}
                    >
                      <a
                        href={social.url}
                        className={tc(PALETTE.ink)}
                        style={{
                          ...font(600, 13, "17px", fonts.mono),
                          color: PALETTE.ink,
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <img
                          src={assets.socialIcon(social.icon)}
                          width={MARK_SIZES.socialIcon.width}
                          height={MARK_SIZES.socialIcon.height}
                          alt=""
                          style={{
                            display: "inline-block",
                            verticalAlign: "middle",
                            border: 0,
                            outline: "none",
                          }}
                        />
                        {" "}
                        <span
                          className={tc(PALETTE.ink)}
                          style={{ color: PALETTE.ink }}
                        >
                          {social.label}
                        </span>
                      </a>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <div
              className={tc(PALETTE.dim)}
              style={{
                ...font(400, 12, 1.7, fonts.mono),
                color: PALETTE.dim,
                paddingTop: "16px",
              }}
            >
              {/* A deliberate two-line stack: left to wrap on its own, the
                  line broke with "Campus" orphaned. */}
              DevDogs at the University of Georgia
              <br />
              Google Developer Group on Campus
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * The full mail document around `ChangelogEmail`: head metas, the Google Fonts
 * link (honored by Apple/iOS Mail, ignored by Gmail and Outlook, which fall
 * down the literal stacks), the hidden inbox-preview line, and the centered
 * canvas. Only the exporter renders this; the platform pages already have a
 * document of their own.
 */
export function ChangelogDocument({
  issue,
  ctx,
}: {
  issue: ChangelogIssue;
  ctx: RenderContext;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="x-apple-disable-message-reformatting" />
        {/* "light dark" is deliberate although the design never changes: it
            says "this email handles both schemes itself", which is what stops
            scheme-aware clients from recoloring it. */}
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <title>{issue.title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link href={FONTS_HREF} rel="stylesheet" />
        <style
          dangerouslySetInnerHTML={{ __html: `@import url('${FONTS_HREF}');` }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `${paintCss()}\n${darkModeCss()}`,
          }}
        />
      </head>
      {/* The body carries the document's ONE inline background, on purpose:
          the web Outlooks' dark mode repaints inline backgrounds in place and
          stamps `data-ogsb` on the element it repainted — and an ancestor
          with that attribute is what switches on every scoped pin in
          darkModeCss(). The repainted body itself is fully covered by the
          pinned full-width table below, so the sacrifice never shows. */}
      <body
        className={bc(PALETTE.bg)}
        {...bgAttr(PALETTE.bg)}
        style={{ margin: 0, padding: 0, ...solidBg(PALETTE.bg) }}
      >
        <div
          style={{
            display: "none",
            maxHeight: 0,
            overflow: "hidden",
            opacity: 0,
          }}
        >
          {issue.preview}
        </div>
        <table
          {...TABLE_RESET}
          width="100%"
          bgcolor={PALETTE.bg}
          className={bc(PALETTE.bg)}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: "24px 12px" }}>
                <ChangelogEmail issue={issue} ctx={ctx} />
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
