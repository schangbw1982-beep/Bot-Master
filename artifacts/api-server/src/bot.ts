import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
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

if (!token) throw new Error("DISCORD_BOT_TOKEN is required.");
if (!applicationId) throw new Error("DISCORD_APPLICATION_ID is required.");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCaseId(): string {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function memberHasRole(member: ChatInputCommandInteraction["member"], roleId: string): boolean {
  return !!(
    member &&
    "roles" in member &&
    (Array.isArray(member.roles)
      ? member.roles.includes(roleId)
      : member.roles.cache.has(roleId))
  );
}

// ─── /dm ──────────────────────────────────────────────────────────────────────

const dmCommand = new SlashCommandBuilder()
  .setName("dm")
  .setDescription("Send a direct message to a user")
  .addStringOption((o) => o.setName("message").setDescription("The message to send").setRequired(true))
  .addUserOption((o) => o.setName("user").setDescription("The user to DM (@mention)").setRequired(false))
  .addStringOption((o) => o.setName("userid").setDescription("User ID to DM (if @mention doesn't work)").setRequired(false));

async function handleDm(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, DM_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 });
    return;
  }

  const message = interaction.options.getString("message", true);
  const targetUser = interaction.options.getUser("user") ?? null;
  const targetUserId = interaction.options.getString("userid") ?? null;

  await interaction.deferReply({ flags: 64 });

  let resolvedUser = targetUser;
  if (!resolvedUser && targetUserId) {
    try {
      resolvedUser = await interaction.client.users.fetch(targetUserId);
    } catch {
      await interaction.editReply({ content: `Could not find a user with ID \`${targetUserId}\`.` });
      return;
    }
  }
  if (!resolvedUser) {
    await interaction.editReply({ content: "Please provide either a @user mention or a user ID." });
    return;
  }

  try {
    await resolvedUser.send(message);
    await interaction.editReply({ content: `Successfully sent a DM to **${resolvedUser.tag}**.` });
    logger.info({ targetUserId: resolvedUser.id, invoker: interaction.user.id }, "DM sent");
  } catch (err) {
    logger.error({ err, targetUserId: resolvedUser.id }, "Failed to send DM");
    await interaction.editReply({ content: `Could not DM **${resolvedUser.tag}**. They may have DMs disabled.` });
  }
}

// ─── /promote ─────────────────────────────────────────────────────────────────

const PROMOTION_CHANNEL_ID = "1488470650707378307";

const promoteCommand = new SlashCommandBuilder()
  .setName("promote")
  .setDescription("Issue a staff promotion")
  .addUserOption((o) => o.setName("user").setDescription("The user to promote").setRequired(true))
  .addRoleOption((o) => o.setName("role").setDescription("The role to promote them to").setRequired(true))
  .addStringOption((o) => o.setName("reason").setDescription("Reason for the promotion").setRequired(false))
  .addStringOption((o) => o.setName("invite_url").setDescription("Invite link for the button (optional)").setRequired(false));

async function handlePromote(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, PROMOTE_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 });
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
  const timestamp =
    now.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) +
    " " +
    now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  await interaction.deferReply({ flags: 64 });

  if (guild) {
    try {
      const member = await guild.members.fetch(targetUser.id);
      await member.roles.add(role.id, `Promoted by ${issuer.tag} — ${reason}`);
    } catch (err) {
      logger.warn({ err, userId: targetUser.id, roleId: role.id }, "Could not assign role");
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: `Promotion Issued by ${issuer.displayName ?? issuer.username}`, iconURL: issuer.displayAvatarURL() })
    .setTitle("Staff Promotion")
    .setThumbnail(guild?.iconURL() ?? null)
    .addFields(
      { name: "Promoted User", value: `${targetUser} (@${targetUser.username})` },
      { name: "Promoted To", value: `<@&${role.id}>` },
      { name: "Reason", value: reason },
    )
    .setFooter({ text: `Case ID: ${caseId} | ${timestamp}`, iconURL: issuer.displayAvatarURL() });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (inviteUrl) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel("Join the Server").setStyle(ButtonStyle.Link).setURL(inviteUrl),
      ),
    );
  }

  try {
    const channel = await interaction.client.channels.fetch(PROMOTION_CHANNEL_ID);
    if (!channel?.isTextBased()) {
      await interaction.editReply({ content: "Promotion channel not found or is not a text channel." });
      return;
    }
    await channel.send({ content: `${targetUser} (@${targetUser.username})`, embeds: [embed], components });
    await interaction.editReply({ content: `Promotion posted in <#${PROMOTION_CHANNEL_ID}>.` });
    logger.info({ promotedUserId: targetUser.id, roleId: role.id, caseId, invoker: issuer.id }, "Promotion issued");
  } catch (err) {
    logger.error({ err }, "Failed to send promotion embed");
    await interaction.editReply({ content: "Failed to post the promotion. Make sure the bot has access to the promotion channel." });
  }
}

// ─── /nickname ────────────────────────────────────────────────────────────────

const nicknameCommand = new SlashCommandBuilder()
  .setName("nickname")
  .setDescription("Change a staff member's server nickname")
  .addUserOption((o) => o.setName("user").setDescription("The staff member to nickname").setRequired(true))
  .addStringOption((o) => o.setName("nickname").setDescription("The new nickname (leave empty to clear)").setRequired(false));

async function handleNickname(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, NICKNAME_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const newNickname = interaction.options.getString("nickname") ?? null;
  const issuer = interaction.user;
  const guild = interaction.guild;

  await interaction.deferReply({ flags: 64 });

  if (!guild) {
    await interaction.editReply({ content: "This command can only be used in a server." });
    return;
  }

  let member;
  try {
    member = await guild.members.fetch(targetUser.id);
  } catch {
    await interaction.editReply({ content: "Could not find that user in this server." });
    return;
  }

  const oldNickname = member.nickname ?? member.user.username;

  try {
    await member.setNickname(newNickname, `Changed by ${issuer.tag}`);
  } catch (err) {
    logger.error({ err, targetUserId: targetUser.id }, "Failed to set nickname");
    await interaction.editReply({
      content:
        "Failed to change the nickname. Make sure the bot has the **Manage Nicknames** permission in your server, and that the target user's role is below the bot's role.",
    });
    return;
  }

  const displayNew = newNickname ?? member.user.username;

  try {
    await targetUser.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("Your Nickname Has Been Changed")
          .addFields(
            { name: "Previous Nickname", value: oldNickname },
            { name: "New Nickname", value: displayNew },
            { name: "Changed By", value: `${issuer} (@${issuer.username})` },
          )
          .setTimestamp(),
      ],
    });
  } catch (err) {
    logger.warn({ err, targetUserId: targetUser.id }, "Could not DM user about nickname change");
  }

  await interaction.editReply({
    content: `Nickname updated: **${oldNickname}** → **${displayNew}**. ${targetUser} has been notified via DM.`,
  });
  logger.info({ targetUserId: targetUser.id, oldNickname, newNickname, invoker: issuer.id }, "Nickname changed");
}

// ─── /host training ───────────────────────────────────────────────────────────

const hostCommand = new SlashCommandBuilder()
  .setName("host")
  .setDescription("Hosting commands")
  .addSubcommand((sub) =>
    sub
      .setName("training")
      .setDescription("Announce a training session")
      .addUserOption((o) => o.setName("host").setDescription("The host of the training").setRequired(true))
      .addStringOption((o) => o.setName("time").setDescription('Starting time (e.g. "15 minutes")').setRequired(true))
  );

function buildTrainingEmbed(
  hostTag: string,
  hostMention: string,
  time: string,
  status: "open" | "locked" | "ended",
  issuerName: string,
  issuerAvatar: string,
): EmbedBuilder {
  const statusMap = {
    open: { emoji: "🟢", label: "Open", color: 0x2ecc71 as const },
    locked: { emoji: "🔵", label: "Locked", color: 0x3498db as const },
    ended: { emoji: "🔴", label: "Ended/Cancelled", color: 0xe74c3c as const },
  };
  const s = statusMap[status];

  return new EmbedBuilder()
    .setColor(s.color)
    .setTitle("🟩 | Training Ping")
    .addFields(
      { name: "Host", value: hostMention },
      { name: "Co Host", value: "-" },
      { name: "Starting Time", value: `In ${time}` },
      { name: "Status", value: `${s.emoji} ${s.label}` },
    )
    .setFooter({ text: `Announced by ${issuerName}`, iconURL: issuerAvatar });
}

function buildTrainingButtons(status: "open" | "locked" | "ended") {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("training_open")
      .setLabel("Open")
      .setStyle(ButtonStyle.Success)
      .setDisabled(status === "open"),
    new ButtonBuilder()
      .setCustomId("training_lock")
      .setLabel("Lock")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(status === "locked"),
    new ButtonBuilder()
      .setCustomId("training_end")
      .setLabel("End/Cancel")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(status === "ended"),
  );
}

async function handleHostTraining(interaction: ChatInputCommandInteraction) {
  const host = interaction.options.getUser("host", true);
  const time = interaction.options.getString("time", true);
  const issuer = interaction.user;

  await interaction.deferReply();

  const embed = buildTrainingEmbed(
    host.tag,
    `${host} (@${host.username})`,
    time,
    "open",
    issuer.displayName ?? issuer.username,
    issuer.displayAvatarURL(),
  );

  await interaction.editReply({
    embeds: [embed],
    components: [buildTrainingButtons("open")],
  });

  logger.info({ hostId: host.id, time, invoker: issuer.id }, "Training announced");
}

async function handleTrainingButton(interaction: ButtonInteraction) {
  const id = interaction.customId;
  const status: "open" | "locked" | "ended" =
    id === "training_open" ? "open" : id === "training_lock" ? "locked" : "ended";

  const original = interaction.message.embeds[0];
  if (!original) {
    await interaction.reply({ content: "Could not read the original embed.", flags: 64 });
    return;
  }

  // Rebuild embed preserving Host, Co Host, Starting Time fields, updating Status
  const hostField = original.fields.find((f) => f.name === "Host")?.value ?? "-";
  const coHostField = original.fields.find((f) => f.name === "Co Host")?.value ?? "-";
  const timeField = original.fields.find((f) => f.name === "Starting Time")?.value?.replace(/^In /, "") ?? "-";
  const footer = original.footer;

  const statusMap = {
    open: { emoji: "🟢", label: "Open", color: 0x2ecc71 as const },
    locked: { emoji: "🔵", label: "Locked", color: 0x3498db as const },
    ended: { emoji: "🔴", label: "Ended/Cancelled", color: 0xe74c3c as const },
  };
  const s = statusMap[status];

  const updated = new EmbedBuilder()
    .setColor(s.color)
    .setTitle("🟩 | Training Ping")
    .addFields(
      { name: "Host", value: hostField },
      { name: "Co Host", value: coHostField },
      { name: "Starting Time", value: `In ${timeField}` },
      { name: "Status", value: `${s.emoji} ${s.label}` },
    );

  if (footer) {
    updated.setFooter({ text: footer.text, iconURL: footer.iconURL ?? undefined });
  }

  await interaction.update({
    embeds: [updated],
    components: [buildTrainingButtons(status)],
  });

  logger.info({ status, invoker: interaction.user.id }, "Training status updated");
}

// ─── Registration & client ────────────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(token!);
  try {
    logger.info("Registering Discord slash commands globally...");
    await rest.put(Routes.applicationCommands(applicationId!), {
      body: [dmCommand.toJSON(), promoteCommand.toJSON(), nicknameCommand.toJSON(), hostCommand.toJSON()],
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

  // Prevent unhandled errors from crashing the process
  client.on("error", (err) => {
    logger.error({ err }, "Discord client error");
  });

  client.once("ready", (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot is online");
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const sub = interaction.options.getSubcommand(false);
        if (interaction.commandName === "dm") await handleDm(interaction);
        else if (interaction.commandName === "promote") await handlePromote(interaction);
        else if (interaction.commandName === "nickname") await handleNickname(interaction);
        else if (interaction.commandName === "host" && sub === "training") await handleHostTraining(interaction);
      } else if (interaction.isButton()) {
        if (["training_open", "training_lock", "training_end"].includes(interaction.customId)) {
          await handleTrainingButton(interaction);
        }
      }
    } catch (err) {
      logger.error({ err }, "Error handling interaction");
    }
  });

  await client.login(token);
}
