import { CONTACT, MAUVE, THEME } from "../brand.js";
import { EMAIL_SIGNATURE_ASPECT } from "../formats.js";
import {
  MARK,
  WORDMARK_ON_DARK,
  WORDMARK_ON_LIGHT,
} from "../generated/assets.js";
import { Mark, Wordmark } from "../primitives.js";

/**
 * The lockup that goes at the foot of an email.
 *
 * A signature is the one surface here that is not the club's own, and it is
 * constrained by clients rather than by design:
 *
 *   - PNG, never SVG. Gmail and every Outlook strip `<img>` sources they do not
 *     recognise, and a signature that renders as a broken-image icon is worse
 *     than no signature.
 *   - The ground is painted, not left transparent. A transparent PNG inherits
 *     whatever the client puts behind it, and the dark-mode clients that
 *     inverted the body would leave the mascot's near-black outlines on
 *     near-black.
 *   - Wide and short. It sits beside or beneath a block of contact text, and
 *     anything taller than about a third of its width pushes that text off the
 *     first screen on a phone.
 *
 * Aspect is fixed at {@link EMAIL_SIGNATURE_ASPECT} so the same artwork exports
 * at 1x, 2x and 3x and a client can set the 1x dimensions on the `<img>`.
 */

export interface EmailSignatureProps {
  /** Rendered width. Height follows {@link EMAIL_SIGNATURE_ASPECT}. */
  width: number;
  /**
   * `"light"` for the white body most clients default to, `"dark"` for a
   * signature block that sets its own dark ground.
   */
  ground?: "light" | "dark";
}

export function EmailSignature({
  width,
  ground = "light",
}: EmailSignatureProps) {
  const height = width / EMAIL_SIGNATURE_ASPECT;
  const dark = ground === "dark";
  const u = height / 108;

  return (
    <div
      style={{
        display: "flex",
        width,
        height,
        alignItems: "center",
        gap: 18 * u,
        padding: `${10 * u}px ${14 * u}px`,
        background: dark ? THEME.background : "#ffffff",
      }}
    >
      <Mark asset={MARK} height={height - 20 * u} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 * u }}>
        <Wordmark
          asset={dark ? WORDMARK_ON_DARK : WORDMARK_ON_LIGHT}
          capHeight={30 * u}
        />
        {/*
          The site, and only the site. `devdogs@uga.edu` was here and did not
          fit — but it should not be here even when it does: a signature already
          carries the sender's own address in text a few lines up, and a second
          one baked into a picture is both unclickable and, for anyone who is
          not on the club inbox, wrong.
        */}
        <div
          style={{
            fontFamily: "Hanken Grotesk",
            fontSize: 18 * u,
            color: dark ? MAUVE[400] : MAUVE[600],
          }}
        >
          {CONTACT.site}
        </div>
      </div>
    </div>
  );
}
