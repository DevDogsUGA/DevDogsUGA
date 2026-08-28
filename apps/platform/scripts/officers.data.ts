/**
 * The 2026-27 executive board, as submitted.
 *
 * Separated from `seed-officers.ts` so the content can be reviewed as content:
 * every string below is a real person's account of their own work, and the
 * only edits made to any of it are length.
 *
 * `roleDescription` is what the homepage Leadership section prints. The
 * submitted bios ran 448-959 characters and the column holds 512, so five of
 * them are condensed. Nothing is invented and no claim is added -- where a
 * sentence was cut it was cut whole. The full submitted text is kept in the
 * private officer archive alongside the resumes and original emails, which is
 * the copy of record.
 *
 * `title: null` means the officer stated no DevDogs role in their submission.
 * They are still seeded -- their profile is real and the data is theirs -- but
 * they get no leadership role, so they do not appear on the homepage until
 * somebody says what to call them.
 */
export interface OfficerSeed {
  /** Matches the officer's folder in the private archive and their headshot file. */
  slug: string;
  /**
   * The address they submitted from, used to find an existing account. Three
   * officers wrote from personal Gmail, which is the only address known for
   * them -- see the account-matching note in `seed-officers.ts`.
   */
  email: string;
  /** The name to print; for two officers this is not their legal first name. */
  preferredName: string;
  /** Null when the officer stated no DevDogs role. */
  title: string | null;
  /** Fills `profile.roleDescription`, which the leadership card prints. */
  roleDescription: string;
  majors: string[];
  minors: string[];
  certificates: string[];
  graduationYear: number | null;
  /**
   * Goes to `platform."profileLinks"`, the table members manage from /account.
   * One officer of seven sent a link; nobody sent a GitHub or LinkedIn, which
   * is why the cards show neither.
   */
  links: { title: string; url: string }[];
}

export const OFFICER_SEEDS: OfficerSeed[] = [
  {
    slug: "jack-harrington",
    email: "jackharrington290@gmail.com",
    preferredName: "Jack Harrington",
    title: "Vice President",
    roleDescription:
      "I'm a Computer Science student at the University of Georgia with a passion for building full-stack software that solves real-world problems. As Vice President I help coordinate the student-led software projects DevDogs runs for the UGA community. As a Software Engineer Intern with the U.S. Air Force I've gained experience building production software in a collaborative engineering environment, and I contribute to SpectraGuru, an open-source spectrum analysis platform for scientific research.",
    majors: ["Computer Science"],
    minors: [],
    certificates: [],
    graduationYear: null,
    links: [],
  },
  {
    slug: "zayan-hoodani",
    email: "zayanhoodani@gmail.com",
    preferredName: "Zayan Hoodani",
    title: "Event Director",
    roleDescription:
      "I'm a sophomore studying CS while pursuing a certificate in Cybersecurity and Privacy. As Event Director for DevDogs I'm excited to facilitate events and create a fun, collaborative environment. I'm a NetOps Intern for GreenSky, architecting automated systems for cloud network segmentation on AWS and provisioning physical switch infrastructure, and I'm Director of R&D at The Hack Pack. I love anything to do with cybersecurity and AI.",
    majors: ["Computer Science"],
    minors: [],
    certificates: ["Cybersecurity and Privacy"],
    graduationYear: null,
    links: [{ title: "Portfolio", url: "https://zayan.hoodani.me/" }],
  },
  {
    slug: "nandan-praveen",
    email: "nandan@uga.edu",
    preferredName: "Nandan Praveen",
    title: "Flutter Project Head",
    roleDescription:
      "Hi there! I'm a sophomore majoring in Computer Systems Engineering. I'm currently serving as Flutter Project Head and used to be a Focus Lead at DevDogs. My work spans Flutter, Next.js, MySQL, and Supabase, and I focus on orchestrating both the UI/UX of the app and the backend, while helping developers grow in both core and advanced concepts. Outside DevDogs, I do ML research with UGA's VIPR lab, building image-based models using PyTorch and TensorFlow.",
    majors: ["Computer Systems Engineering"],
    minors: [],
    certificates: [],
    graduationYear: 2029,
    links: [],
  },
  {
    slug: "shruti-mishra",
    email: "shrutibmishra1@gmail.com",
    preferredName: "Shruti Mishra",
    title: "Focus Lead, Backend Integration",
    roleDescription:
      "Hello! I'm a sophomore at the University of Georgia studying Computer Science with an emphasis in Artificial Intelligence. I serve as the Focus Lead for Backend Integration on the DevDogs leadership team, am a member of the UGAHacks Tech Team helping develop the website for UGA's annual hackathon, and serve on the Outreach Team for HackPack, UGA's cybersecurity club. I'm passionate about software engineering, AI, and building technology that creates meaningful impact.",
    majors: ["Computer Science"],
    minors: [],
    certificates: [],
    graduationYear: null,
    links: [],
  },
  {
    // Submitted as Ashlee Peacox; Armani is the name she goes by and the one
    // to print. Hers is the only bio written in the third person -- she asked
    // which voice was wanted and has not been answered, so it is kept as sent
    // rather than rewritten into a voice she did not choose.
    slug: "armani-peacox",
    email: "ashlee.peacox@uga.edu",
    preferredName: "Armani Peacox",
    title: "Campus Coordinator",
    roleDescription:
      "Armani is a Computer Science and Interdisciplinary Art student at the University of Georgia with a passion for game development. She serves as the Campus Coordinator for UGA's Dev Dogs chapter and is actively involved in TheHackPack, Girls Who Code, and the Powerlifting & Bodybuilding Club. Her interests include gameplay programming, game design, virtual and augmented reality, human-computer interaction, and digital art.",
    majors: ["Computer Science", "Interdisciplinary Art"],
    minors: [],
    certificates: [],
    graduationYear: null,
    links: [],
  },
  {
    // No DevDogs title stated. Seeded, but unassigned and therefore not on the
    // homepage.
    slug: "gabrielle-rose",
    email: "gabrielle.rose@uga.edu",
    preferredName: "Gabrielle Rose",
    title: null,
    roleDescription:
      "I am currently pursuing a degree in Computer Science, with a focus on front-end development, human-computer interaction, and UI/UX design. I am passionate about creating intuitive, user-centered technologies that solve real-world problems. In the future, I aspire to bridge the gap between people and technology by designing innovative digital solutions that create meaningful impacts across industries and empower communities to confidently engage with technology.",
    majors: ["Computer Science"],
    minors: [],
    certificates: [],
    graduationYear: null,
    links: [],
  },
  {
    // Submitted as Gia Khang Quach; Kyle is the name he goes by. No DevDogs
    // title stated, so also unassigned.
    slug: "kyle-quach",
    email: "giakhang.quach@uga.edu",
    preferredName: "Kyle Quach",
    title: null,
    roleDescription:
      "My name is Kyle, and I am a sophomore majoring in Computer Science at the University of Georgia. My interests span software development to AI engineering, and I sometimes develop games on the side. I developed projects with tech stacks such as Java, C#, Python, and JavaScript, as well as frameworks like React and Spring. As an aspiring software developer, I look forward to building software that contributes meaningfully to people's daily lives.",
    majors: ["Computer Science"],
    minors: [],
    certificates: [],
    graduationYear: null,
    links: [],
  },
];

/**
 * Board order, and the order the cards appear in.
 *
 * President leads it and is not in `OFFICER_SEEDS`: Sloan Finger holds it as
 * of 2026-08-27 and submitted no bio or headshot, so the role is created and
 * left unassigned rather than filled in with invented content. Assigning it is
 * one row in `userRoles`.
 *
 * Titles absent from this list get no role. Add one here and re-run.
 */
export const OFFICER_TITLE_ORDER = [
  "President",
  "Vice President",
  "Event Director",
  "Flutter Project Head",
  "Focus Lead, Backend Integration",
  "Campus Coordinator",
] as const;
