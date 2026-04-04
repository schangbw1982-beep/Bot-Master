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

// ─── /host training & /mark ───────────────────────────────────────────────────

const HOST_ALLOWED_ROLE_ID = "1489217034347741214";
const TRAINING_CHANNEL_ID  = "1489215317316993136";
const TRAINING_PING_ROLE_ID = "1489227175394676807";

interface TrainingSession {
  trainingId: string;
  hostId: string;
  hostMention: string;
  attendees: Set<string>;
  ended: boolean;
  startedAt: number;
}
const trainingSessions = new Map<string, TrainingSession>();

function buttonMemberHasRole(
  member: ButtonInteraction["member"],
  roleId: string,
): boolean {
  return !!(
    member &&
    "roles" in member &&
    (Array.isArray(member.roles)
      ? member.roles.includes(roleId)
      : (member.roles as { cache: Map<string, unknown> }).cache.has(roleId))
  );
}

const TRAINING_TYPES: Record<string, { label: string; description: string; pingRole: string | null }> = {
  initial_training_programme: {
    label: "Initial Training Programme",
    description:
      "An Initial Training Programme has been started, join the in-game server and enter the Whitelisted Team. Then, head to the briefing room to attend the training.",
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
      .addUserOption((o) =>
        o.setName("host").setDescription("The host of the training").setRequired(true),
      )
      .addStringOption((o) =>
        o.setName("time").setDescription('Starting time (e.g. "15 minutes")').setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("type")
          .setDescription("Type of training")
          .setRequired(true)
          .addChoices({ name: "Initial Training Programme", value: "initial_training_programme" }),
      )
      .addUserOption((o) =>
        o.setName("cohost").setDescription("The co-host of the training (optional)").setRequired(false),
      ),
  );

// ─── /mark ────────────────────────────────────────────────────────────────────

const markCommand = new SlashCommandBuilder()
  .setName("mark")
  .setDescription("Mark a user's training attendance")
  .addUserOption((o) =>
    o.setName("user").setDescription("The user to mark").setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName("type")
      .setDescription("Attendance type")
      .setRequired(true)
      .addChoices(
        { name: "Absent",   value: "Absent" },
        { name: "Attended", value: "Attended" },
      ),
  );

async function handleMark(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, HOST_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const markType   = interaction.options.getString("type", true);

  await interaction.deferReply({ flags: 64 });

  const sessions = [...trainingSessions.values()].sort((a, b) => b.startedAt - a.startedAt);
  const session  = sessions[0] ?? null;

  if (!session) {
    await interaction.editReply({ content: "No training sessions found. Host a training first." });
    return;
  }

  try {
    await targetUser.send(
      `Hey there, ${targetUser.username}. You have been marked as **${markType}** in **${session.trainingId}**. ` +
      `If this was a mistake, please ping <@${session.hostId}> and address the issue. Thank you for your understanding.`,
    );
  } catch (err) {
    logger.warn({ err, targetUserId: targetUser.id }, "Could not DM user for mark");
    await interaction.editReply({
      content: `Could not DM ${targetUser} — they may have DMs disabled. Mark recorded as **${markType}** in **${session.trainingId}**.`,
    });
    return;
  }

  await interaction.editReply({
    content: `${targetUser} has been marked as **${markType}** in **${session.trainingId}** and notified via DM.`,
  });
  logger.info({ targetUserId: targetUser.id, markType, trainingId: session.trainingId, invoker: interaction.user.id }, "User marked");
}

// ─── Embed & button builders ──────────────────────────────────────────────────

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

function buildTrainingRows(
  status: "open" | "locked" | "ended",
  trainingId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const ended = status === "ended";
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`training_open_${trainingId}`)
      .setLabel("Open")
      .setStyle(ButtonStyle.Success)
      .setDisabled(status === "open" || ended),
    new ButtonBuilder()
      .setCustomId(`training_lock_${trainingId}`)
      .setLabel("Lock")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(status === "locked" || ended),
    new ButtonBuilder()
      .setCustomId(`training_end_${trainingId}`)
      .setLabel("End/Cancel")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(ended),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`training_attend_${trainingId}`)
      .setLabel("Attend")
      .setStyle(ButtonStyle.Success)
      .setDisabled(ended),
    new ButtonBuilder()
      .setCustomId(`training_viewattendees_${trainingId}`)
      .setLabel("View Attendees")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(ended),
  );
  return [row1, row2];
}

// ─── Command handler ──────────────────────────────────────────────────────────

async function handleHostTraining(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, HOST_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 });
    return;
  }

  const host    = interaction.options.getUser("host", true);
  const coHost  = interaction.options.getUser("cohost") ?? null;
  const time    = interaction.options.getString("time", true);
  const typeKey = interaction.options.getString("type", true);
  const type    = TRAINING_TYPES[typeKey];
  const issuer  = interaction.user;
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

// ─── Button handler ───────────────────────────────────────────────────────────

async function handleTrainingButton(interaction: ButtonInteraction) {
  const cid        = interaction.customId;
  const trainingId = cid.split("_").at(-1)!;
  const session    = trainingSessions.get(trainingId);

  // ── Attend ────────────────────────────────────────────────────────────────
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

  // ── View Attendees ────────────────────────────────────────────────────────
  if (cid.startsWith("training_viewattendees_")) {
    if (!session || session.attendees.size === 0) {
      await interaction.reply({ content: "No attendees yet.", flags: 64 });
      return;
    }
    const list = [...session.attendees].map((id) => `<@${id}>`).join("\n");
    await interaction.reply({ content: `**Attendees (${session.attendees.size}):**\n${list}`, flags: 64 });
    return;
  }

  // ── Status buttons (Open / Lock / End/Cancel) ─────────────────────────────
  if (!buttonMemberHasRole(interaction.member, HOST_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to change the training status.", flags: 64 });
    return;
  }

  const status: "open" | "locked" | "ended" =
    cid.startsWith("training_open_") ? "open" :
    cid.startsWith("training_lock_") ? "locked" : "ended";

  if (session) {
    session.ended = status === "ended";
  }

  const original = interaction.message.embeds[0];
  if (!original) {
    await interaction.reply({ content: "Could not read the original embed.", flags: 64 });
    return;
  }

  const hostField    = original.fields.find((f) => f.name === "Host")?.value ?? "-";
  const coHostField  = original.fields.find((f) => f.name === "Co Host")?.value ?? "-";
  const timeRaw      = original.fields.find((f) => f.name === "Starting Time")?.value ?? "In -";
  const footer       = original.footer;
  const description  = original.description ?? "";
  const title        = original.title ?? "Training";

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

  if (footer) {
    updated.setFooter({ text: footer.text, iconURL: footer.iconURL ?? undefined });
  }

  await interaction.update({ embeds: [updated], components: buildTrainingRows(status, trainingId) });
  logger.info({ trainingId, status, invoker: interaction.user.id }, "Training status updated");
}

// ─── Registration & client ────────────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(token!);
  try {
    logger.info("Registering Discord slash commands globally...");
    await rest.put(Routes.applicationCommands(applicationId!), {
      body: [dmCommand.toJSON(), promoteCommand.toJSON(), nicknameCommand.toJSON(), hostCommand.toJSON(), markCommand.toJSON()],
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
        else if (interaction.commandName === "mark") await handleMark(interaction);
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
