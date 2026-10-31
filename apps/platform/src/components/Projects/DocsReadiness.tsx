import type { ReactNode } from "react";
import Badge from "~/ui/badge";
import { TextLink } from "~/ui/text-link";
import { livePreviews, type PreviewLoad } from "~/server/docs/livePreview";

/** Problems listed before "and N more": a folder with a hundred broken links is told once. */
const SHOWN = 20;

/**
 * What the docs check found, in the words the project page uses: ready, or a
 * list of what stops them with the file each is about, or why the check
 * couldn't run. Pure, so every state is testable without GitHub.
 */
export function DocsReadinessView({ load }: { load: PreviewLoad }): ReactNode {
  if (!load.ok) {
    return (
      <p className="prj-meta">
        Couldn&rsquo;t check the docs: {load.failure.message}
      </p>
    );
  }
  const { readiness, sha, branch, repository } = load.preview;
  const checked = (
    <p className="prj-meta">
      Checked{" "}
      <TextLink
        href={`https://github.com/${repository}/tree/${sha}/docs`}
        target="_blank"
        rel="noreferrer"
      >
        {repository}@{sha.slice(0, 7)}
      </TextLink>{" "}
      on {branch}.
    </p>
  );
  if (readiness.ready) {
    return (
      <>
        <p className="prj-head">
          <Badge variant="success">Ready to publish</Badge>
          <span className="prj-meta">
            {readiness.pages} {readiness.pages === 1 ? "page" : "pages"}
            {readiness.assets > 0 &&
              `, ${readiness.assets} ${readiness.assets === 1 ? "image" : "images"}`}
          </span>
        </p>
        {checked}
      </>
    );
  }
  const { problems } = readiness;
  return (
    <>
      <p className="prj-head">
        <Badge variant="warning">Not ready</Badge>
        <span className="prj-meta">
          {problems.length} {problems.length === 1 ? "problem" : "problems"} the
          publishing build would refuse
        </span>
      </p>
      <ul className="prj-list">
        {problems.slice(0, SHOWN).map((problem, i) => (
          <li key={i} className="prj-item">
            {problem.file && <span className="prj-title">{problem.file}</span>}
            <p className="prj-meta">{problem.message}</p>
          </li>
        ))}
      </ul>
      {problems.length > SHOWN && (
        <p className="prj-meta">and {problems.length - SHOWN} more</p>
      )}
      {checked}
    </>
  );
}

/** The docs check for one project, loaded from its repository. Streams in under a Suspense. */
export default async function DocsReadiness({
  slug,
  repoId,
}: {
  slug: string;
  repoId: string;
}) {
  return (
    <DocsReadinessView load={await livePreviews().load({ slug, repoId })} />
  );
}
