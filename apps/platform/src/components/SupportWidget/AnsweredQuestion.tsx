"use client";

import { ChatCircleDotsIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import DiscordMarkdown from "./DiscordMarkdown";
import { openSupport } from "./events";

/**
 * The body of a published FAQ post. Mentions were stripped when the post was
 * indexed, so the renderer never has a name to resolve; the empty maps are
 * the honest input, not a shortcut.
 */
export default function AnsweredQuestion({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="bg-card text-card-foreground flex flex-col gap-2 rounded-xl border p-4">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase">
          Question
        </h2>
        <div className="text-sm">
          <DiscordMarkdown content={question} users={{}} roles={{}} />
        </div>
      </section>
      <section className="text-foreground flex flex-col gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <h2 className="flex items-center gap-1 text-xs font-semibold text-emerald-300 uppercase">
          <SealCheckIcon className="size-4" weight="fill" />
          Answer from an officer
        </h2>
        <div className="text-sm">
          <DiscordMarkdown content={answer} users={{}} roles={{}} />
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Still stuck?</span>
        <Button onClick={openSupport}>
          <ChatCircleDotsIcon /> Ask a question
        </Button>
      </div>
    </div>
  );
}
