import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ApplicationCommandOptionType,
} from "discord.js";
import { logger } from "./lib/logger";

const token = process.env["DISCORD_BOT_TOKEN"];
const applicationId = process.env["DISCORD_APPLICATION_ID"];

if (!token) {
  throw new Error("DISCORD_BOT_TOKEN environment variable is required.");
}
if (!applicationId) {
  throw new Error("DISCORD_APPLICATION_ID environment variable is required.");
}

const dmCommand = new SlashCommandBuilder()
  .setName("dm")
  .setDescription("Send a direct message to a user")
  .addStringOption((opt) =>
    opt
      .setName("message")
      .setDescription("The message to send")
      .setRequired(true),
  )
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("The user to send a DM to (@mention)")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("userid")
      .setDescription("The user ID to send a DM to (use if @mention doesn't work)")
      .setRequired(false),
  );

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(token!);
  try {
    logger.info("Registering Discord slash commands globally...");
    await rest.put(Routes.applicationCommands(applicationId!), {
      body: [dmCommand.toJSON()],
    });
    logger.info("Discord slash commands registered successfully.");
  } catch (err) {
    logger.error({ err }, "Failed to register Discord slash commands");
    throw err;
  }
}

async function handleDm(interaction: ChatInputCommandInteraction) {
  const message = interaction.options.getString("message", true);
  const targetUser = interaction.options.getUser("user") ?? null;
  const targetUserId = interaction.options.getString("userid") ?? null;

  await interaction.deferReply({ ephemeral: true });

  let resolvedUser = targetUser;

  if (!resolvedUser && targetUserId) {
    try {
      resolvedUser = await interaction.client.users.fetch(targetUserId);
    } catch {
      await interaction.editReply({
        content: `Could not find a user with ID \`${targetUserId}\`. Make sure the ID is correct.`,
      });
      return;
    }
  }

  if (!resolvedUser) {
    await interaction.editReply({
      content: "Please provide either a @user mention or a user ID.",
    });
    return;
  }

  try {
    await resolvedUser.send(message);
    await interaction.editReply({
      content: `Successfully sent a DM to **${resolvedUser.tag}**.`,
    });
    logger.info(
      { targetUserId: resolvedUser.id, invoker: interaction.user.id },
      "DM sent",
    );
  } catch (err) {
    logger.error({ err, targetUserId: resolvedUser.id }, "Failed to send DM");
    await interaction.editReply({
      content: `Could not send a DM to **${resolvedUser.tag}**. They may have DMs disabled.`,
    });
  }
}

export async function startBot() {
  await registerCommands();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once("ready", (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot is online");
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "dm") {
      await handleDm(interaction);
    }
  });

  await client.login(token);
}
