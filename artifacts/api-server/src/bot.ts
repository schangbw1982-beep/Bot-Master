import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { logger } from "./lib/logger";

const token = process.env["DISCORD_BOT_TOKEN"];
const applicationId = process.env["DISCORD_APPLICATION_ID"];

const DM_ALLOWED_ROLE_ID = "1488086630731616337";
const PROMOTE_ALLOWED_ROLE_ID = "1487807942077190291";
const NICKNAME_ALLOWED_ROLE_ID = "1489216408620630186";

if (!token) {
  throw new Error("DISCORD_BOT_TOKEN environment variable is required.");
}
if (!applicationId) {
  throw new Error("DISCORD_APPLICATION_ID environment variable is required.");
}

function generateCaseId(): string {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function hasAllowedRole(interaction: ChatInputCommandInteraction, roleId: string): boolean {
  const member = interaction.member;
  return !!(
    member &&
    "roles" in member &&
    (Array.isArray(member.roles)
      ? member.roles.includes(roleId)
      : member.roles.cache.has(roleId))
  );
}

// ─── /dm command ─────────────────────────────────────────────────────────────

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

async function handleDm(interaction: ChatInputCommandInteraction) {
  if (!hasAllowedRole(interaction, DM_ALLOWED_ROLE_ID)) {
    await interaction.reply({
      content: "You do not have permission to use this command.",
      ephemeral: true,
    });
    return;
  }

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

// ─── /promote command ─────────────────────────────────────────────────────────

const promoteCommand = new SlashCommandBuilder()
  .setName("promote")
  .setDescription("Issue a staff promotion")
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("The user to promote")
      .setRequired(true),
  )
  .addRoleOption((opt) =>
    opt
      .setName("role")
      .setDescription("The role to promote them to")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("reason")
      .setDescription("Reason for the promotion")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("invite_url")
      .setDescription("Invite link for the button (optional)")
      .setRequired(false),
  );

async function handlePromote(interaction: ChatInputCommandInteraction) {
  if (!hasAllowedRole(interaction, PROMOTE_ALLOWED_ROLE_ID)) {
    await interaction.reply({
      content: "You do not have permission to use this command.",
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const role = interaction.options.getRole("role", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided.";
  const inviteUrl = interaction.options.getString("invite_url") ?? null;
  const issuer = interaction.user;
  const guild = interaction.guild;
  const caseId = generateCaseId();
  const now = new Date();
  const timestamp = now.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }) + " " + now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const PROMOTION_CHANNEL_ID = "1488470650707378307";

  await interaction.deferReply({ ephemeral: true });

  // Try to assign the role to the promoted user
  if (guild) {
    try {
      const member = await guild.members.fetch(targetUser.id);
      await member.roles.add(role.id, `Promoted by ${issuer.tag} — ${reason}`);
    } catch (err) {
      logger.warn({ err, userId: targetUser.id, roleId: role.id }, "Could not assign role");
    }
  }

  const guildIconUrl = guild?.iconURL() ?? null;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: `Promotion Issued by ${issuer.displayName ?? issuer.username}`,
      iconURL: issuer.displayAvatarURL(),
    })
    .setTitle("Staff Promotion")
    .setThumbnail(guildIconUrl)
    .addFields(
      {
        name: "Promoted User",
        value: `${targetUser} (@${targetUser.username})`,
      },
      {
        name: "Promoted To",
        value: `<@&${role.id}>`,
      },
      {
        name: "Reason",
        value: reason,
      },
    )
    .setFooter({
      text: `Case ID: ${caseId} | ${timestamp}`,
      iconURL: issuer.displayAvatarURL(),
    });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (inviteUrl) {
    const button = new ButtonBuilder()
      .setLabel(`Join the Server`)
      .setStyle(ButtonStyle.Link)
      .setURL(inviteUrl);
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(button),
    );
  }

  try {
    const channel = await interaction.client.channels.fetch(PROMOTION_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      await interaction.editReply({ content: "Promotion channel not found or is not a text channel." });
      return;
    }
    await channel.send({
      content: `${targetUser} (@${targetUser.username})`,
      embeds: [embed],
      components,
    });
    await interaction.editReply({ content: `Promotion posted in <#${PROMOTION_CHANNEL_ID}>.` });
  } catch (err) {
    logger.error({ err }, "Failed to send promotion embed");
    await interaction.editReply({ content: "Failed to post the promotion. Make sure the bot has access to the promotion channel." });
    return;
  }

  logger.info(
    {
      promotedUserId: targetUser.id,
      roleId: role.id,
      caseId,
      invoker: issuer.id,
    },
    "Promotion issued",
  );
}

// ─── Registration & client ────────────────────────────────────────────────────

// ─── /nickname command ────────────────────────────────────────────────────────

const nicknameCommand = new SlashCommandBuilder()
  .setName("nickname")
  .setDescription("Change a staff member's server nickname")
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("The staff member to nickname")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("nickname")
      .setDescription("The new nickname (leave empty to clear)")
      .setRequired(false),
  );

async function handleNickname(interaction: ChatInputCommandInteraction) {
  if (!hasAllowedRole(interaction, NICKNAME_ALLOWED_ROLE_ID)) {
    await interaction.reply({
      content: "You do not have permission to use this command.",
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const newNickname = interaction.options.getString("nickname") ?? null;
  const issuer = interaction.user;
  const guild = interaction.guild;

  await interaction.deferReply({ ephemeral: true });

  if (!guild) {
    await interaction.editReply({ content: "This command can only be used in a server." });
    return;
  }

  let member;
  try {
    member = await guild.members.fetch(targetUser.id);
  } catch {
    await interaction.editReply({ content: `Could not find that user in this server.` });
    return;
  }

  const oldNickname = member.nickname ?? member.user.username;

  try {
    await member.setNickname(newNickname, `Changed by ${issuer.tag}`);
  } catch (err) {
    logger.error({ err, targetUserId: targetUser.id }, "Failed to set nickname");
    await interaction.editReply({
      content: "Failed to change the nickname. Make sure the bot has **Manage Nicknames** permission and the target is not a server owner or higher role.",
    });
    return;
  }

  const displayNew = newNickname ?? member.user.username;

  // DM the user
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Your Nickname Has Been Changed")
      .addFields(
        { name: "Previous Nickname", value: oldNickname },
        { name: "New Nickname", value: displayNew },
        { name: "Changed By", value: `${issuer} (@${issuer.username})` },
      )
      .setTimestamp();

    await targetUser.send({ embeds: [dmEmbed] });
  } catch (err) {
    logger.warn({ err, targetUserId: targetUser.id }, "Could not DM user about nickname change");
  }

  await interaction.editReply({
    content: `Nickname updated: **${oldNickname}** → **${displayNew}**. ${targetUser} has been notified via DM.`,
  });

  logger.info(
    { targetUserId: targetUser.id, oldNickname, newNickname, invoker: issuer.id },
    "Nickname changed",
  );
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(token!);
  try {
    logger.info("Registering Discord slash commands globally...");
    await rest.put(Routes.applicationCommands(applicationId!), {
      body: [dmCommand.toJSON(), promoteCommand.toJSON(), nicknameCommand.toJSON()],
    });
    logger.info("Discord slash commands registered successfully.");
  } catch (err) {
    logger.error({ err }, "Failed to register Discord slash commands");
    throw err;
  }
}

export async function startBot() {
  await registerCommands();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once("ready", (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot is online");
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "dm") {
      await handleDm(interaction);
    } else if (interaction.commandName === "promote") {
      await handlePromote(interaction);
    } else if (interaction.commandName === "nickname") {
      await handleNickname(interaction);
    }
  });

  await client.login(token);
}
