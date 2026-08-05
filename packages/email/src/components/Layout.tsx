import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import { theme } from "../theme.js";

/**
 * The shell every transactional message renders inside.
 *
 * Styles are inline attributes rather than a stylesheet because `<style>` is
 * stripped by Gmail's web client on forwarded mail and by several others
 * outright. react-email's components emit the table scaffolding underneath;
 * this file only decides what it looks like.
 */
export function Layout({
  preview,
  children,
}: {
  /**
   * The line clients show next to the subject in the inbox list.
   *
   * Not optional. Left out, clients fall back to the first text in the body —
   * which for these templates is the greeting, so every message in the list
   * reads "Hi Sam". It is the second thing anyone sees and the cheapest to get
   * right.
   *
   * **It must be a literal, never a prop.** `<Preview>` pads its content with
   * zero-width characters up to a fixed total length, so its output depends on
   * the LENGTH of what it is given — and the compile step renders once, which
   * would bake the padding for a sentinel rather than for the real value. The
   * branching check in `scripts/compile.tsx` catches this, and this is the one
   * place it fires for a reason that is not the template author's fault.
   *
   * The cost is that the preview line is generic while the subject is
   * personalised. That is the right way round: the subject is what the reader
   * scans, and it is a plain header with no padding behaviour.
   */
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: `${theme.space.gutter} 12px`,
          backgroundColor: theme.color.canvas,
          fontFamily: theme.font.sans,
          color: theme.color.ink,
          fontSize: theme.size.body,
          lineHeight: "1.55",
        }}
      >
        <Container
          style={{
            maxWidth: theme.maxWidth,
            margin: "0 auto",
            backgroundColor: theme.color.surface,
            borderRadius: theme.radius,
            padding: theme.space.gutter,
          }}
        >
          <Section>{children}</Section>
          <Hr
            style={{
              borderColor: theme.color.line,
              margin: `${theme.space.gutter} 0 ${theme.space.block}`,
            }}
          />
          <Text
            style={{
              margin: 0,
              fontSize: theme.size.small,
              color: theme.color.muted,
            }}
          >
            DevDogs at the University of Georgia. You are receiving this because
            you have a DevDogs account.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
