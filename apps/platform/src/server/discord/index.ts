import {
  type APIInteractionResponseChannelMessageWithSource,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import type * as z from "zod";
// import { leaderboard } from "./commands/leaderboard";

interface Command<T extends z.core.SomeType> {
  registration: RESTPostAPIApplicationCommandsJSONBody;
  dataValidator: T;
  onInteract: (
    data: z.infer<T>,
  ) => Promise<APIInteractionResponseChannelMessageWithSource>;
}

export function Command<T extends z.core.SomeType>(command: Command<T>) {
  return command;
}

// const commands = [leaderboard] satisfies ReturnType<typeof Command>[];

/**
 * Registers all commands defined above in `commands`.
 */
// export async function registerCommands() {
//   const response = await fetch(
//     `https://discord.com/api/v10/applications/${env.DISCORD_CLIENT_ID}/commands`,
//     {
//       headers: {
//         "Content-Type": "application/json",
//         Authorization: `Bot ${env.DISCORD_TOKEN}`,
//       },
//       method: "PUT",
//       body: JSON.stringify(
//         Object.values(commands).map(({ registration }) => registration),
//       ),
//     },
//   );

//   if (response.ok) {
//     console.log("Registered all commands");
//   } else {
//     console.error("Error registering commands");
//     const text = await response.text();
//     console.error(text);
//   }
// }

/**
 * A Next.js `POST` route handler.
 * @param request The incoming request object.
 * @returns The appropriate interaction response, considering all registered commands.
 */
// export async function handleInteractionRequest(request: NextRequest) {
//   const signature = request.headers.get("x-signature-ed25519");
//   const timestamp = request.headers.get("x-signature-timestamp");
//   const rawBody = await request.clone().arrayBuffer();

//   if (!signature || !timestamp) {
//     return new NextResponse(null, { status: 401 });
//   }

//   const isValidRequest = await verifyKey(
//     rawBody,
//     signature,
//     timestamp,
//     env.DISCORD_PUBLIC_KEY,
//   ).catch(() => false);

//   if (!isValidRequest) {
//     return new NextResponse("Invalid request signature.", { status: 401 });
//   }

//   const message = (await request.json()) as APIBaseInteraction<
//     InteractionType,
//     unknown
//   >;

//   if (message.type === InteractionType.Ping) {
//     return NextResponse.json({
//       type: InteractionResponseType.Pong,
//     });
//   }

//   return await Promise.any(
//     Object.values(commands).map((command) =>
//       command.dataValidator
//         .parseAsync(message.data)
//         .then(command.onInteract)
//         .then((data) => NextResponse.json(data)),
//     ),
//   ).catch((error) => {
//     console.error((error as AggregateError).errors);
//     return new NextResponse("Unknown interaction.", { status: 400 });
//   });
// }
