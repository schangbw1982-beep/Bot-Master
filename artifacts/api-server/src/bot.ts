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

// ─── Role IDs ─────────────────────────────────────────────────────────────────

const DM_ALLOWED_ROLE_ID          = "1488086630731616337";
const PROMOTE_ALLOWED_ROLE_ID     = "1492711090595958805"; // update if a different role should promote
const INFRACT_ALLOWED_ROLE_ID     = "1492711090595958805"; // update if a different role should infract
const VOID_ALLOWED_ROLE_ID        = "1492711090595958805";
const NICKNAME_ALLOWED_ROLE_ID    = "1489216408620630186";
const HOST_ALLOWED_ROLE_ID        = "1492702143126437939";

// ─── Infraction role IDs ──────────────────────────────────────────────────────

const STRIKE_1_ROLE_ID            = "1492511182488338463";
const STRIKE_2_ROLE_ID            = "1492511315846103173";
const STRIKE_3_ROLE_ID            = "1492511654519246848";
const ACTIVITY_STRIKE_1_ROLE_ID   = "1492511490262175834";
const ACTIVITY_STRIKE_2_ROLE_ID   = "1492511575532113940";
const TERMINATION_ROLE_ID         = "1492709533926035506";
const STAFF_BLACKLISTED_ROLE_ID   = "1492512488397344939";

// ─── Channel IDs ─────────────────────────────────────────────────────────────

const PROMOTION_CHANNEL_ID   = "1492700739921903776";
const INFRACTION_CHANNEL_ID  = "1492700966292557968";
const TRAINING_CHANNEL_ID    = "1492702523721777192";
const TRAINING_PING_ROLE_ID  = "1492701877991899206";

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

function buttonMemberHasRole(member: ButtonInteraction["member"], roleId: string): boolean {
  return !!(
    member &&
    "roles" in member &&
    (Array.isArray(member.roles)
      ? member.roles.includes(roleId)
      : (member.roles as { cache: Map<string, unknown> }).cache.has(roleId))
  );
}

function nowTimestamp(): string {
  const now = new Date();
  return (
    now.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) +
    " " +
    now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
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
  const timestamp = nowTimestamp();

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
    return;
  }

  try {
    await targetUser.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("You Have Been Promoted!")
          .addFields(
            { name: "Promoted To", value: `<@&${role.id}>` },
            { name: "Reason", value: reason },
            { name: "Issued By", value: `${issuer} (@${issuer.username})` },
          )
          .setFooter({ text: `Case ID: ${caseId} | ${timestamp}` })
          .setTimestamp(),
      ],
    });
  } catch (err) {
    logger.warn({ err, targetUserId: targetUser.id }, "Could not DM user about promotion");
  }
}

// ─── /infract ─────────────────────────────────────────────────────────────────

// Maps each infraction type to its role and whether it triggers auto-termination
const INFRACTION_CONFIG: Record<string, {
  label: string;
  roleId: string;
  color: number;
  autoTerminate: boolean;
}> = {
  strike_1:          { label: "Strike 1",          roleId: STRIKE_1_ROLE_ID,          color: 0xf1c40f, autoTerminate: false },
  strike_2:          { label: "Strike 2",          roleId: STRIKE_2_ROLE_ID,          color: 0xe67e22, autoTerminate: false },
  strike_3:          { label: "Strike 3",          roleId: STRIKE_3_ROLE_ID,          color: 0xe74c3c, autoTerminate: true  },
  activity_strike_1: { label: "Activity Strike 1", roleId: ACTIVITY_STRIKE_1_ROLE_ID, color: 0xe67e22, autoTerminate: false },
  activity_strike_2: { label: "Activity Strike 2", roleId: ACTIVITY_STRIKE_2_ROLE_ID, color: 0xe74c3c, autoTerminate: true  },
  termination:       { label: "Termination",       roleId: TERMINATION_ROLE_ID,       color: 0x992d22, autoTerminate: false },
  staff_blacklisted: { label: "Staff Blacklisted", roleId: STAFF_BLACKLISTED_ROLE_ID, color: 0x2c2f33, autoTerminate: false },
};

const infractCommand = new SlashCommandBuilder()
  .setName("infract")
  .setDescription("Issue a staff infraction")
  .addUserOption((o) => o.setName("user").setDescription("The user to infract").setRequired(true))
  .addStringOption((o) =>
    o
      .setName("type")
      .setDescription("Type of infraction")
      .setRequired(true)
      .addChoices(
        { name: "Strike 1",          value: "strike_1"          },
        { name: "Strike 2",          value: "strike_2"          },
        { name: "Strike 3 (Auto-Termination)", value: "strike_3" },
        { name: "Activity Strike 1", value: "activity_strike_1" },
        { name: "Activity Strike 2 (Auto-Termination)", value: "activity_strike_2" },
        { name: "Termination",       value: "termination"       },
        { name: "Staff Blacklisted", value: "staff_blacklisted" },
      ),
  )
  .addStringOption((o) => o.setName("reason").setDescription("Reason for the infraction").setRequired(true));

async function handleInfract(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, INFRACT_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const typeKey = interaction.options.getString("type", true);
  const reason = interaction.options.getString("reason", true);
  const config = INFRACTION_CONFIG[typeKey];
  const issuer = interaction.user;
  const guild = interaction.guild;
  const caseId = generateCaseId();
  const timestamp = nowTimestamp();

  await interaction.deferReply({ flags: 64 });

  // Assign the infraction role
  if (guild) {
    try {
      const member = await guild.members.fetch(targetUser.id);
      await member.roles.add(config.roleId, `${config.label} by ${issuer.tag} — ${reason}`);

      // Auto-termination for Strike 3 and Activity Strike 2
      if (config.autoTerminate) {
        await member.roles.add(TERMINATION_ROLE_ID, `Auto-terminated due to ${config.label}`);
      }
    } catch (err) {
      logger.warn({ err, userId: targetUser.id, roleId: config.roleId }, "Could not assign infraction role");
    }
  }

  const autoTerminateNote = config.autoTerminate
    ? "\n⚠️ **This infraction carries an AUTOMATIC TERMINATION.**"
    : "";

  const embed = new EmbedBuilder()
    .setColor(config.color as number)
    .setAuthor({ name: `Infraction Issued by ${issuer.displayName ?? issuer.username}`, iconURL: issuer.displayAvatarURL() })
    .setTitle(`Staff Infraction — ${config.label}`)
    .setDescription(autoTerminateNote || null)
    .setThumbnail(guild?.iconURL() ?? null)
    .addFields(
      { name: "Infracted User", value: `${targetUser} (@${targetUser.username})` },
      { name: "Infraction Type", value: config.label },
      { name: "Reason", value: reason },
    )
    .setFooter({ text: `Case ID: ${caseId} | ${timestamp}`, iconURL: issuer.displayAvatarURL() });

  try {
    const channel = await interaction.client.channels.fetch(INFRACTION_CHANNEL_ID);
    if (!channel?.isTextBased()) {
      await interaction.editReply({ content: "Infraction channel not found or is not a text channel." });
      return;
    }
    await channel.send({ content: `${targetUser} (@${targetUser.username})`, embeds: [embed] });
    await interaction.editReply({ content: `Infraction posted in <#${INFRACTION_CHANNEL_ID}>.` });
    logger.info({ infractedUserId: targetUser.id, typeKey, caseId, invoker: issuer.id }, "Infraction issued");
  } catch (err) {
    logger.error({ err }, "Failed to send infraction embed");
    await interaction.editReply({ content: "Failed to post the infraction. Make sure the bot has access to the infraction channel." });
    return;
  }

  // DM the infracted user
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(config.color as number)
      .setTitle(`You Have Received a Staff Infraction — ${config.label}`)
      .addFields(
        { name: "Infraction Type", value: config.label },
        { name: "Reason", value: reason },
        { name: "Issued By", value: `${issuer} (@${issuer.username})` },
      )
      .setFooter({ text: `Case ID: ${caseId} | ${timestamp}` })
      .setTimestamp();

    if (config.autoTerminate) {
      dmEmbed.setDescription("⚠️ This infraction carries an **Automatic Termination**.");
    }

    await targetUser.send({ embeds: [dmEmbed] });
  } catch (err) {
    logger.warn({ err, targetUserId: targetUser.id }, "Could not DM user about infraction");
  }
}

// ─── /void ────────────────────────────────────────────────────────────────────

const voidCommand = new SlashCommandBuilder()
  .setName("void")
  .setDescription("Void an infraction or promotion")
  .addStringOption((o) =>
    o
      .setName("type")
      .setDescription("What to void")
      .setRequired(true)
      .addChoices(
        { name: "Infraction", value: "infraction" },
        { name: "Promotion",  value: "promotion"  },
      ),
  )
  .addStringOption((o) => o.setName("caseid").setDescription("The Case ID to void").setRequired(true))
  .addUserOption((o) => o.setName("user").setDescription("The user whose record is being voided").setRequired(true))
  .addStringOption((o) => o.setName("reason").setDescription("Reason for voiding").setRequired(true));

async function handleVoid(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, VOID_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 });
    return;
  }

  const type = interaction.options.getString("type", true) as "infraction" | "promotion";
  const caseId = interaction.options.getString("caseid", true);
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  const issuer = interaction.user;
  const guild = interaction.guild;
  const timestamp = nowTimestamp();

  await interaction.deferReply({ flags: 64 });

  const channelId = type === "infraction" ? INFRACTION_CHANNEL_ID : PROMOTION_CHANNEL_ID;
  const typeLabel = type === "infraction" ? "Infraction" : "Promotion";

  const embed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setAuthor({ name: `${typeLabel} Voided by ${issuer.displayName ?? issuer.username}`, iconURL: issuer.displayAvatarURL() })
    .setTitle(`⚪ ${typeLabel} VOIDED`)
    .setThumbnail(guild?.iconURL() ?? null)
    .addFields(
      { name: "User", value: `${targetUser} (@${targetUser.username})` },
      { name: "Voided Case ID", value: caseId },
      { name: "Reason", value: reason },
      { name: "Voided By", value: `${issuer} (@${issuer.username})` },
    )
    .setFooter({ text: `Void timestamp: ${timestamp}`, iconURL: issuer.displayAvatarURL() });

  try {
    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      await interaction.editReply({ content: "Target channel not found or is not a text channel." });
      return;
    }
    await channel.send({ content: `${targetUser} (@${targetUser.username})`, embeds: [embed] });
    await interaction.editReply({ content: `${typeLabel} for Case ID \`${caseId}\` has been voided in <#${channelId}>.` });
    logger.info({ caseId, type, targetUserId: targetUser.id, invoker: issuer.id }, "Record voided");
  } catch (err) {
    logger.error({ err }, "Failed to send void embed");
    await interaction.editReply({ content: "Failed to post the void notice." });
    return;
  }

  // DM the user about the void
  try {
    await targetUser.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle(`Your ${typeLabel} Has Been Voided`)
          .addFields(
            { name: "Voided Case ID", value: caseId },
            { name: "Reason", value: reason },
            { name: "Voided By", value: `${issuer} (@${issuer.username})` },
          )
          .setFooter({ text: `Void timestamp: ${timestamp}` })
          .setTimestamp(),
      ],
    });
  } catch (err) {
    logger.warn({ err, targetUserId: targetUser.id }, "Could not DM user about void");
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
      content: "Failed to change the nickname. Make sure the bot has the **Manage Nicknames** permission and the target user's role is below the bot's role.",
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

interface TrainingSession {
  trainingId: string;
  hostId: string;
  hostMention: string;
  attendees: Set<string>;
  ended: boolean;
  startedAt: number;
}
const trainingSessions = new Map<string, TrainingSession>();

const TRAINING_TYPES: Record<string, { label: string; description: string; pingRole: string | null }> = {
  staff_training: {
    label: "Staff Training",
    description:
      "Hello, trainees. Thank you for your interest in joining our vibrant staff team. Before you join our staff team, you are required to go through a Staff Training to ensure you meet our requirements. The training may take about 30 minutes depending on the amount on attendees. Please press the button below if you are attending this training. Good Luck.",
    pingRole: TRAINING_PING_ROLE_ID,
  },
};

const hostCommand = new SlashCommandBuilder()
  .setName("host")
  .setDescription("Hosting commands")
  .addSubcommand((sub) =>
    sub
      .setName("training")
      .setDescription("Announce a training session")
      .addUserOption((o) => o.setName("host").setDescription("The host of the training").setRequired(true))
      .addStringOption((o) => o.setName("time").setDescription('Starting time (e.g. "15 minutes")').setRequired(true))
      .addStringOption((o) =>
        o
          .setName("type")
          .setDescription("Type of training")
          .setRequired(true)
          .addChoices({ name: "Staff Training", value: "staff_training" }),
      )
      .addUserOption((o) => o.setName("cohost").setDescription("The co-host of the training (optional)").setRequired(false)),
  );

function buildTrainingEmbed(opts: {
  trainingId: string;
  hostMention: string;
  coHostMention: string;
  time: string;
  trainingType: string;
  description: string;
  status: "open" | "locked" | "ended";
  issuerName: string;
  issuerAvatar: string;
}): EmbedBuilder {
  const statusMap = {
    open:   { emoji: "🟢", label: "Open",           color: 0x2ecc71 as const },
    locked: { emoji: "🔵", label: "Locked",          color: 0x3498db as const },
    ended:  { emoji: "🔴", label: "Ended/Cancelled", color: 0xe74c3c as const },
  };
  const s = statusMap[opts.status];

  return new EmbedBuilder()
    .setColor(s.color)
    .setTitle(opts.trainingType)
    .setDescription(opts.description)
    .addFields(
      { name: "Host",          value: opts.hostMention },
      { name: "Co Host",       value: opts.coHostMention },
      { name: "Starting Time", value: `In ${opts.time}` },
      { name: "Status",        value: `${s.emoji} ${s.label}` },
    )
    .setFooter({
      text: `Training ID: ${opts.trainingId} | Announced by ${opts.issuerName}`,
      iconURL: opts.issuerAvatar,
    });
}

function buildTrainingRows(status: "open" | "locked" | "ended", trainingId: string): ActionRowBuilder<ButtonBuilder>[] {
  const ended = status === "ended";
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`training_open_${trainingId}`).setLabel("Open").setStyle(ButtonStyle.Success).setDisabled(status === "open" || ended),
    new ButtonBuilder().setCustomId(`training_lock_${trainingId}`).setLabel("Lock").setStyle(ButtonStyle.Primary).setDisabled(status === "locked" || ended),
    new ButtonBuilder().setCustomId(`training_end_${trainingId}`).setLabel("End/Cancel").setStyle(ButtonStyle.Danger).setDisabled(ended),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`training_attend_${trainingId}`).setLabel("Attend").setStyle(ButtonStyle.Success).setDisabled(ended),
    new ButtonBuilder().setCustomId(`training_viewattendees_${trainingId}`).setLabel("View Attendees").setStyle(ButtonStyle.Secondary).setDisabled(ended),
  );
  return [row1, row2];
}

async function handleHostTraining(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, HOST_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 });
    return;
  }

  const host      = interaction.options.getUser("host", true);
  const coHost    = interaction.options.getUser("cohost") ?? null;
  const time      = interaction.options.getString("time", true);
  const typeKey   = interaction.options.getString("type", true);
  const type      = TRAINING_TYPES[typeKey];
  const issuer    = interaction.user;
  const trainingId = `TRN${generateCaseId()}`;

  await interaction.deferReply({ flags: 64 });

  const channel = await interaction.client.channels.fetch(TRAINING_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) {
    await interaction.editReply({ content: "Training channel not found or is not a text channel." });
    return;
  }

  trainingSessions.set(trainingId, {
    trainingId,
    hostId:      host.id,
    hostMention: `${host}`,
    attendees:   new Set(),
    ended:       false,
    startedAt:   Date.now(),
  });

  const embed = buildTrainingEmbed({
    trainingId,
    hostMention:   `${host} (@${host.username})`,
    coHostMention: coHost ? `${coHost} (@${coHost.username})` : "-",
    time,
    trainingType:  type.label,
    description:   type.description,
    status:        "open",
    issuerName:    issuer.displayName ?? issuer.username,
    issuerAvatar:  issuer.displayAvatarURL(),
  });

  await channel.send({
    content:    type.pingRole ? `<@&${type.pingRole}>` : undefined,
    embeds:     [embed],
    components: buildTrainingRows("open", trainingId),
  });

  await interaction.editReply({ content: `Training **${trainingId}** announced in <#${TRAINING_CHANNEL_ID}>.` });
  logger.info({ trainingId, hostId: host.id, time, typeKey, invoker: issuer.id }, "Training announced");
}

async function handleTrainingButton(interaction: ButtonInteraction) {
  const cid        = interaction.customId;
  const trainingId = cid.split("_").at(-1)!;
  const session    = trainingSessions.get(trainingId);

  if (cid.startsWith("training_attend_")) {
    if (!buttonMemberHasRole(interaction.member, TRAINING_PING_ROLE_ID)) {
      await interaction.reply({ content: "You do not have permission to mark yourself as attending.", flags: 64 });
      return;
    }
    if (session?.ended) {
      await interaction.reply({ content: "This training has already ended.", flags: 64 });
      return;
    }
    if (session?.attendees.has(interaction.user.id)) {
      await interaction.reply({ content: "You are already marked as attending.", flags: 64 });
      return;
    }
    session?.attendees.add(interaction.user.id);
    await interaction.reply({ content: "You have been marked as attending!", flags: 64 });
    return;
  }

  if (cid.startsWith("training_viewattendees_")) {
    if (!session || session.attendees.size === 0) {
      await interaction.reply({ content: "No attendees yet.", flags: 64 });
      return;
    }
    const list = [...session.attendees].map((id) => `<@${id}>`).join("\n");
    await interaction.reply({ content: `**Attendees (${session.attendees.size}):**\n${list}`, flags: 64 });
    return;
  }

  if (!buttonMemberHasRole(interaction.member, HOST_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to change the training status.", flags: 64 });
    return;
  }

  const status: "open" | "locked" | "ended" =
    cid.startsWith("training_open_") ? "open" :
    cid.startsWith("training_lock_") ? "locked" : "ended";

  if (session) session.ended = status === "ended";

  const original = interaction.message.embeds[0];
  if (!original) {
    await interaction.reply({ content: "Could not read the original embed.", flags: 64 });
    return;
  }

  const hostField   = original.fields.find((f) => f.name === "Host")?.value ?? "-";
  const coHostField = original.fields.find((f) => f.name === "Co Host")?.value ?? "-";
  const timeRaw     = original.fields.find((f) => f.name === "Starting Time")?.value ?? "In -";
  const footer      = original.footer;
  const description = original.description ?? "";
  const title       = original.title ?? "Training";

  const statusMap = {
    open:   { emoji: "🟢", label: "Open",           color: 0x2ecc71 as const },
    locked: { emoji: "🔵", label: "Locked",          color: 0x3498db as const },
    ended:  { emoji: "🔴", label: "Ended/Cancelled", color: 0xe74c3c as const },
  };
  const s = statusMap[status];

  const updated = new EmbedBuilder()
    .setColor(s.color)
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: "Host",          value: hostField },
      { name: "Co Host",       value: coHostField },
      { name: "Starting Time", value: timeRaw },
      { name: "Status",        value: `${s.emoji} ${s.label}` },
    );

  if (footer) updated.setFooter({ text: footer.text, iconURL: footer.iconURL ?? undefined });

  await interaction.update({ embeds: [updated], components: buildTrainingRows(status, trainingId) });
  logger.info({ trainingId, status, invoker: interaction.user.id }, "Training status updated");
}

// ─── Registration & client ────────────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(token!);
  try {
    logger.info("Registering Discord slash commands globally...");
    await rest.put(Routes.applicationCommands(applicationId!), {
      body: [
        dmCommand.toJSON(),
        promoteCommand.toJSON(),
        infractCommand.toJSON(),
        voidCommand.toJSON(),
        nicknameCommand.toJSON(),
        hostCommand.toJSON(),
      ],
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
        if      (interaction.commandName === "dm")       await handleDm(interaction);
        else if (interaction.commandName === "promote")  await handlePromote(interaction);
        else if (interaction.commandName === "infract")  await handleInfract(interaction);
        else if (interaction.commandName === "void")     await handleVoid(interaction);
        else if (interaction.commandName === "nickname") await handleNickname(interaction);
        else if (interaction.commandName === "host" && sub === "training") await handleHostTraining(interaction);
      } else if (interaction.isButton()) {
        const cid = interaction.customId;
        if (
          cid.startsWith("training_open_") ||
          cid.startsWith("training_lock_") ||
          cid.startsWith("training_end_") ||
          cid.startsWith("training_attend_") ||
          cid.startsWith("training_viewattendees_")
        ) {
          await handleTrainingButton(interaction);
        }
      }
    } catch (err) {
      logger.error({ err }, "Error handling interaction");
    }
  });

  await client.login(token);
}
