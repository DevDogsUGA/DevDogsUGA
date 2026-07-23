// export const leaderboard = Command({
//   registration: {
//     name: "leaderboard",
//     description: "View the current state of the leaderboard!",
//     type: ApplicationCommandType.ChatInput,
//     options: [
//       {
//         name: "year",
//         description: "Get points from a specific year",
//         type: ApplicationCommandOptionType.String,
//         choices: [
//           {
//             name: "All Time",
//             value: "all",
//           },
//           {
//             name: "2025-2026 (This Year)",
//             value: "2025",
//           },
//           {
//             name: "2024-2025 (Last Year)",
//             value: "2024",
//           },
//           {
//             name: "2023-2024",
//             value: "2023",
//           },
//         ],
//       },
//     ],
//   },
//   dataValidator: z.object({
//     id: z.string(),
//     name: z.literal("leaderboard"),
//     type: z.literal(ApplicationCommandType.ChatInput),
//     resolved: z.unknown().optional(),
//     options: z
//       .union([
//         z.object({
//           name: z.literal("year"),
//           type: z.literal(ApplicationCommandOptionType.String),
//           value: z.literal(["all", "2025", "2024", "2023"]),
//         }),
//       ])
//       .array()
//       .optional(),
//     guild_id: z.unknown().optional(),
//     target_id: z.unknown().optional(),
//   }),
//   async onInteract(data) {
//     const year = data?.options?.find((option) => option.name === "year")?.value;

//     const targetPoints = (
//       year
//         ? year === "all"
//           ? sql<number>`${githubProfiles.pointsAY2023} + ${githubProfiles.pointsAY2024} + ${githubProfiles.pointsAY2025}`
//           : sql<number>`${githubProfiles[`pointsAY${year}`]}`
//         : sql<number>`${githubProfiles.pointsAY2025}`
//     ).as("targetPoints");

//     const profiles = await db.query.githubProfiles.findMany({
//       columns: {
//         login: true,
//         avatarUrl: true,
//       },
//       extras: {
//         targetPoints,
//       },

//       orderBy: desc(targetPoints),
//       with: {
//         user: {
//           columns: {},
//           with: {
//             discord: {
//               columns: {
//                 id: true,
//               },
//             },
//           },
//         },
//       },
//       limit: 5,
//     });

//     return {
//       type: InteractionResponseType.ChannelMessageWithSource,
//       data: {
//         flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
//         components: [
//           new TextDisplayBuilder({
//             content: "\n# Leaderboard\n",
//           }).toJSON(),
//           ...profiles.map((profile, i) =>
//             new SectionBuilder({
//               components: [
//                 new TextDisplayBuilder({
//                   content: `## ${i + 1}. [${profile.login}](https://github.com/${profile.login}) \n**${Math.round(profile.targetPoints)} points** ${profile.user?.discord ? `\n(<@${profile.user.discord.id}>)` : ""}`,
//                 }).toJSON(),
//               ],
//               accessory: new ThumbnailBuilder({
//                 media: profile.avatarUrl
//                   ? {
//                       url: profile.avatarUrl,
//                     }
//                   : undefined,
//               }).toJSON(),
//             }).toJSON(),
//           ),
//         ],
//       },
//     };
//   },
// });
