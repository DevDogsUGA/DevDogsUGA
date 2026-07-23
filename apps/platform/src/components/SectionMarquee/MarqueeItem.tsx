import type { ReactNode } from "react";
import {
  CodeIcon,
  FlameIcon,
  GitBranchIcon,
  HeartIcon,
  RocketIcon,
  StarIcon,
  LightningIcon,
} from "@phosphor-icons/react/ssr";

const SEPARATOR_ICONS = [
  StarIcon,
  LightningIcon,
  CodeIcon,
  FlameIcon,
  RocketIcon,
  HeartIcon,
  GitBranchIcon,
];

export default function MarqueeItem({
  children,
  index = 0,
}: {
  children: ReactNode;
  index?: number;
}) {
  const Icon = SEPARATOR_ICONS[index % SEPARATOR_ICONS.length]!;
  return (
    <span className="flex items-center gap-6 px-4">
      <span>{children}</span>
      <span className="drop-shadow-block-sm opacity-60">
        <Icon size={18} />
      </span>
    </span>
  );
}
