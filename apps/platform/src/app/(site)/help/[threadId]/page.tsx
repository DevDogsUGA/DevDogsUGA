import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageShell from "~/components/PageShell";
import AnsweredQuestion from "~/components/SupportWidget/AnsweredQuestion";
import { getPublishedFaqPost } from "~/server/support/forumIndex";

/**
 * /help/:threadId -- one answered #tech-support question, published.
 *
 * Only posts an officer tagged FAQ and marked an answer on, and only their
 * anonymized index text: this page is public and the forum is not. Cmd-K's
 * "Answered questions" group and the widget's suggestions link here.
 */

/**
 * An FAQ post from the support forum index, which the support cron
 * refreshes; five minutes behind it is fine.
 */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: PageProps<"/help/[threadId]">): Promise<Metadata> {
  const post = await getPublishedFaqPost((await params).threadId);
  return post
    ? { title: post.title, description: post.question.slice(0, 160) }
    : {};
}

export default async function HelpPostPage({
  params,
}: PageProps<"/help/[threadId]">) {
  const post = await getPublishedFaqPost((await params).threadId);
  if (!post?.answer) notFound();

  return (
    <PageShell
      accent="violet"
      title={post.title}
      description="An answered question from the DevDogs #tech-support forum."
    >
      <AnsweredQuestion question={post.question} answer={post.answer} />
    </PageShell>
  );
}
