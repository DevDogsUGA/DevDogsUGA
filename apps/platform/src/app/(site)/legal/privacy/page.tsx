import type { Metadata } from "next";

/**
 * The description is the one `config/nav.ts` gives this page under
 * `SEARCH_ONLY_PAGES`: the list of routes that are public and indexed but not
 * in the navbar, which is exactly what this is.
 *
 * The title says "Privacy Policy" rather than the heading's "DevDogs x GDG On
 * Campus Privacy Policy": the policy covers the joint system, and the h1 is
 * where that belongs, but a 55-character title is what a search result and a
 * browser tab can actually show.
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
      <h1 id="-devdogs-x-gdg-on-campus-privacy-policy-">
        <strong>DevDogs x GDG On Campus Privacy Policy</strong>
      </h1>
      <p>
        <strong>Effective Date:</strong> October 10, 2024
      </p>
      <p>
        <strong>Last Updated:</strong> September 11, 2026
      </p>
      <p>
        At <strong>DevDogs x GDG On Campus (UGA)</strong>, we value
        transparency. This policy explains how we handle your data across the
        DevDogs Website, Platform, Community Resource Forum, and RoboDog Discord
        Bot (collectively, the &quot;DevDogs System&quot;).
      </p>
      <h3 id="-1-the-data-we-collect-">
        <strong>1. The Data We Collect</strong>
      </h3>
      <p>
        We only store and process data you willingly provide or authorize. This
        includes:
      </p>
      <ul>
        <li>
          <strong>Identity:</strong> First/last name, preferred name, and
          pronouns.{" "}
        </li>
        <li>
          <strong>Contact:</strong> UGA email, preferred personal email, and
          Discord username.{" "}
        </li>
        <li>
          <strong>Professional/Technical:</strong> GitHub username, contribution
          history on DevDogs projects, major, graduation year, and resume
          links.{" "}
        </li>
        <li>
          <strong>Account &amp; Content:</strong> Authentication records,
          profile pictures, and any content or resources you post to our
          Community Forum.{" "}
        </li>
        <li>
          <strong>Participation:</strong> Membership status, meeting attendance
          (including the meeting, check-in time, and check-in method), DevDogs
          competition participation, stars, and streaks.
        </li>
        <li>
          <strong>Experiential Learning evidence:</strong> Written reflections
          you draft or submit for eligible DevDogs meetings and competitions.
        </li>
        <li>
          <strong>Operational history:</strong> Officer corrections and an
          append-only audit history, including who made a change, why it was
          made, and reflection revisions before and after the change.
        </li>
      </ul>
      <h3 id="-2-how-we-use-your-data-">
        <strong>2. How We Use Your Data</strong>
      </h3>
      <p>
        Your information is used to power the DevDogs System and improve your
        experience:
      </p>
      <ul>
        <li>
          <strong>Personalization:</strong> Displaying your member profile and
          forum contributions.{" "}
        </li>
        <li>
          <strong>Participation and progress:</strong> Recording attendance,
          competition participation, stars, streaks, and evidence for
          Experiential Learning (EL) opportunities.{" "}
        </li>
        <li>
          <strong>Analytics:</strong> Using anonymized demographic data to show
          potential sponsors the impact of our club and to improve our
          programming.{" "}
        </li>
        <li>
          <strong>Communication:</strong> Meeting updates, event coordination,
          and forum notifications via Discord and email.
        </li>
      </ul>
      <h3 id="-3-our-privacy-pledge-">
        <strong>3. Our Privacy Pledge</strong>
      </h3>
      <ul>
        <li>
          <strong>No Selling:</strong> We will never sell your data. Ever.{" "}
        </li>
        <li>
          <strong>Limited Access:</strong> Only credentialed members of the
          Executive Board (President, Technical Officer, Engagement Officer,
          Marketing Director, and Lead Web Developer) have access to
          administrative user data.{" "}
        </li>
        <li>
          <strong>Security:</strong> Member sign-in uses a UGA Google account;
          DevDogs does not receive or store your Google password.
        </li>
        <li>
          <strong>EL decisions:</strong> DevDogs collects attendance and
          reflection evidence only. An independent university process, not
          DevDogs or its officers, determines whether EL credit is awarded.
        </li>
      </ul>
      <h3 id="-4-your-rights-data-control-">
        <strong>4. Your Rights &amp; Data Control</strong>
      </h3>
      <p>You have full control over your information:</p>
      <ul>
        <li>
          <strong>Data Request:</strong> You may request a complete copy of all
          data we store about you at any time.{" "}
        </li>
        <li>
          <strong>Data Removal:</strong> You can request the permanent removal
          of your data and account &quot;no questions asked.&quot;{" "}
        </li>
        <li>
          <strong>How to Exercise:</strong> Email{" "}
          <strong>devdogs@uga.edu</strong> with your name and the subject line
          &quot;Data Request&quot; or &quot;Data Removal Request.&quot;
        </li>
      </ul>
      <h3 id="-5-access-and-retention-">
        <strong>5. Access and Retention</strong>
      </h3>
      <ul>
        <li>
          Members can view their own attendance, participation, progress, and
          reflections. These records are not public leaderboards.
        </li>
        <li>
          Authorized officers can access attendance and EL reflection records in
          Airtable. Officers with Audit Log access can also inspect the full
          edit history of a reflection.
        </li>
        <li>
          Personal alumni records are currently identified and purged through a
          manual process. You may also request removal sooner using the process
          above.
        </li>
        <li>
          Non-identifying aggregate statistics may be preserved indefinitely so
          the club can understand participation and programming over time.
        </li>
      </ul>
      <h3 id="-6-third-party-services-">
        <strong>6. Third-Party Services</strong>
      </h3>
      <p>
        We use external platforms including GitHub, Discord, Google, Airtable,
        and our hosting and database providers to facilitate club operations.
        Attendance, participation, member metrics, reflections, and correction
        status are synchronized to Airtable for officer workflows. Officers may
        export applicable attendance and reflection evidence for independent
        university EL review. If any financial transactions occur (such as dues
        or merch), they are handled by UGA&#39;s Paciolan system. These services
        have their own privacy policies which govern their data handling.
      </p>
    </div>
  );
}
