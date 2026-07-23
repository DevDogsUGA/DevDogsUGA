import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import formsPlugin from "@tailwindcss/forms";

export default {
  content: ["./src/**/*.tsx", "./src/**/*.ts"],
  theme: {
    extend: {
      keyframes: {
        fadeInOverlay: {
          from: { backgroundColor: "transparent" },
          to: { backgroundColor: "hsla(0 0% 0% / .4)" },
        },
        collapse: {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0px" },
        },
        slideUpAndFadeIn: {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(100%)" },
          to: { opacity: "1", transform: "translateY(0px)" },
        },
      },
      animation: {
        fadeInOverlay: "fadeInOverlay 300ms cubic-bezier(0.87, 0, 0.13, 1)",
        collapse: "collapse 300ms cubic-bezier(0.87, 0, 0.13, 1)",
        slideUpAndFadeIn:
          "slideUpAndFadeIn 300ms cubic-bezier(0.87, 0, 0.13, 1)",
        slideUp: "slideUp 200ms cubic-bezier(0.87, 0, 0.13, 1)",
      },
      fontFamily: {
        ...defaultTheme.fontFamily,
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [formsPlugin({ strategy: "class" })],
} satisfies Config;
