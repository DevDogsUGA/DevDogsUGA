import type { Metadata } from "next";
import Link from "next/link";

import "~/components/Content/content.css";

/**
 * Static copy; changes only with a deploy.
 */
export const revalidate = false;

/**
 * The description is the one `config/nav.ts` gives this page under
 * `SEARCH_ONLY_PAGES`, like the privacy policy's.
 */
export const metadata: Metadata = {
  title: "Terms of Service | DevDogs",
  description: "The rules for using DevDogs, its platform, and its apps.",
};

/** `"use cache"` moved onto the component. See `/community` for why. */
export default async function Terms() {
  "use cache";

  return (
    <article className="content-legal">
      <h1 id="devdogs-terms-of-service">DevDogs Terms of Service</h1>
      <p>
        <strong>Effective date:</strong> October 27, 2026
      </p>
      <p>
        These terms apply when you use devdogsuga.org, the DevDogs apps DogDays
        (dogdays.dev) and DogPack, the RoboDog Discord bot, and the DevDogs
        GitHub organization and Discord server (together, &quot;DevDogs&quot;).
        DevDogs is a registered student organization at the University of
        Georgia, run jointly with Google Developer Groups on Campus: UGA.
        &quot;We&quot; means DevDogs and its officers. &quot;You&quot; means
        anyone using DevDogs.
      </p>
      <p>
        By signing in or taking part, you agree to these terms and the{" "}
        <Link href="/legal/privacy">Privacy Policy</Link>.
      </p>
      <h2 id="1-who-can-use-devdogs">1. Who can use DevDogs</h2>
      <ul>
        <li>
          <strong>Accounts:</strong> accounts are only for UGA students who have
          paid their student fees, and you sign in with your UGA Google account
          (<code>@uga.edu</code>). You must be at least 13. Anyone can browse
          the public site and ask for help as a guest.
        </li>
        <li>
          <strong>Membership:</strong> being a DevDogs member, which includes
          appearing on our Involvement Network roster, follows the club&apos;s
          constitution. Having an account isn&apos;t the same as membership.
        </li>
        <li>
          <strong>One account each:</strong> don&apos;t share your account or
          sign in as someone else.
        </li>
      </ul>
      <h2 id="2-your-account">2. Your account</h2>
      <p>
        You&apos;re responsible for what happens under your account. Keep your
        UGA, GitHub and Discord accounts secure, and tell us at{" "}
        <strong>
          <a href="mailto:devdogs@uga.edu">devdogs@uga.edu</a>
        </strong>{" "}
        if you think someone else has access.
      </p>
      <p>When you link GitHub or Discord, you let us do the following:</p>
      <ul>
        <li>
          <strong>GitHub:</strong> we record your GitHub username and ID.
          Linking doesn&apos;t add you to the DevDogs GitHub organization; you
          contribute from your own fork.
        </li>
        <li>
          <strong>Discord:</strong> we add you to the server, set your nickname,
          and sync your roles.
        </li>
      </ul>
      <p>
        The{" "}
        <Link href="/legal/privacy#3-connected-accounts">Privacy Policy</Link>{" "}
        explains this in detail.
      </p>
      <h2 id="3-conduct">3. Conduct</h2>
      <p>
        Treat everyone with respect everywhere DevDogs operates: at events, on
        Discord, on GitHub and on the platform. In particular, don&apos;t:
      </p>
      <ul>
        <li>harass, threaten or discriminate against anyone</li>
        <li>
          post content that&apos;s illegal, sexually explicit, or that you
          don&apos;t have the right to share
        </li>
        <li>
          spam, scrape, or try to get around rate limits, Turnstile or
          permissions
        </li>
        <li>
          access data or systems you aren&apos;t authorized to use, or test the
          security of DevDogs without written permission from an officer
        </li>
        <li>
          submit false attendance, check in for someone else, or misrepresent EL
          reflections
        </li>
      </ul>
      <p>
        <strong>To report a problem:</strong> use the report button on the
        platform, or email{" "}
        <strong>
          <a href="mailto:devdogs@uga.edu">devdogs@uga.edu</a>
        </strong>
        .
      </p>
      <h2 id="4-moderation">4. Moderation</h2>
      <p>
        Officers may review reports and take action proportionate to the
        problem. Possible actions:
      </p>
      <ul>
        <li>a warning</li>
        <li>hiding content while it&apos;s reviewed</li>
        <li>removing content</li>
        <li>suspending or banning an account</li>
        <li>
          removing access to the GitHub organization, a repository or the
          Discord server
        </li>
      </ul>
      <p>
        Serious or repeated violations may also be referred under the club
        constitution or to UGA. We record moderation actions as described in the
        Privacy Policy. If you think an action was a mistake, email{" "}
        <strong>
          <a href="mailto:devdogs@uga.edu">devdogs@uga.edu</a>
        </strong>
        . Someone who wasn&apos;t involved in the original decision will review
        it.
      </p>
      <h2 id="5-attendance-and-experiential-learning">
        5. Attendance and Experiential Learning
      </h2>
      <ul>
        <li>
          <strong>Your own check-ins only:</strong> check in only for yourself,
          and only for events you actually attend.
        </li>
        <li>
          <strong>Your own reflections:</strong> reflections must be your own
          work. Every revision is saved and officers can review the history.
        </li>
        <li>
          <strong>EL credit isn&apos;t ours to give:</strong> DevDogs collects
          attendance and reflection evidence. An independent UGA process decides
          whether to award EL credit, and DevDogs doesn&apos;t guarantee it.
        </li>
      </ul>
      <h2 id="6-github-and-recognition">6. GitHub and recognition</h2>
      <ul>
        <li>
          <strong>Contributing:</strong> everyone contributes to DevDogs
          repositories from a fork. Push access to a DevDogs repository is for
          officers, leads and reviewers, and may be removed when their role
          ends.
        </li>
        <li>
          <strong>Stars and awards:</strong> stars, streaks and other
          recognition are for fun and motivation. They have no cash value. We
          may correct them if they were awarded by mistake or through a rule
          violation.
        </li>
      </ul>
      <h2 id="7-content-and-code-you-contribute">
        7. Content and code you contribute
      </h2>
      <ul>
        <li>
          <strong>Code:</strong> DevDogs repositories are open source. That
          includes the DevDogs monorepo, and it&apos;s licensed under the{" "}
          <a
            href="https://opensource.org/license/bsd-3-clause"
            target="_blank"
            rel="noopener noreferrer"
          >
            BSD 3-Clause License
          </a>
          . What you contribute to a repository is licensed under that
          repository&apos;s license. This covers pull requests, issues and code
          review. Contribute only code you have the right to contribute.
        </li>
        <li>
          <strong>Other content:</strong> you keep ownership of your profile,
          reflections and support messages. You let DevDogs store and display
          them to run DevDogs as described in the Privacy Policy. For example,
          support answers may be published, with your identity removed, as FAQs.
        </li>
        <li>
          <strong>Our name and logos:</strong> the DevDogs name, logos and brand
          assets belong to DevDogs, and the UGA marks belong to UGA. Don&apos;t
          use them in a way that suggests we endorse something we don&apos;t,
          unless an officer approves it.
        </li>
      </ul>
      <h2 id="8-developer-tools">8. Developer tools</h2>
      <p>
        <strong>Sign in with DevDogs</strong> and the other developer tools are
        only for testing your own contributions to DevDogs apps on your own
        computer:
      </p>
      <ul>
        <li>
          <strong>Who you can sign in as:</strong> only yourself, or test
          accounts you create. Don&apos;t use these tools to access anyone
          else&apos;s account or data.
        </li>
        <li>
          <strong>What they&apos;re not for:</strong> don&apos;t build or run
          anything public with them.
        </li>
        <li>
          <strong>Test accounts:</strong> these are placeholders. Don&apos;t use
          them to take part in DevDogs: no attendance, reports or anything else
          a real member does.
        </li>
        <li>
          <strong>Misuse:</strong> we may revoke developer access that&apos;s
          misused.
        </li>
      </ul>
      <h2 id="9-ending-your-account">9. Ending your account</h2>
      <ul>
        <li>
          <strong>Leaving:</strong> you can stop using DevDogs at any time. To
          delete your account, follow the Privacy Policy. Deletion is permanent.
        </li>
        <li>
          <strong>Removal by us:</strong> we may suspend or close accounts that
          violate these terms, or that no longer meet the eligibility rules in
          §1. Graduated members may lose member-only access.
        </li>
      </ul>
      <h2 id="10-no-warranty">10. No warranty</h2>
      <p>
        DevDogs is run by student volunteers. The platform and our events are
        provided &quot;as is&quot;, without warranties of any kind. We do our
        best to keep things running and your data safe, but we can&apos;t
        promise the service will always be available or free of errors.
      </p>
      <h2 id="11-limitation-of-liability">11. Limitation of liability</h2>
      <p>
        To the extent permitted by law, DevDogs and its officers aren&apos;t
        liable for indirect or consequential losses arising from your use of
        DevDogs. This includes lost data, lost access, and EL or academic
        outcomes. Nothing in these terms limits your rights under UGA policy or
        any liability that can&apos;t be limited by law.
      </p>
      <h2 id="12-changes">12. Changes</h2>
      <p>
        We may update these terms. When we do, we change the effective date
        above. For significant changes, we also announce them on Discord. If you
        keep using DevDogs after a change, you&apos;re agreeing to the updated
        terms.
      </p>
      <h2 id="13-questions">13. Questions</h2>
      <p>
        Email{" "}
        <strong>
          <a href="mailto:devdogs@uga.edu">devdogs@uga.edu</a>
        </strong>
        .
      </p>
      <h2 id="dogdays">14. DogDays</h2>
      <p>DogDays (dogdays.dev) helps you plan a semester&apos;s schedule.</p>
      <ul>
        <li>
          <strong>Not official registration:</strong> course, section and
          meeting data comes from public UGA registrar listings and may be
          incomplete, late or wrong. A DogDays plan doesn&apos;t register you
          for anything. Check the official registrar before you rely on a time,
          room or seat, and register through UGA.
        </li>
        <li>
          <strong>Maps:</strong> the Map of Classes uses Google Maps, so by
          using it you also agree to the{" "}
          <a
            href="https://maps.google.com/help/terms_maps/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Maps Terms of Service
          </a>
          . Building locations are approximate.
        </li>
        <li>
          <strong>Your plans:</strong> what you save is yours. How we store it
          is in the <Link href="/legal/privacy#dogdays">Privacy Policy</Link>.
        </li>
      </ul>
      <h2 id="dogpack">15. DogPack</h2>
      <p>
        DogPack helps UGA students find and join study sessions for the courses
        they&apos;re taking. It&apos;s covered by §3 and §4, plus this section.
      </p>
      <ul>
        <li>
          <strong>Who can use it:</strong> UGA students with a DevDogs account
          (§1). Sessions are visible to students enrolled in the same course.
        </li>
        <li>
          <strong>Meeting in person is your decision:</strong> DevDogs
          doesn&apos;t vet the people or the places behind a session. Choose
          public, well-lit places, tell someone where you&apos;re going, and
          leave if you&apos;re uncomfortable. You&apos;re responsible for your
          own safety.
        </li>
        <li>
          <strong>Be accurate:</strong> enroll only in courses you&apos;re
          taking, host only sessions you intend to run, and cancel in the app if
          your plans change.
        </li>
        <li>
          <strong>Reporting and blocking:</strong> use the report and block
          options in the app. Officers may hide a session, remove a member from
          DogPack or ban an account, as described in §4.
        </li>
        <li>
          <strong>Academic integrity:</strong> study sessions are for learning
          together. Don&apos;t use DogPack to share graded work or break your
          course&apos;s collaboration rules.
        </li>
        <li>
          <strong>Your data:</strong> what DogPack collects, who sees it and how
          to delete it is in the{" "}
          <Link href="/legal/privacy#dogpack">Privacy Policy</Link>.
        </li>
      </ul>
    </article>
  );
}
