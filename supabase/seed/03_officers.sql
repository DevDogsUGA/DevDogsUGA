-- The 2026-27 executive board.
--
-- Content, not schema, and deliberately a seed rather than an INSERT inside
-- 20260827000000_platform_officers.sql: a migration runs once and is then
-- immutable, while this is edited every time an officer sends a better
-- headshot or finally answers with their pronouns. Re-running it is the
-- normal way to apply such an edit, which is why every statement below
-- upserts on ("term", "slug") rather than inserting.
--
-- Bios are verbatim as submitted. The only edits are the removal of email
-- chrome -- external-sender banners, greetings, sign-offs -- and no officer's
-- wording has been changed. Where a field is null it is because nobody
-- supplied it; nothing here is inferred from a resume or a name.
--
-- Headshot keys point at the public `leadership` bucket and the files are NOT
-- in this repo -- committing seven multi-megabyte photos to serve them at
-- 112 CSS pixels is what this replaced. They are derived from the submitted
-- originals (square crop, webp, under the bucket's 256KiB limit) and uploaded
-- separately, from the private archive that holds those originals:
--
--   pnpm --filter @devdogsuga/supabase exec \
--     supabase storage cp -r ~/officers/web ss:///leadership/2026-27 --linked
--
-- Do that once per environment, BEFORE or alongside this seed;
-- `pnpm --filter @devdogsuga/supabase seed-buckets` creates the bucket itself
-- from supabase/config.toml.
--
-- The order matters. Every row below sets "headshotPath", so until the objects
-- exist the cards request URLs that 404 -- next/image renders a broken image,
-- not a fallback. The initials fallback in `Headshot.tsx` covers the other
-- case, a row with no "headshotPath" at all, which is how an officer who has
-- not sent a photo yet appears.
--
-- Known gaps, all of them awaiting a human answer rather than a code change:
--
--   * Sloan Finger is President and has submitted no bio or headshot. His row
--     is commented out at the bottom rather than invented.
--   * Gabrielle Rose and Kyle Quach stated no DevDogs title. Their "titles"
--     arrays are empty, which the card renders as no title line.
--   * Kyle Quach's submitted headshot is 199x276 -- below the 512px the
--     derivative pipeline targets, so his is the one image that could not be
--     generated at full size. It needs re-requesting, not upscaling.
--   * Armani Peacox's bio is the only one written in the third person. She
--     asked which voice was wanted and has not been answered; her words are
--     kept as sent until she is.

insert into "platform"."officers" (
  "term", "slug", "displayName",
  "titles", "majors", "minors", "certificates",
  "pronouns", "gradYear", "bio",
  "headshotPath", "headshotWidth", "headshotHeight", "headshotBlurDataUrl",
  "portfolioUrl", "githubUrl", "linkedinUrl", "email",
  "sortOrder", "active"
) values (
  '2026-27', 'jack-harrington', 'Jack Harrington',
  array['Vice President']::text[], array['Computer Science']::text[], '{}', '{}',
  null, null, 'I''m Jack Harrington, a Computer Science student at the University of Georgia with a passion for building full-stack software that solves real-world problems. My interests include software engineering, cloud technologies, and scalable web applications. I currently serve as Vice President of DevDogs, where I help coordinate student-led software projects that serve the UGA community. As a Software Engineer Intern with the U.S. Air Force, I''ve gained experience building production software in a collaborative engineering environment. I''m also involved in research software development, contributing to SpectraGuru, an open-source spectrum analysis platform for scientific research. I enjoy taking projects from concept to deployment, combining thoughtful system design with clean, maintainable code. I''m always looking for opportunities to learn, collaborate, and build technology that makes a meaningful impact.',
  '2026-27/jack-harrington.webp', 512, 512, 'data:image/webp;base64,UklGRpoAAABXRUJQVlA4II4AAACwAgCdASoQABAAAoBCJYgCdH8AqQPbA4uPyEkVdgAA/vWPeutOrij9bpPN0zINI/gD4TZE5ottW96WkCOuvPUskQcClut5QaWDdK7OQDqshcAF9Ti0xnkvVf/mNV9m8E+jJeNWPH0xbpW5Y4hmGChIs4Gd4JLeTg++uWOUeh/h6pLnrb9mfZoN+9yd1wAA',
  null, null, null, null,
  10, true
)
on conflict ("term", "slug") do update set
  "displayName" = excluded."displayName",
  "titles" = excluded."titles",
  "majors" = excluded."majors",
  "minors" = excluded."minors",
  "certificates" = excluded."certificates",
  "pronouns" = excluded."pronouns",
  "gradYear" = excluded."gradYear",
  "bio" = excluded."bio",
  "headshotPath" = excluded."headshotPath",
  "headshotWidth" = excluded."headshotWidth",
  "headshotHeight" = excluded."headshotHeight",
  "headshotBlurDataUrl" = excluded."headshotBlurDataUrl",
  "portfolioUrl" = excluded."portfolioUrl",
  "githubUrl" = excluded."githubUrl",
  "linkedinUrl" = excluded."linkedinUrl",
  "email" = excluded."email",
  "sortOrder" = excluded."sortOrder",
  "active" = excluded."active",
  "updatedAt" = now();

insert into "platform"."officers" (
  "term", "slug", "displayName",
  "titles", "majors", "minors", "certificates",
  "pronouns", "gradYear", "bio",
  "headshotPath", "headshotWidth", "headshotHeight", "headshotBlurDataUrl",
  "portfolioUrl", "githubUrl", "linkedinUrl", "email",
  "sortOrder", "active"
) values (
  '2026-27', 'zayan-hoodani', 'Zayan Hoodani',
  array['Event Director']::text[], array['Computer Science']::text[], '{}', array['Cybersecurity and Privacy']::text[],
  null, null, 'Hi, my name is Zayan Hoodani. I''m currently a sophomore studying CS at the University of Georgia while also pursuing a certificate in Cybersecurity and Privacy. I''m currently a NetOps Intern for GreenSky, where my role encompasses both cloud infrastructure and physical network management. My work includes architecting automated systems for cloud network segmentation on AWS as well as provisioning physical switch infrastructure. I''m very involved on campus, serving as a Logistics and Community Engagement Organizer for UGAHacks and a Workshop Organizer for GDG Athens. I''m also a part of The Hack Pack, where I''m now the Director of R&D after a year as Training Coordinator leading cybersecurity workshops. As the Event Director for DevDogs, I''m excited to facilitate events and create a fun, collaborative environment. I love anything to do with cybersecurity and AI, and I will also be pursuing undergraduate research in this field.',
  '2026-27/zayan-hoodani.webp', 512, 512, 'data:image/webp;base64,UklGRpYAAABXRUJQVlA4IIoAAABQAgCdASoQABAAAoBCJaACdH8Agsy+MDmjOQAA/vgSB1nyBsd5Dy3Avyof/kmxzt0VK/Xs9Ly9rmQdJ7UA8WzOL177NfQBlY9IuolkJVc5vvLL545GCnIQruGAjO42UHHbnN4Bs6K9efD1RGxCiKX6KUe1PYutbg+ZkB5fWLfdxOJbZa7pBggAAAA=',
  'https://zayan.hoodani.me/', null, null, null,
  20, true
)
on conflict ("term", "slug") do update set
  "displayName" = excluded."displayName",
  "titles" = excluded."titles",
  "majors" = excluded."majors",
  "minors" = excluded."minors",
  "certificates" = excluded."certificates",
  "pronouns" = excluded."pronouns",
  "gradYear" = excluded."gradYear",
  "bio" = excluded."bio",
  "headshotPath" = excluded."headshotPath",
  "headshotWidth" = excluded."headshotWidth",
  "headshotHeight" = excluded."headshotHeight",
  "headshotBlurDataUrl" = excluded."headshotBlurDataUrl",
  "portfolioUrl" = excluded."portfolioUrl",
  "githubUrl" = excluded."githubUrl",
  "linkedinUrl" = excluded."linkedinUrl",
  "email" = excluded."email",
  "sortOrder" = excluded."sortOrder",
  "active" = excluded."active",
  "updatedAt" = now();

insert into "platform"."officers" (
  "term", "slug", "displayName",
  "titles", "majors", "minors", "certificates",
  "pronouns", "gradYear", "bio",
  "headshotPath", "headshotWidth", "headshotHeight", "headshotBlurDataUrl",
  "portfolioUrl", "githubUrl", "linkedinUrl", "email",
  "sortOrder", "active"
) values (
  '2026-27', 'nandan-praveen', 'Nandan Praveen',
  array['Flutter Project Head']::text[], array['Computer Systems Engineering']::text[], '{}', '{}',
  null, '2029', 'Hi there! I''m Nandan, and I''m a sophomore majoring in Computer Systems Engineering. I''m currently serving as Flutter Project Head and used to be a Focus Lead at DevDogs. My work spans Flutter, Next.js, MySQL, and Supabase, and I focus on orchestrating both the UI/UX of the app and the backend, while helping developers grow in both core and advanced concepts. Outside DevDogs, I do ML research with UGA''s VIPR lab, building image-based models using PyTorch and TensorFlow. I''ve also built features for AIGRAS, a Flutter-based AI productivity app with LLM-driven calendar automation and task optimization. My technical focus is full-stack mobile and web development, with a strong interest in AI integration.',
  '2026-27/nandan-praveen.webp', 512, 512, 'data:image/webp;base64,UklGRnQAAABXRUJQVlA4IGgAAAAwAgCdASoQABAAAoBCJQBOgMWltPW8fOQkAAD+zQE8qGe3BTOme87DebAPjh1qRmHbeIbl13KIbI2+pmT92jP58W6pLL/k0lNdvQmsXiLuS12exOe0mquTbEq8JYeL4tVydJMtlaBgAA==',
  null, null, null, null,
  30, true
)
on conflict ("term", "slug") do update set
  "displayName" = excluded."displayName",
  "titles" = excluded."titles",
  "majors" = excluded."majors",
  "minors" = excluded."minors",
  "certificates" = excluded."certificates",
  "pronouns" = excluded."pronouns",
  "gradYear" = excluded."gradYear",
  "bio" = excluded."bio",
  "headshotPath" = excluded."headshotPath",
  "headshotWidth" = excluded."headshotWidth",
  "headshotHeight" = excluded."headshotHeight",
  "headshotBlurDataUrl" = excluded."headshotBlurDataUrl",
  "portfolioUrl" = excluded."portfolioUrl",
  "githubUrl" = excluded."githubUrl",
  "linkedinUrl" = excluded."linkedinUrl",
  "email" = excluded."email",
  "sortOrder" = excluded."sortOrder",
  "active" = excluded."active",
  "updatedAt" = now();

insert into "platform"."officers" (
  "term", "slug", "displayName",
  "titles", "majors", "minors", "certificates",
  "pronouns", "gradYear", "bio",
  "headshotPath", "headshotWidth", "headshotHeight", "headshotBlurDataUrl",
  "portfolioUrl", "githubUrl", "linkedinUrl", "email",
  "sortOrder", "active"
) values (
  '2026-27', 'shruti-mishra', 'Shruti Mishra',
  array['Focus Lead, Backend Integration']::text[], array['Computer Science']::text[], '{}', '{}',
  null, null, 'Hello! My name is Shruti Mishra, and I''m a sophomore at the University of Georgia studying Computer Science with an emphasis in Artificial Intelligence. I serve as the Focus Lead for Backend Integration on the DevDogs leadership team, am a member of the UGAHacks Tech Team helping develop the website for UGA''s annual hackathon, and serve on the Outreach Team for HackPack, UGA''s cybersecurity club. I''m passionate about software engineering, AI, and building technology that creates meaningful impact. Outside of school, I enjoy creating dance and tech content, reading, and exploring new technologies. I''m excited to continue growing as a developer, collaborating with others, and contributing to projects that make a difference.',
  '2026-27/shruti-mishra.webp', 512, 512, 'data:image/webp;base64,UklGRoYAAABXRUJQVlA4IHoAAABwAgCdASoQABAAAoBCJQBdgMXD1P3bFvHmkxnwAP7yBI4A2uvhPr3851EBsLFAn+sxADURz1VE7W+Ym96sN1WFmIR/XC4y7q0131GW97cVtoNzMPWLX7bGlFOMWR5rWAxso97/78pzxeyJwveX0K9YRDMMSj84poAAAA==',
  null, null, null, null,
  40, true
)
on conflict ("term", "slug") do update set
  "displayName" = excluded."displayName",
  "titles" = excluded."titles",
  "majors" = excluded."majors",
  "minors" = excluded."minors",
  "certificates" = excluded."certificates",
  "pronouns" = excluded."pronouns",
  "gradYear" = excluded."gradYear",
  "bio" = excluded."bio",
  "headshotPath" = excluded."headshotPath",
  "headshotWidth" = excluded."headshotWidth",
  "headshotHeight" = excluded."headshotHeight",
  "headshotBlurDataUrl" = excluded."headshotBlurDataUrl",
  "portfolioUrl" = excluded."portfolioUrl",
  "githubUrl" = excluded."githubUrl",
  "linkedinUrl" = excluded."linkedinUrl",
  "email" = excluded."email",
  "sortOrder" = excluded."sortOrder",
  "active" = excluded."active",
  "updatedAt" = now();

insert into "platform"."officers" (
  "term", "slug", "displayName",
  "titles", "majors", "minors", "certificates",
  "pronouns", "gradYear", "bio",
  "headshotPath", "headshotWidth", "headshotHeight", "headshotBlurDataUrl",
  "portfolioUrl", "githubUrl", "linkedinUrl", "email",
  "sortOrder", "active"
) values (
  '2026-27', 'armani-peacox', 'Armani Peacox',
  array['Campus Coordinator']::text[], array['Computer Science', 'Interdisciplinary Art']::text[], '{}', '{}',
  null, null, 'Armani is a Computer Science and Interdisciplinary Art student at the University of Georgia with a passion for game development. She serves as the Campus Coordinator for UGA''s Dev Dogs chapter and is actively involved in TheHackPack, Girls Who Code, and the Powerlifting & Bodybuilding Club. Outside of academics, she enjoys volunteering whenever possible, hiking, and wants to travel to Japan, so she is actively studying the language. Her interests include gameplay programming, game design, virtual and augmented reality, human-computer interaction, and digital art. Armani is especially interested in developing games that are both meaningful to players and diverse, and she enjoys sketching out ideas in her free time. Her skills include working with Java, Python, Unity, Git, UI/UX design, and digital illustration, and she is always learning more during her time at UGA.',
  '2026-27/armani-peacox.webp', 512, 512, 'data:image/webp;base64,UklGRqgAAABXRUJQVlA4IJwAAABwAgCdASoQABAAAoBCJbACdAYrT25SmiMf6QCAAP7inmg90hn5sQpwyQbchXS+AdpPfeD76tJ4iY1rcmj7gvPX1jz2pGyJyobHw1aeQvlCvpIOWz0McGJ0QvNI6ejuVjl7GBV2S9c3ydpHLT7U2AANg7H1rgg2CB1gc/KclnBxj2Brl2NfnKQQFh4YJX62telUIWfnLo+kW3nAAAA=',
  null, null, null, null,
  50, true
)
on conflict ("term", "slug") do update set
  "displayName" = excluded."displayName",
  "titles" = excluded."titles",
  "majors" = excluded."majors",
  "minors" = excluded."minors",
  "certificates" = excluded."certificates",
  "pronouns" = excluded."pronouns",
  "gradYear" = excluded."gradYear",
  "bio" = excluded."bio",
  "headshotPath" = excluded."headshotPath",
  "headshotWidth" = excluded."headshotWidth",
  "headshotHeight" = excluded."headshotHeight",
  "headshotBlurDataUrl" = excluded."headshotBlurDataUrl",
  "portfolioUrl" = excluded."portfolioUrl",
  "githubUrl" = excluded."githubUrl",
  "linkedinUrl" = excluded."linkedinUrl",
  "email" = excluded."email",
  "sortOrder" = excluded."sortOrder",
  "active" = excluded."active",
  "updatedAt" = now();

insert into "platform"."officers" (
  "term", "slug", "displayName",
  "titles", "majors", "minors", "certificates",
  "pronouns", "gradYear", "bio",
  "headshotPath", "headshotWidth", "headshotHeight", "headshotBlurDataUrl",
  "portfolioUrl", "githubUrl", "linkedinUrl", "email",
  "sortOrder", "active"
) values (
  '2026-27', 'gabrielle-rose', 'Gabrielle Rose',
  '{}', array['Computer Science']::text[], '{}', '{}',
  null, null, 'My name is Gabrielle Rose, and I am from Snellville, Georgia. I am currently pursuing a degree in Computer Science, with a focus on front-end development, human-computer interaction, and UI/UX design. I am passionate about creating intuitive, user-centered technologies that solve real-world problems and improve everyday experiences. Through my involvement both on and off campus, I have developed websites and collaborated on business initiatives that foster connected technical communities, establish digital presences, and expand access to technology. I enjoy working on projects that combine creativity, technology, and problem-solving to make learning new technologies more approachable through intuitive and accessible design. In the future, I aspire to bridge the gap between people and technology by designing innovative digital solutions that create meaningful impacts across industries and empower communities to confidently engage with technology.',
  '2026-27/gabrielle-rose.webp', 512, 512, 'data:image/webp;base64,UklGRp4AAABXRUJQVlA4IJIAAACQAgCdASoQABAAAoBCJYgAD48ReVrWhKOfXIYZgAD+t5k//Qgz3U6TuYjU6GwLR1Dai6cbrbJgZOAf5vlj2kExoTgtluWe/qVMvNZxmWUzNL1nUCNeGV2ADg6zUAu/jssWc3lXhZ152V5nT+TKP8YexnfWu/pz+OrB8/zjID1qGAsU/767mcheq8+8gQLb7ioAAA==',
  null, null, null, null,
  60, true
)
on conflict ("term", "slug") do update set
  "displayName" = excluded."displayName",
  "titles" = excluded."titles",
  "majors" = excluded."majors",
  "minors" = excluded."minors",
  "certificates" = excluded."certificates",
  "pronouns" = excluded."pronouns",
  "gradYear" = excluded."gradYear",
  "bio" = excluded."bio",
  "headshotPath" = excluded."headshotPath",
  "headshotWidth" = excluded."headshotWidth",
  "headshotHeight" = excluded."headshotHeight",
  "headshotBlurDataUrl" = excluded."headshotBlurDataUrl",
  "portfolioUrl" = excluded."portfolioUrl",
  "githubUrl" = excluded."githubUrl",
  "linkedinUrl" = excluded."linkedinUrl",
  "email" = excluded."email",
  "sortOrder" = excluded."sortOrder",
  "active" = excluded."active",
  "updatedAt" = now();

insert into "platform"."officers" (
  "term", "slug", "displayName",
  "titles", "majors", "minors", "certificates",
  "pronouns", "gradYear", "bio",
  "headshotPath", "headshotWidth", "headshotHeight", "headshotBlurDataUrl",
  "portfolioUrl", "githubUrl", "linkedinUrl", "email",
  "sortOrder", "active"
) values (
  '2026-27', 'kyle-quach', 'Kyle Quach',
  '{}', array['Computer Science']::text[], '{}', '{}',
  null, null, 'My name is Kyle, and I am a sophomore majoring in Computer Science at the University of Georgia. My interests span software development to AI engineering, and I sometimes develop games on the side. I developed projects with tech stacks such as Java, C#, Python, and JavaScript, as well as frameworks like React and Spring. As an aspiring software developer, I look forward to building software that contributes meaningfully to people''s daily lives.',
  '2026-27/kyle-quach.webp', 199, 199, 'data:image/webp;base64,UklGRmoAAABXRUJQVlA4IF4AAAAQAgCdASoQABAAAoBCJYwBTAA8zNQV6IrAAP7yVQqmmxM4j9mIr5HNA3Lang0bWSA+vO5h6VmLxnosH0nlIlRMrefwpR29ztdwftWq2Md5iHbzkcyBaWOYeyu0LQAA',
  null, null, null, null,
  70, true
)
on conflict ("term", "slug") do update set
  "displayName" = excluded."displayName",
  "titles" = excluded."titles",
  "majors" = excluded."majors",
  "minors" = excluded."minors",
  "certificates" = excluded."certificates",
  "pronouns" = excluded."pronouns",
  "gradYear" = excluded."gradYear",
  "bio" = excluded."bio",
  "headshotPath" = excluded."headshotPath",
  "headshotWidth" = excluded."headshotWidth",
  "headshotHeight" = excluded."headshotHeight",
  "headshotBlurDataUrl" = excluded."headshotBlurDataUrl",
  "portfolioUrl" = excluded."portfolioUrl",
  "githubUrl" = excluded."githubUrl",
  "linkedinUrl" = excluded."linkedinUrl",
  "email" = excluded."email",
  "sortOrder" = excluded."sortOrder",
  "active" = excluded."active",
  "updatedAt" = now();

-- Awaiting a submission. Uncomment once Sloan sends a bio and headshot; the
-- President leading the section is the point of "sortOrder" starting at 0.
--
-- insert into "platform"."officers" (
--   "term", "slug", "displayName", "titles", "majors", "bio", "sortOrder"
-- ) values (
--   '2026-27', 'sloan-finger', 'Sloan Finger',
--   array['President']::text[], array['Computer Science']::text[],
--   '<bio>', 0
-- )
-- on conflict ("term", "slug") do nothing;
