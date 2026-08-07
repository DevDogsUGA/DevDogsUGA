/**
 * CSS custom-property overrides for `<FeedbackDialog>` and `<ReportDialog>`. Each key maps to a
 * `--dd-*` custom property (see `styles.css`), applied as inline styles on
 * the dialog's root element so they take precedence over the shipped
 * defaults without requiring the host app to use Tailwind.
 */
export interface DialogTheme {
  /** Primary action color (submit button, focus rings). */
  accent: string;
  /** Text/icon color on top of `accent`. */
  accentForeground: string;
  /** Dialog surface color. */
  background: string;
  /** Primary text color. */
  foreground: string;
  /** Secondary text color (placeholders, helper text, close icon). */
  muted: string;
  /** Border color for the dialog, inputs, and buttons. */
  border: string;
  /** Corner radius for the dialog and its controls. */
  radius: string;
  /** Font family for all dialog text. */
  fontFamily: string;
}

/** Light, neutral defaults baked into the shipped `styles.css`. */
export const defaultTheme: DialogTheme = {
  accent: "#06b6d4",
  accentForeground: "#083344",
  background: "#ffffff",
  foreground: "#0f172a",
  muted: "#64748b",
  border: "#cbd5e1",
  radius: "0.5rem",
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
};
