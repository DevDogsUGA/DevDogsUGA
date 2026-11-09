import { Button as EmailButton } from "@react-email/components";
import { theme } from "../theme.js";

/**
 * The single call to action.
 *
 * `padding` is on the anchor rather than a wrapping cell: Outlook collapses
 * padding on table cells around inline elements, which turns a button into
 * bare underlined text. react-email's Button emits the VML fallback that makes
 * this render as a button there too.
 */
export function Button({ href, children }: { href: string; children: string }) {
  return (
    <EmailButton
      href={href}
      style={{
        display: "inline-block",
        backgroundColor: theme.color.accent,
        color: theme.color.accentInk,
        fontSize: theme.size.body,
        fontWeight: 600,
        textDecoration: "none",
        borderRadius: theme.radius,
        padding: "12px 20px",
      }}
    >
      {children}
    </EmailButton>
  );
}
