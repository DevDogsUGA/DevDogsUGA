import { ChatsTeardropIcon, HashIcon } from "@phosphor-icons/react/ssr";

/**
 * A Discord channel, drawn the way Discord draws a channel mention in a
 * message: a blurple-tinted pill with the channel's icon and name. `forum`
 * swaps the "#" for Discord's forum-channel speech bubbles. Ported from
 * Backstage's slides (`DiscordChannel.vue`), so the widget names the forum
 * the way the workshop decks do.
 *
 * Inline rather than flex so it sits on the text's baseline without making
 * its line taller.
 */
export default function DiscordChannel({
  name,
  forum = false,
}: {
  name: string;
  forum?: boolean;
}) {
  const Icon = forum ? ChatsTeardropIcon : HashIcon;
  return (
    <span className="inline rounded-[0.25em] bg-[#5865F2]/30 [box-decoration-break:clone] py-[0.05em] pr-[0.3em] pl-[0.2em] font-semibold whitespace-nowrap text-[#c9cdfb]">
      <Icon
        aria-hidden
        weight="bold"
        className="mr-[0.15em] inline-block align-[-0.12em] text-[0.9em]"
      />
      {name}
    </span>
  );
}
