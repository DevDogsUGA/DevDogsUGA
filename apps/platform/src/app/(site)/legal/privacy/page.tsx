import type { Metadata } from "next";
import Link from "next/link";

/**
 * Static copy; changes only with a deploy.
 */
export const revalidate = false;

/**
 * The description is the one `config/nav.ts` gives this page under
 * `SEARCH_ONLY_PAGES`: the list of routes that are public and indexed but not
 * in the navbar, which is exactly what this is.
 */
export const metadata: Metadata = {
  title: "Privacy Policy | DevDogs",
  description: "How DevDogs collects, uses, and protects your data.",
};

/** `"use cache"` moved onto the component. See `/community` for why. */
export default async function Privacy() {
  "use cache";

  return (
    <div className="prose-sm prose-headings:text-balance mx-auto mt-19 max-w-xl px-3 pt-12 pb-24">
      <h1 id="devdogs-privacy-policy">DevDogs Privacy Policy</h1>
      <p>
        <strong>Effective date:</strong> October 10, 2024
      </p>
      <p>
        <strong>Last updated:</strong> October 5, 2026
      </p>
      <p>
        DevDogs is a registered student organization at the University of
        Georgia. It&apos;s also UGA&apos;s chapter of Google Developer Groups on
        Campus (GDGC). See §4 for what that means for your data.
      </p>
      <p>
        This policy explains what data we collect, why, who can see it, and how
        to get a copy or have it removed. It covers:
      </p>
      <ul>
        <li>
          <strong>devdogsuga.org</strong>: the public site, the member platform,
          and the help/support widget
        </li>
        <li>
          <strong>DevDogs apps</strong> such as DogDays (dogdays.dev), which
          share your devdogsuga.org account
        </li>
        <li>
          <strong>RoboDog</strong>: the DevDogs Discord bot
        </li>
        <li>
          The DevDogs GitHub organization and Discord server, where the platform
          manages your access
        </li>
      </ul>
      <p>
        Using these services also means agreeing to our{" "}
        <Link href="/legal/terms">Terms of Service</Link>.
      </p>
      <h2 id="1-what-we-collect">1. What we collect</h2>
      <h3 id="from-you-through-your-account-and-profile">
        From you, through your account and profile
      </h3>
      <ul>
        <li>
          <strong>Identity:</strong> preferred name, pronouns, graduation
          semester and year, and academic programs (majors, minors,
          certificates).
        </li>
        <li>
          <strong>Profile:</strong> a short bio, profile picture, a handle (your{" "}
          <code>@name</code>), and up to five links you choose to add.
        </li>
        <li>
          <strong>Connected accounts:</strong> your UGA Google account, which is
          how you sign in. You can also choose to link GitHub, Discord and
          LinkedIn. We store the username and ID of each linked account so we
          can manage your access (see §3).
        </li>
      </ul>
      <h3 id="from-uga">From UGA</h3>
      <ul>
        <li>
          <strong>Involvement Network roster:</strong> your legal first and last
          name, the name on the roster, and your UGA email. Officers import this
          from the club&apos;s roster so we can confirm your membership and
          match attendance records.
        </li>
      </ul>
      <h3 id="from-your-participation">From your participation</h3>
      <ul>
        <li>
          <strong>Attendance:</strong> which meetings you attended, when you
          checked in, and how (QR code, link, or added by an officer).
        </li>
        <li>
          <strong>Check-in survey:</strong> when you check in, we may ask a few
          short optional questions. Examples: how you heard about the event,
          your experience level, your familiarity with Google developer tools,
          and your company or organization if you&apos;re a guest.
        </li>
        <li>
          <strong>Competitions and teams:</strong> the teams you join, your
          competition entries, merged pull requests on DevDogs repositories, and
          the stars and streaks you earn.
        </li>
        <li>
          <strong>Experiential Learning (EL) evidence:</strong> reflections you
          write for eligible meetings and competitions, including every saved
          revision.
        </li>
        <li>
          <strong>Photos:</strong> we take photos at events, and you may appear
          in them.
        </li>
      </ul>
      <h3 id="automatically">Automatically</h3>
      <ul>
        <li>
          <strong>Security and abuse prevention:</strong> your IP address, which
          we use for rate limiting. Cloudflare Turnstile also checks that
          you&apos;re not a bot when you use the support widget.
        </li>
        <li>
          <strong>Error reports:</strong> when something breaks, an error report
          is sent to Sentry. These reports are set up to exclude personal
          information such as IP addresses and cookies.
        </li>
        <li>
          <strong>Cookies:</strong> see §7.
        </li>
      </ul>
      <p>We don&apos;t use advertising or analytics trackers.</p>
      <h3 id="when-you-ask-for-help">When you ask for help</h3>
      <ul>
        <li>
          <strong>Support widget:</strong> what you type into the help widget,
          plus your name if you&apos;re signed in, or a name you enter if
          you&apos;re not. See §5 for where these messages go.
        </li>
      </ul>
      <h2 id="2-how-we-use-it">2. How we use it</h2>
      <ul>
        <li>
          <strong>Running the platform:</strong> signing you in, showing your
          profile, recording attendance, and running teams and competitions.
        </li>
        <li>
          <strong>Managing your access:</strong> adding you to the DevDogs
          GitHub organization and Discord server and keeping your roles in sync
          (§3).
        </li>
        <li>
          <strong>Experiential Learning:</strong> sending attendance and
          reflection evidence to UGA&apos;s EL review.{" "}
          <strong>
            DevDogs doesn&apos;t decide whether you get EL credit.
          </strong>{" "}
          An independent university process does.
        </li>
        <li>
          <strong>Reporting to UGA and Google:</strong> submitting attendance to
          the Involvement Network and to Google Developer Groups (GDG Bevy,
          gdg.community.dev), as both require for registered chapters (§4).
        </li>
        <li>
          <strong>Promoting the club:</strong> using event photos on our
          website, social media and promotional materials.
        </li>
        <li>
          <strong>Understanding our community:</strong> combining participation
          and survey data into totals. We use these to plan programming and to
          show sponsors who we reach. Anything a sponsor sees is aggregated and
          doesn&apos;t identify anyone.
        </li>
        <li>
          <strong>Communication:</strong> email about your teams and account,
          and Discord announcements.
        </li>
        <li>
          <strong>Safety:</strong> enforcing the conduct rules in our{" "}
          <Link href="/legal/terms">Terms of Service</Link> (§6).
        </li>
      </ul>
      <p>
        <strong>We will never sell your data.</strong>
      </p>
      <h2 id="3-connected-accounts">3. Connected accounts</h2>
      <p>
        When you link an account, the platform does more than read your
        username:
      </p>
      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>What we do with it</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>UGA Google</strong> (required)
            </td>
            <td>
              Sign you in. Only <code>@uga.edu</code> accounts are accepted. We
              never receive your Google password.
            </td>
          </tr>
          <tr>
            <td>
              <strong>GitHub</strong>
            </td>
            <td>
              Invite you to the DevDogs GitHub organization and accept the
              invite for you. Add you to and remove you from teams as your
              competition teams change. Check whether you have two-factor
              authentication on, because team repositories require it.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Discord</strong>
            </td>
            <td>
              Add you to the DevDogs Discord server, set your nickname to your
              preferred name, and keep your server roles in sync with your
              platform roles.
            </td>
          </tr>
          <tr>
            <td>
              <strong>LinkedIn</strong>
            </td>
            <td>Show a link on your profile, if you choose to.</td>
          </tr>
        </tbody>
      </table>
      <p>
        You can unlink an account at any time from your account settings.
        Unlinking stops future syncing. For most members it also removes you
        from the GitHub organization or the Discord server, but that isn&apos;t
        guaranteed. If you&apos;re still there afterwards, leave directly or ask
        us (§8).
      </p>
      <h2 id="4-who-can-see-your-data">4. Who can see your data</h2>
      <h3 id="other-people-through-your-public-profile">
        Other people, through your public profile
      </h3>
      <p>
        Members have a public profile at{" "}
        <code>devdogsuga.org/community/@handle</code>.{" "}
        <strong>It&apos;s on by default.</strong> Here is what it shows unless
        you turn things off:
      </p>
      <ul>
        <li>
          <strong>Shown unless you hide them:</strong> your name, profile
          picture, bio, links, competition entries, contributions (merged pull
          requests), and star totals.
        </li>
        <li>
          <strong>Hidden unless you choose to show them:</strong> your GitHub,
          Discord, LinkedIn and email.
        </li>
      </ul>
      <p>
        You can hide any of these, or turn off your public profile completely,
        in your account settings. Profile pictures are stored where anyone with
        the link can load them. Officers&apos; names, photos and role
        descriptions appear publicly on the homepage.
      </p>
      <h3 id="officers">Officers</h3>
      <p>Officers see member data only as far as their role needs:</p>
      <ul>
        <li>
          <strong>Attendance and EL reflections:</strong> officers.
        </li>
        <li>
          <strong>Audit log:</strong> a smaller group of officers can see the
          full edit history of reflections and other records.
        </li>
        <li>
          <strong>Moderation:</strong> officers who handle reports can see the
          reported content and the history of past actions.
        </li>
      </ul>
      <h3 id="other-organizations">Other organizations</h3>
      <ul>
        <li>
          <strong>Google Developer Groups on Campus:</strong> as a GDGC chapter,
          we report our events to Google Developer Groups through its community
          platform (gdg.community.dev). This covers attendance and check-in
          survey answers. Once Google has this data, the{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Privacy Policy
          </a>{" "}
          governs it.
        </li>
        <li>
          <strong>UGA:</strong>
          <ul>
            <li>
              <strong>Involvement Network:</strong> we report membership and
              attendance. UGA runs it on Anthology&apos;s Engage platform. Once
              there, the data is covered by{" "}
              <a
                href="https://www.uga.edu/privacy/"
                target="_blank"
                rel="noopener noreferrer"
              >
                UGA&apos;s privacy policy
              </a>{" "}
              and{" "}
              <a
                href="https://www.anthology.com/trust-center/privacy-statement"
                target="_blank"
                rel="noopener noreferrer"
              >
                Anthology&apos;s privacy statement
              </a>
              .
            </li>
            <li>
              <strong>EL review:</strong> we send the university attendance and
              reflections.
            </li>
          </ul>
        </li>
        <li>
          <strong>Service providers</strong> that host or run parts of the
          platform, under their own privacy policies:
          <ul>
            <li>Supabase: database, sign-in and file storage</li>
            <li>
              Cloudflare: hosting, email delivery, image handling and Turnstile
            </li>
            <li>Sentry: error reports</li>
            <li>GitHub and Discord: the access management described in §3</li>
          </ul>
        </li>
      </ul>
      <p>
        We share data with these organizations only for the purposes above, or
        when the law requires it.
      </p>
      <h3 id="devdogs-apps-and-developer-testing">
        DevDogs apps and developer testing
      </h3>
      <p>
        DevDogs&apos; own apps, such as DogDays, run on the same system as
        devdogsuga.org. They use the same account and sign-in, and the same data
        and rules described in this policy. DogDays also stores the schedule
        plans and preferences you save there.
      </p>
      <p>
        Members who contribute to DevDogs apps can use{" "}
        <strong>Sign in with DevDogs</strong> to test their changes on their own
        computers. It only works for the contributor themselves, or for test
        accounts they create. These are placeholder accounts that aren&apos;t
        real people. It can&apos;t be used to sign in to anything with your
        account, and no live app uses it.
      </p>
      <h2 id="5-support-conversations">5. Support conversations</h2>
      <p>
        Messages you send through the help widget are posted to a private forum
        on the DevDogs Discord server, where officers and volunteers answer
        them. They&apos;re posted under your name, or the name you entered as a
        guest.
      </p>
      <ul>
        <li>
          <strong>Guests:</strong> if you&apos;re not signed in, a cookie keeps
          your conversation together. We delete guest records 90 days after your
          last visit. Posts already made on Discord stay there unless you ask us
          to remove them.
        </li>
        <li>
          <strong>Published answers:</strong> if your question is useful to
          others, we may publish the answer as an FAQ at{" "}
          <code>devdogsuga.org/help</code>. Before we do, we remove your name
          and other identifying details.
        </li>
      </ul>
      <h2 id="6-moderation-and-safety">6. Moderation and safety</h2>
      <p>To enforce the conduct rules in our Terms of Service, we keep:</p>
      <ul>
        <li>reports members file</li>
        <li>
          the actions officers take: warnings, suspensions, bans, and hiding
          content until it&apos;s reviewed
        </li>
        <li>the reasons for those actions</li>
      </ul>
      <p>
        These records are kept even after the action ends, so we can handle
        repeat problems fairly.
      </p>
      <h2 id="7-cookies">7. Cookies</h2>
      <p>We use only the cookies the platform needs to work:</p>
      <table>
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase session cookies</td>
            <td>Keep you signed in.</td>
          </tr>
          <tr>
            <td>
              <code>auth_callback_path</code>, <code>auth_intent</code>
            </td>
            <td>
              Remember where to send you back after you sign in or link an
              account. Short-lived.
            </td>
          </tr>
          <tr>
            <td>Pending attendance cookie</td>
            <td>
              Holds an attendance check-in while you sign in. Short-lived.
            </td>
          </tr>
          <tr>
            <td>Support guest cookie</td>
            <td>Keeps a guest&apos;s support conversation together (§5).</td>
          </tr>
        </tbody>
      </table>
      <p>
        None of these are used for advertising or for tracking you across other
        sites.
      </p>
      <h2 id="8-your-choices-and-rights">8. Your choices and rights</h2>
      <ul>
        <li>
          <strong>Get a copy:</strong> email{" "}
          <strong>
            <a href="mailto:devdogs@uga.edu">devdogs@uga.edu</a>
          </strong>{" "}
          with the subject &quot;Data Request&quot; and your name. We&apos;ll
          send you a copy of the data we hold about you.
        </li>
        <li>
          <strong>Delete your data:</strong> email{" "}
          <strong>
            <a href="mailto:devdogs@uga.edu">devdogs@uga.edu</a>
          </strong>{" "}
          with the subject &quot;Data Removal Request&quot; and your name.
          We&apos;ll delete your account, profile, connected accounts and
          personal records, and tell you when it&apos;s done.
          <ul>
            <li>
              <strong>Reflections and reports:</strong> your reflections and
              their edit history are deleted with your account. So are reports
              you filed and reports filed about you. The audit log keeps a
              record that changes happened, without the reflection text and
              without anything that identifies you.
            </li>
            <li>
              <strong>Outside our systems:</strong> we&apos;ll also remove you
              from the DevDogs GitHub organization and Discord server. We
              can&apos;t delete data already sent to UGA or Google (§4), but
              we&apos;ll tell you where it went.
            </li>
            <li>
              <strong>Marketing materials:</strong> we stop distributing
              marketing materials that include photos of you by the time we
              respond to your request. We can&apos;t recall materials that were
              already distributed: posts others have shared, printed flyers, and
              so on. Until we respond, materials already in circulation may keep
              being used.
            </li>
            <li>
              <strong>
                Your account can&apos;t be recovered after deletion.
              </strong>
            </li>
          </ul>
        </li>
        <li>
          <strong>Correct your data:</strong> edit your profile in account
          settings, or email us to correct anything you can&apos;t edit
          yourself.
        </li>
      </ul>
      <p>We respond to requests within 30 days.</p>
      <h2 id="9-how-long-we-keep-data">9. How long we keep data</h2>
      <ul>
        <li>
          <strong>Active members:</strong> we keep your data while you&apos;re
          involved with DevDogs.
        </li>
        <li>
          <strong>After you graduate:</strong> we anonymize or aggregate your
          data and move it off the platform. Event photos are the exception: we
          may keep and use them indefinitely to promote the club.
        </li>
        <li>
          <strong>Support guests:</strong> deleted 90 days after the last visit
          (§5).
        </li>
        <li>
          <strong>Totals:</strong> statistics that don&apos;t identify anyone,
          such as attendance counts per semester, may be kept indefinitely.
        </li>
      </ul>
      <h2 id="10-children">10. Children</h2>
      <p>
        DevDogs accounts are only for UGA students who have paid their student
        fees, so in practice everyone using the platform is at least 17. We
        don&apos;t knowingly collect data from anyone under 13.
      </p>
      <h2 id="11-changes-to-this-policy">11. Changes to this policy</h2>
      <p>
        When we change this policy, we update the &quot;Last updated&quot; date
        above. If a change affects what we collect or who can see it, we also
        announce it on Discord.
      </p>
      <h2 id="12-questions">12. Questions</h2>
      <p>
        Email{" "}
        <strong>
          <a href="mailto:devdogs@uga.edu">devdogs@uga.edu</a>
        </strong>
        . We&apos;re happy to explain anything here.
      </p>
    </div>
  );
}
