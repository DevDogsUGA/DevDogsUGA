import { Heading as EmailHeading, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { theme } from "../theme.js";

export function Heading({ children }: { children: ReactNode }) {
  return (
    <EmailHeading
      as="h1"
      style={{
        margin: `0 0 ${theme.space.block}`,
        fontSize: theme.size.heading,
        lineHeight: "1.3",
        fontWeight: 700,
        color: theme.color.ink,
      }}
    >
      {children}
    </EmailHeading>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{ margin: `0 0 ${theme.space.block}`, fontSize: theme.size.body }}
    >
      {children}
    </Text>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: `${theme.space.block} 0 0`,
        fontSize: theme.size.small,
        color: theme.color.muted,
      }}
    >
      {children}
    </Text>
  );
}
