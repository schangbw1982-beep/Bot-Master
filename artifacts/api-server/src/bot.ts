import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  ChannelType,
  Message,
  TextBasedChannel,
} from "discord.js";
import path from "path";
import { logger } from "./lib/logger";

const BANNER_PATH = path.resolve(process.cwd(), "assets/banner.png");

const token = process.env["DISCORD_BOT_TOKEN"];
const applicationId = process.env["DISCORD_APPLICATION_ID"];

// ─── Role IDs ─────────────────────────────────────────────────────────────────

const DM_ALLOWED_ROLE_ID             = "1488086630731616337";
const PROMOTE_ALLOWED_ROLE_ID        = "1492711090595958805";
const INFRACT_ALLOWED_ROLE_ID        = "1492711090595958805";
const VOID_ALLOWED_ROLE_ID           = "1492711090595958805";
const NICKNAME_ALLOWED_ROLE_ID       = "1489216408620630186";
const HOST_ALLOWED_ROLE_ID           = "1492702143126437939";
const SEND_APP_ALLOWED_ROLE_ID       = "1492502925409259650";
const APP_REVIEWER_ROLE_ID           = "1493149484358828075";
const TRAINING_PING_ROLE_ID          = "1492701877991899206";

// ─── Infraction role IDs ──────────────────────────────────────────────────────

const STRIKE_1_ROLE_ID               = "1492511182488338463";
const STRIKE_2_ROLE_ID               = "1492511315846103173";
const STRIKE_3_ROLE_ID               = "1492511654519246848";
const ACTIVITY_STRIKE_1_ROLE_ID      = "1492511490262175834";
const ACTIVITY_STRIKE_2_ROLE_ID      = "1492511575532113940";
const TERMINATION_ROLE_ID            = "1492709533926035506";
const STAFF_BLACKLISTED_ROLE_ID      = "1492512488397344939";

// ─── Channel IDs ──────────────────────────────────────────────────────────────

const PROMOTION_CHANNEL_ID           = "1492700739921903776";
const INFRACTION_CHANNEL_ID          = "1492700966292557968";
const TRAINING_CHANNEL_ID            = "1492702523721777192";
const APPLICATION_REVIEW_CHANNEL_ID  = "1493149597625745448";
const APPLICATION_RESULTS_CHANNEL_ID = "1491749630218731701";

if (!token) throw new Error("DISCORD_BOT_TOKEN is required.");
if (!applicationId) throw new Error("DISCORD_APPLICATION_ID is required.");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORANGE = 0xe67e22;
const BLUE   = 0x5865f2;
const GREEN  = 0x2ecc71;
const RED    = 0xe74c3c;
const GREY   = 0x95a5a6;
const DARK   = 0x1a1d21;

// ─── Infraction record store ──────────────────────────────────────────────────

interface InfractionRecord {
  caseId:          string;
  issuerId:        string;
  infractedId:     string;
  guildId:         string;
  channelId:       string;
  proofThreadDone:  boolean;
  appealThreadDone: boolean;
}
const infractionRecords  = new Map<string, InfractionRecord>();
let   appealThreadCounter = 1000;

function makeBanner(): AttachmentBuilder {
  return new AttachmentBuilder(BANNER_PATH, { name: "banner.png" });
}

function buildInfractionButtons(caseId: string, proofDone: boolean, appealDone: boolean): ActionRowBuilder<ButtonBuilder> {
  const proofBtn = new ButtonBuilder()
    .setCustomId(`infr_proof_${caseId}`)
    .setStyle(proofDone ? ButtonStyle.Secondary : ButtonStyle.Secondary)
    .setLabel(proofDone ? "Proof Thread Created" : "Post Proof")
    .setDisabled(proofDone);
  if (!proofDone) proofBtn.setEmoji("🔗");

  const appealBtn = new ButtonBuilder()
    .setCustomId(`infr_appeal_${caseId}`)
    .setStyle(appealDone ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setLabel(appealDone ? "Appeal Thread Created" : "Appeal Infraction")
    .setDisabled(appealDone);
  if (!appealDone) appealBtn.setEmoji("✅");

  return new ActionRowBuilder<ButtonBuilder>().addComponents(proofBtn, appealBtn);
}

function generateCaseId(): string {
  return `SM${Math.floor(1000 + Math.random() * 9000)}`;
}

function memberHasRole(member: ChatInputCommandInteraction["member"], roleId: string): boolean {
  return !!(member && "roles" in member && (Array.isArray(member.roles) ? member.roles.includes(roleId) : member.roles.cache.has(roleId)));
}

function buttonMemberHasRole(member: ButtonInteraction["member"], roleId: string): boolean {
  return !!(member && "roles" in member && (Array.isArray(member.roles) ? member.roles.includes(roleId) : (member.roles as { cache: Map<string, unknown> }).cache.has(roleId)));
}

function nowTimestamp(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) + " " + now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ─── /dm ──────────────────────────────────────────────────────────────────────

const dmCommand = new SlashCommandBuilder()
  .setName("dm")
  .setDescription("Send a direct message to a user")
  .addStringOption((o) => o.setName("message").setDescription("The message to send").setRequired(true))
  .addUserOption((o) => o.setName("user").setDescription("The user to DM (@mention)").setRequired(false))
  .addStringOption((o) => o.setName("userid").setDescription("User ID to DM").setRequired(false));

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
    try { resolvedUser = await interaction.client.users.fetch(targetUserId); }
    catch { await interaction.editReply({ content: `Could not find user with ID \`${targetUserId}\`.` }); return; }
  }
  if (!resolvedUser) { await interaction.editReply({ content: "Please provide either a @user mention or a user ID." }); return; }
  try {
    await resolvedUser.send(message);
    await interaction.editReply({ content: `Successfully sent a DM to **${resolvedUser.tag}**.` });
  } catch (err) {
    logger.error({ err }, "Failed to send DM");
    await interaction.editReply({ content: `Could not DM **${resolvedUser.tag}**. They may have DMs disabled.` });
  }
}

// ─── /promote ─────────────────────────────────────────────────────────────────

const promoteCommand = new SlashCommandBuilder()
  .setName("promote")
  .setDescription("Issue a staff promotion")
  .addUserOption((o) => o.setName("user").setDescription("The user to promote").setRequired(true))
  .addRoleOption((o) => o.setName("role").setDescription("The role to promote them to").setRequired(true))
  .addStringOption((o) => o.setName("zero_tolerance_policy").setDescription("Zero Tolerance Policy duration").setRequired(true).addChoices({ name: "1 Week", value: "1 Week" }, { name: "2 Weeks", value: "2 Weeks" }))
  .addStringOption((o) => o.setName("reason").setDescription("Reason for the promotion").setRequired(false))
  .addStringOption((o) => o.setName("invite_url").setDescription("Invite link for the button (optional)").setRequired(false));

async function handlePromote(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, PROMOTE_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 });
    return;
  }
  const targetUser          = interaction.options.getUser("user", true);
  const role                = interaction.options.getRole("role", true);
  const zeroTolerancePolicy = interaction.options.getString("zero_tolerance_policy", true);
  const reason              = interaction.options.getString("reason") ?? "No reason provided.";
  const inviteUrl           = interaction.options.getString("invite_url") ?? null;
  const issuer              = interaction.user;
  const guild               = interaction.guild;
  const caseId              = generateCaseId();
  const timestamp           = nowTimestamp();
  const botAvatar           = interaction.client.user?.displayAvatarURL() ?? undefined;

  await interaction.deferReply({ flags: 64 });

  if (guild) {
    try { const member = await guild.members.fetch(targetUser.id); await member.roles.add(role.id, `Promoted by ${issuer.tag} — ${reason}`); }
    catch (err) { logger.warn({ err }, "Could not assign role"); }
  }

  const banner = makeBanner();
  const embed  = new EmbedBuilder()
    .setColor(DARK)
    .setAuthor({ name: `Promotion Issued by ${issuer.displayName ?? issuer.username}`, iconURL: issuer.displayAvatarURL() })
    .setTitle("Staff Promotion")
    .setThumbnail(botAvatar ?? null)
    .addFields(
      { name: "Promoted User",         value: `${targetUser} (@${targetUser.username})` },
      { name: "Promoted To",           value: `<@&${role.id}>` },
      { name: "Reason",                value: reason },
      { name: "Zero Tolerance Policy", value: zeroTolerancePolicy },
    )
    .setImage("attachment://banner.png")
    .setFooter({ text: `Case ID: ${caseId} | ${timestamp}` });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (inviteUrl) components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel("Join the Server").setStyle(ButtonStyle.Link).setURL(inviteUrl)));

  try {
    const channel = await interaction.client.channels.fetch(PROMOTION_CHANNEL_ID);
    if (!channel?.isTextBased()) { await interaction.editReply({ content: "Promotion channel not found." }); return; }
    await channel.send({ content: `${targetUser} (@${targetUser.username})`, embeds: [embed], files: [banner], components });
    await interaction.editReply({ content: `Promotion posted in <#${PROMOTION_CHANNEL_ID}>.` });
    logger.info({ promotedUserId: targetUser.id, caseId, invoker: issuer.id }, "Promotion issued");
  } catch (err) { logger.error({ err }, "Failed to send promotion embed"); await interaction.editReply({ content: "Failed to post promotion." }); return; }

  try {
    const dmBanner = makeBanner();
    await targetUser.send({ embeds: [new EmbedBuilder().setColor(DARK).setTitle("You Have Been Promoted!").addFields({ name: "Promoted To", value: `<@&${role.id}>` }, { name: "Reason", value: reason }, { name: "Zero Tolerance Policy", value: zeroTolerancePolicy }, { name: "Issued By", value: `${issuer} (@${issuer.username})` }).setImage("attachment://banner.png").setFooter({ text: `Case ID: ${caseId} | ${timestamp}` }).setTimestamp()], files: [dmBanner] });
  } catch (err) { logger.warn({ err }, "Could not DM user about promotion"); }
}

// ─── /infract ─────────────────────────────────────────────────────────────────

const INFRACTION_CONFIG: Record<string, { label: string; roleId: string; color: number; autoTerminate: boolean }> = {
  strike_1:          { label: "Strike 1",          roleId: STRIKE_1_ROLE_ID,          color: 0xf1c40f, autoTerminate: false },
  strike_2:          { label: "Strike 2",          roleId: STRIKE_2_ROLE_ID,          color: 0xe67e22, autoTerminate: false },
  strike_3:          { label: "Strike 3",          roleId: STRIKE_3_ROLE_ID,          color: RED,      autoTerminate: true  },
  activity_strike_1: { label: "Activity Strike 1", roleId: ACTIVITY_STRIKE_1_ROLE_ID, color: 0xe67e22, autoTerminate: false },
  activity_strike_2: { label: "Activity Strike 2", roleId: ACTIVITY_STRIKE_2_ROLE_ID, color: RED,      autoTerminate: true  },
  termination:       { label: "Termination",       roleId: TERMINATION_ROLE_ID,       color: 0x992d22, autoTerminate: false },
  staff_blacklisted: { label: "Staff Blacklisted", roleId: STAFF_BLACKLISTED_ROLE_ID, color: 0x2c2f33, autoTerminate: false },
};

const infractCommand = new SlashCommandBuilder()
  .setName("infract")
  .setDescription("Issue a staff infraction")
  .addUserOption((o) => o.setName("user").setDescription("The user to infract").setRequired(true))
  .addStringOption((o) => o.setName("type").setDescription("Type of infraction").setRequired(true).addChoices(
    { name: "Strike 1",                             value: "strike_1"          },
    { name: "Strike 2",                             value: "strike_2"          },
    { name: "Strike 3 (Auto-Termination)",          value: "strike_3"          },
    { name: "Activity Strike 1",                    value: "activity_strike_1" },
    { name: "Activity Strike 2 (Auto-Termination)", value: "activity_strike_2" },
    { name: "Termination",                          value: "termination"       },
    { name: "Staff Blacklisted",                    value: "staff_blacklisted" },
  ))
  .addStringOption((o) => o.setName("reason").setDescription("Reason for the infraction").setRequired(true));

async function handleInfract(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, INFRACT_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 });
    return;
  }
  const targetUser = interaction.options.getUser("user", true);
  const typeKey    = interaction.options.getString("type", true);
  const reason     = interaction.options.getString("reason", true);
  const config     = INFRACTION_CONFIG[typeKey];
  const issuer     = interaction.user;
  const guild      = interaction.guild;
  const caseId     = generateCaseId();
  const timestamp  = nowTimestamp();
  const botAvatar  = interaction.client.user?.displayAvatarURL() ?? undefined;

  await interaction.deferReply({ flags: 64 });

  if (guild) {
    try {
      const member = await guild.members.fetch(targetUser.id);
      await member.roles.add(config.roleId, `${config.label} by ${issuer.tag} — ${reason}`);
      if (config.autoTerminate) await member.roles.add(TERMINATION_ROLE_ID, `Auto-terminated due to ${config.label}`);
    } catch (err) { logger.warn({ err }, "Could not assign infraction role"); }
  }

  const banner = makeBanner();
  const embed  = new EmbedBuilder()
    .setColor(DARK)
    .setAuthor({ name: `Infraction Logged by ${issuer.displayName ?? issuer.username}`, iconURL: issuer.displayAvatarURL() })
    .setTitle("Staff Infraction")
    .setThumbnail(botAvatar ?? null)
    .addFields(
      { name: "Staff Member",    value: `${targetUser} (@${targetUser.username})` },
      { name: "Infraction Type", value: config.label },
      { name: "Reason",          value: reason },
      { name: "Appeal Status",   value: "Appealable" },
    )
    .setImage("attachment://banner.png")
    .setFooter({ text: `Case ID: ${caseId} | ${timestamp}` });

  if (config.autoTerminate) embed.setDescription("⚠️ **This infraction carries an AUTOMATIC TERMINATION.**");

  const infrRow = buildInfractionButtons(caseId, false, false);

  let channelId = INFRACTION_CHANNEL_ID;
  try {
    const channel = await interaction.client.channels.fetch(INFRACTION_CHANNEL_ID);
    if (!channel?.isTextBased()) { await interaction.editReply({ content: "Infraction channel not found." }); return; }
    channelId = channel.id;
    await channel.send({ content: `${targetUser} (@${targetUser.username})`, embeds: [embed], files: [banner], components: [infrRow] });
    await interaction.editReply({ content: `Infraction posted in <#${INFRACTION_CHANNEL_ID}>.` });
    logger.info({ infractedUserId: targetUser.id, typeKey, caseId, invoker: issuer.id }, "Infraction issued");
  } catch (err) { logger.error({ err }, "Failed to send infraction embed"); await interaction.editReply({ content: "Failed to post infraction." }); return; }

  // Store record for button handlers
  infractionRecords.set(caseId, {
    caseId, issuerId: issuer.id, infractedId: targetUser.id,
    guildId: guild?.id ?? "", channelId,
    proofThreadDone: false, appealThreadDone: false,
  });

  try {
    const dmBanner = makeBanner();
    const dmEmbed  = new EmbedBuilder().setColor(DARK).setTitle(`You Have Received a Staff Infraction — ${config.label}`).addFields({ name: "Infraction Type", value: config.label }, { name: "Reason", value: reason }, { name: "Issued By", value: `${issuer} (@${issuer.username})` }, { name: "Appeal Status", value: "Appealable" }).setImage("attachment://banner.png").setFooter({ text: `Case ID: ${caseId} | ${timestamp}` }).setTimestamp();
    if (config.autoTerminate) dmEmbed.setDescription("⚠️ This infraction carries an **Automatic Termination**.");
    await targetUser.send({ embeds: [dmEmbed], files: [dmBanner] });
  } catch (err) { logger.warn({ err }, "Could not DM user about infraction"); }
}

// ─── Infraction thread buttons ────────────────────────────────────────────────

async function handleInfractionProof(interaction: ButtonInteraction) {
  const caseId = interaction.customId.replace("infr_proof_", "");
  const record  = infractionRecords.get(caseId);

  if (!record) { await interaction.reply({ content: "❌ This infraction record was not found (bot may have restarted).", flags: 64 }); return; }
  if (interaction.user.id !== record.issuerId) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(RED).setTitle("❌ Not Permitted").setDescription("→ Only the issuing moderator can open a proof thread.")], flags: 64 });
    return;
  }

  record.proofThreadDone = true;
  await interaction.update({ components: [buildInfractionButtons(caseId, true, record.appealThreadDone)] });

  try {
    const channel = interaction.channel;
    if (!channel || !("threads" in channel)) { await interaction.followUp({ content: "Could not create thread — channel does not support threads.", flags: 64 }); return; }
    const thread = await (channel as any).threads.create({
      name:      `Proof, Case #${caseId}`,
      type:      ChannelType.PrivateThread,
      invitable: false,
      reason:    `Proof thread for infraction ${caseId}`,
    });
    await thread.members.add(record.issuerId);
    await thread.members.add(record.infractedId);
    await thread.send({ embeds: [new EmbedBuilder().setColor(DARK).setTitle(`🔗 Proof Thread — Case #${caseId}`).setDescription("This is a private proof thread. Only the issuing moderator and the infracted staff member can see this thread.\n\nPlease post any relevant proof here.")] });
  } catch (err) {
    logger.error({ err }, "Failed to create proof thread");
    await interaction.followUp({ content: "Failed to create proof thread. Ensure the bot has the **Create Private Threads** permission.", flags: 64 });
  }
}

async function handleInfractionAppeal(interaction: ButtonInteraction) {
  const caseId = interaction.customId.replace("infr_appeal_", "");
  const record  = infractionRecords.get(caseId);

  if (!record) { await interaction.reply({ content: "❌ This infraction record was not found (bot may have restarted).", flags: 64 }); return; }
  if (interaction.user.id !== record.infractedId) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(RED).setTitle("❌ Not Permitted").setDescription("→ Only the infracted staff member can submit an appeal.")], flags: 64 });
    return;
  }

  record.appealThreadDone = true;
  const threadNum = ++appealThreadCounter;
  const safeName  = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
  await interaction.update({ components: [buildInfractionButtons(caseId, record.proofThreadDone, true)] });

  try {
    const channel = interaction.channel;
    if (!channel || !("threads" in channel)) { await interaction.followUp({ content: "Could not create thread — channel does not support threads.", flags: 64 }); return; }
    const thread = await (channel as any).threads.create({
      name:      `appeal-${safeName}-${threadNum}`,
      type:      ChannelType.PrivateThread,
      invitable: false,
      reason:    `Appeal thread for infraction ${caseId}`,
    });
    await thread.members.add(record.issuerId);
    await thread.members.add(record.infractedId);
    await thread.send({ embeds: [new EmbedBuilder().setColor(DARK).setTitle(`✅ Appeal Thread — Case #${caseId}`).setDescription("This is a private appeal thread. Only the issuing moderator and the infracted staff member can see this thread.\n\nPlease state your appeal and provide any supporting information.")] });
  } catch (err) {
    logger.error({ err }, "Failed to create appeal thread");
    await interaction.followUp({ content: "Failed to create appeal thread. Ensure the bot has the **Create Private Threads** permission.", flags: 64 });
  }
}

// ─── /void ────────────────────────────────────────────────────────────────────

const voidCommand = new SlashCommandBuilder()
  .setName("void")
  .setDescription("Void an infraction or promotion")
  .addStringOption((o) => o.setName("type").setDescription("What to void").setRequired(true).addChoices({ name: "Infraction", value: "infraction" }, { name: "Promotion", value: "promotion" }))
  .addStringOption((o) => o.setName("caseid").setDescription("The Case ID to void (e.g. SM1234)").setRequired(true))
  .addUserOption((o) => o.setName("user").setDescription("The user whose record is being voided").setRequired(true))
  .addStringOption((o) => o.setName("reason").setDescription("Reason for voiding").setRequired(true));

async function handleVoid(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, VOID_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 });
    return;
  }
  const type       = interaction.options.getString("type", true) as "infraction" | "promotion";
  const caseId     = interaction.options.getString("caseid", true);
  const targetUser = interaction.options.getUser("user", true);
  const reason     = interaction.options.getString("reason", true);
  const issuer     = interaction.user;
  const guild      = interaction.guild;
  const timestamp  = nowTimestamp();

  await interaction.deferReply({ flags: 64 });

  const channelId = type === "infraction" ? INFRACTION_CHANNEL_ID : PROMOTION_CHANNEL_ID;
  const typeLabel  = type === "infraction" ? "Infraction" : "Promotion";

  const embed = new EmbedBuilder()
    .setColor(GREY)
    .setAuthor({ name: `${typeLabel} Voided by ${issuer.displayName ?? issuer.username}`, iconURL: issuer.displayAvatarURL() })
    .setTitle(`⚪ ${typeLabel} VOIDED`)
    .setThumbnail(guild?.iconURL() ?? null)
    .addFields({ name: "User", value: `${targetUser} (@${targetUser.username})` }, { name: "Voided Case ID", value: caseId }, { name: "Reason", value: reason }, { name: "Voided By", value: `${issuer} (@${issuer.username})` })
    .setFooter({ text: `Void timestamp: ${timestamp}`, iconURL: issuer.displayAvatarURL() });

  try {
    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) { await interaction.editReply({ content: "Target channel not found." }); return; }
    await channel.send({ content: `${targetUser} (@${targetUser.username})`, embeds: [embed] });
    await interaction.editReply({ content: `${typeLabel} for Case ID \`${caseId}\` has been voided in <#${channelId}>.` });
  } catch (err) { logger.error({ err }, "Failed to send void embed"); await interaction.editReply({ content: "Failed to post void notice." }); return; }

  try {
    await targetUser.send({ embeds: [new EmbedBuilder().setColor(GREY).setTitle(`Your ${typeLabel} Has Been Voided`).addFields({ name: "Voided Case ID", value: caseId }, { name: "Reason", value: reason }, { name: "Voided By", value: `${issuer} (@${issuer.username})` }).setFooter({ text: `Void timestamp: ${timestamp}` }).setTimestamp()] });
  } catch (err) { logger.warn({ err }, "Could not DM user about void"); }
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
  const targetUser  = interaction.options.getUser("user", true);
  const newNickname = interaction.options.getString("nickname") ?? null;
  const issuer      = interaction.user;
  const guild       = interaction.guild;

  await interaction.deferReply({ flags: 64 });
  if (!guild) { await interaction.editReply({ content: "This command can only be used in a server." }); return; }

  let member;
  try { member = await guild.members.fetch(targetUser.id); }
  catch { await interaction.editReply({ content: "Could not find that user in this server." }); return; }

  const oldNickname = member.nickname ?? member.user.username;
  try { await member.setNickname(newNickname, `Changed by ${issuer.tag}`); }
  catch (err) { logger.error({ err }, "Failed to set nickname"); await interaction.editReply({ content: "Failed to change nickname. Check bot permissions." }); return; }

  const displayNew = newNickname ?? member.user.username;
  try { await targetUser.send({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle("Your Nickname Has Been Changed").addFields({ name: "Previous Nickname", value: oldNickname }, { name: "New Nickname", value: displayNew }, { name: "Changed By", value: `${issuer} (@${issuer.username})` }).setTimestamp()] }); }
  catch (err) { logger.warn({ err }, "Could not DM user about nickname change"); }

  await interaction.editReply({ content: `Nickname updated: **${oldNickname}** → **${displayNew}**.` });
}

// ─── /host training ───────────────────────────────────────────────────────────

interface TrainingSession { trainingId: string; hostId: string; attendees: Set<string>; ended: boolean; startedAt: number; }
const trainingSessions = new Map<string, TrainingSession>();

const TRAINING_TYPES: Record<string, { label: string; description: string; pingRole: string | null }> = {
  staff_training: {
    label: "Staff Training",
    description: "Hello, trainees. Thank you for your interest in joining our vibrant staff team. Before you join our staff team, you are required to go through a Staff Training to ensure you meet our requirements. The training may take about 30 minutes depending on the amount on attendees. Please press the button below if you are attending this training. Good Luck.",
    pingRole: TRAINING_PING_ROLE_ID,
  },
};

const hostCommand = new SlashCommandBuilder()
  .setName("host")
  .setDescription("Hosting commands")
  .addSubcommand((sub) => sub.setName("training").setDescription("Announce a training session")
    .addUserOption((o) => o.setName("host").setDescription("The host of the training").setRequired(true))
    .addStringOption((o) => o.setName("time").setDescription('Starting time (e.g. "15 minutes")').setRequired(true))
    .addStringOption((o) => o.setName("type").setDescription("Type of training").setRequired(true).addChoices({ name: "Staff Training", value: "staff_training" }))
    .addUserOption((o) => o.setName("cohost").setDescription("The co-host (optional)").setRequired(false)));

function buildTrainingEmbed(opts: { trainingId: string; hostMention: string; coHostMention: string; time: string; trainingType: string; description: string; status: "open" | "locked" | "ended"; issuerName: string; issuerAvatar: string }): EmbedBuilder {
  const sm = { open: { e: "🟢", l: "Open", c: GREEN }, locked: { e: "🔵", l: "Locked", c: BLUE }, ended: { e: "🔴", l: "Ended/Cancelled", c: RED } }[opts.status];
  return new EmbedBuilder().setColor(sm.c).setTitle(opts.trainingType).setDescription(opts.description).addFields({ name: "Host", value: opts.hostMention }, { name: "Co Host", value: opts.coHostMention }, { name: "Starting Time", value: `In ${opts.time}` }, { name: "Status", value: `${sm.e} ${sm.l}` }).setFooter({ text: `Training ID: ${opts.trainingId} | Announced by ${opts.issuerName}`, iconURL: opts.issuerAvatar });
}

function buildTrainingRows(status: "open" | "locked" | "ended", trainingId: string): ActionRowBuilder<ButtonBuilder>[] {
  const ended = status === "ended";
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`training_open_${trainingId}`).setLabel("Open").setStyle(ButtonStyle.Success).setDisabled(status === "open" || ended),
      new ButtonBuilder().setCustomId(`training_lock_${trainingId}`).setLabel("Lock").setStyle(ButtonStyle.Primary).setDisabled(status === "locked" || ended),
      new ButtonBuilder().setCustomId(`training_end_${trainingId}`).setLabel("End/Cancel").setStyle(ButtonStyle.Danger).setDisabled(ended),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`training_attend_${trainingId}`).setLabel("Attend").setStyle(ButtonStyle.Success).setDisabled(ended),
      new ButtonBuilder().setCustomId(`training_viewattendees_${trainingId}`).setLabel("View Attendees").setStyle(ButtonStyle.Secondary).setDisabled(ended),
    ),
  ];
}

async function handleHostTraining(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, HOST_ALLOWED_ROLE_ID)) { await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 }); return; }
  const host       = interaction.options.getUser("host", true);
  const coHost     = interaction.options.getUser("cohost") ?? null;
  const time       = interaction.options.getString("time", true);
  const typeKey    = interaction.options.getString("type", true);
  const type       = TRAINING_TYPES[typeKey];
  const issuer     = interaction.user;
  const trainingId = `TRN${generateCaseId()}`;

  await interaction.deferReply({ flags: 64 });
  const channel = await interaction.client.channels.fetch(TRAINING_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) { await interaction.editReply({ content: "Training channel not found." }); return; }

  trainingSessions.set(trainingId, { trainingId, hostId: host.id, attendees: new Set(), ended: false, startedAt: Date.now() });

  const embed = buildTrainingEmbed({ trainingId, hostMention: `${host} (@${host.username})`, coHostMention: coHost ? `${coHost} (@${coHost.username})` : "-", time, trainingType: type.label, description: type.description, status: "open", issuerName: issuer.displayName ?? issuer.username, issuerAvatar: issuer.displayAvatarURL() });
  await channel.send({ content: type.pingRole ? `<@&${type.pingRole}>` : undefined, embeds: [embed], components: buildTrainingRows("open", trainingId) });
  await interaction.editReply({ content: `Training **${trainingId}** announced in <#${TRAINING_CHANNEL_ID}>.` });
}

async function handleTrainingButton(interaction: ButtonInteraction) {
  const cid        = interaction.customId;
  const trainingId = cid.split("_").at(-1)!;
  const session    = trainingSessions.get(trainingId);

  if (cid.startsWith("training_attend_")) {
    if (!buttonMemberHasRole(interaction.member, TRAINING_PING_ROLE_ID)) { await interaction.reply({ content: "You do not have permission to mark yourself as attending.", flags: 64 }); return; }
    if (session?.ended) { await interaction.reply({ content: "This training has already ended.", flags: 64 }); return; }
    if (session?.attendees.has(interaction.user.id)) { await interaction.reply({ content: "You are already marked as attending.", flags: 64 }); return; }
    session?.attendees.add(interaction.user.id);
    await interaction.reply({ content: "You have been marked as attending!", flags: 64 });
    return;
  }

  if (cid.startsWith("training_viewattendees_")) {
    if (!session || session.attendees.size === 0) { await interaction.reply({ content: "No attendees yet.", flags: 64 }); return; }
    await interaction.reply({ content: `**Attendees (${session.attendees.size}):**\n${[...session.attendees].map((id) => `<@${id}>`).join("\n")}`, flags: 64 });
    return;
  }

  if (!buttonMemberHasRole(interaction.member, HOST_ALLOWED_ROLE_ID)) { await interaction.reply({ content: "You do not have permission to change the training status.", flags: 64 }); return; }

  const status: "open" | "locked" | "ended" = cid.startsWith("training_open_") ? "open" : cid.startsWith("training_lock_") ? "locked" : "ended";
  if (session) session.ended = status === "ended";

  const original = interaction.message.embeds[0];
  if (!original) { await interaction.reply({ content: "Could not read the original embed.", flags: 64 }); return; }

  const sm = { open: { e: "🟢", l: "Open", c: GREEN }, locked: { e: "🔵", l: "Locked", c: BLUE }, ended: { e: "🔴", l: "Ended/Cancelled", c: RED } }[status];
  const updated = new EmbedBuilder().setColor(sm.c).setTitle(original.title ?? "Training").setDescription(original.description ?? "").addFields(
    { name: "Host",          value: original.fields.find((f) => f.name === "Host")?.value          ?? "-" },
    { name: "Co Host",       value: original.fields.find((f) => f.name === "Co Host")?.value       ?? "-" },
    { name: "Starting Time", value: original.fields.find((f) => f.name === "Starting Time")?.value ?? "In -" },
    { name: "Status",        value: `${sm.e} ${sm.l}` },
  );
  if (original.footer) updated.setFooter({ text: original.footer.text, iconURL: original.footer.iconURL ?? undefined });
  await interaction.update({ embeds: [updated], components: buildTrainingRows(status, trainingId) });
}

// ─── /send application ────────────────────────────────────────────────────────

const sendCommand = new SlashCommandBuilder()
  .setName("send")
  .setDescription("Send embeds to channels")
  .addSubcommand((sub) =>
    sub.setName("application")
      .setDescription("Send the staff application embed to a channel")
      .addStringOption((o) => o.setName("channel_id").setDescription("The channel ID to send the embed to").setRequired(true)));

async function handleSendApplication(interaction: ChatInputCommandInteraction) {
  if (!memberHasRole(interaction.member, SEND_APP_ALLOWED_ROLE_ID)) {
    await interaction.reply({ content: "You do not have permission to use this command.", flags: 64 });
    return;
  }
  const channelId = interaction.options.getString("channel_id", true);
  await interaction.deferReply({ flags: 64 });

  let targetChannel;
  try { targetChannel = await interaction.client.channels.fetch(channelId); }
  catch { await interaction.editReply({ content: `Could not find channel with ID \`${channelId}\`.` }); return; }
  if (!targetChannel?.isTextBased()) { await interaction.editReply({ content: "That channel is not a text channel." }); return; }

  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle("📋 · Applications")
    .setDescription(
      "Welcome to our application center. In here, you'll find available staff applications.\n\n" +
      "The staff team plays a key role in keeping the server organized, fair, and enjoyable for everyone. " +
      "We handle reports, support players, and ensure rules are enforced consistently across the board.\n\n" +
      "If you're mature, reliable, and want to help improve the experience for others, we encourage you to apply."
    )
    .setFooter({ text: "The button below will not start your application. You will only see applications you can access." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("app_learn_more").setLabel("Learn More & Apply").setStyle(ButtonStyle.Secondary),
  );

  await targetChannel.send({ embeds: [embed], components: [row] });
  await interaction.editReply({ content: `Application embed sent to <#${channelId}>.` });
}

// ─── Application system ───────────────────────────────────────────────────────

type AppStep =
  | { type: "button"; num: number; title: string; body: string; btnLabel: string; btnId: string }
  | { type: "text";   num: number; title: string; note: string; autoDenyIfNo?: boolean };

const APP_STEPS: AppStep[] = [
  {
    type: "button", num: 1,
    title: "Acknowledge the following:",
    body:
      "Failure to follow instructions, meet requirements, or answer honestly may result in automatic denial.\n\n" +
      "To confirm, press the button below. Otherwise, you can cancel your application.",
    btnLabel: "I Acknowledge", btnId: "app_ack",
  },
  {
    type: "button", num: 2,
    title: "Do you agree to ALL of the following requirements?",
    body:
      "• You will go on duty when requested while in-game.\n" +
      "• You will handle discord checks between mod-calls to ensure all members are in our communications without complaining.\n" +
      "• You will be active for a minimum of 3 hours per week, unless approved by management.\n" +
      "• You will not abuse staff powers and will only moderate while on duty.\n" +
      "• You own a working personal PC, laptop, or phone if you have 2 devices for Discord and Roblox separately, and will use it for staff duties.\n" +
      "• You have been in the Discord server for at least 14 days.\n\n" +
      "To confirm, press the button below. Otherwise, you can cancel your application.",
    btnLabel: "I Agree", btnId: "app_agree",
  },
  { type: "text", num: 3,  title: "Are you 13 years old or older? (Yes / No)",                                note: 'Answering "No" will result in automatic denial.',                                                                                                                                                 autoDenyIfNo: true },
  { type: "text", num: 4,  title: "What is your chat age group?",                                              note: "Answer honestly. This does not affect acceptance." },
  { type: "text", num: 5,  title: "State your full Roblox username.",                                          note: "Do not use display names or shortened versions. (Example: SimonPipen08)" },
  { type: "text", num: 6,  title: "Describe your experience within the server.",                               note: 'List any departments or organisations you have been part of, your rank(s), and how long you served. If you have no experience, state "None."' },
  { type: "text", num: 7,  title: "Do you have any prior moderation or staff experience?",                     note: 'List the server name(s), approximate member count, position(s) held, and reason for leaving. If none, state "None."' },
  { type: "text", num: 8,  title: "Why are you applying for a staff position?",                                note: "Minimum: 2 complete sentences. Low-effort answers may be denied." },
  { type: "text", num: 9,  title: "Why should we select you as a staff member?",                               note: "Minimum: 2 complete sentences. Explain what you bring to the team." },
  { type: "text", num: 10, title: 'Define "RDM."',                                                             note: "State what it stands for, what it means, and when it applies." },
  { type: "text", num: 11, title: 'Define "VDM."',                                                             note: "State what it stands for, what it means, and when it applies." },
  { type: "text", num: 12, title: 'Define "FRP."',                                                             note: "State what it stands for, what it means, and when it applies." },
  { type: "text", num: 13, title: 'Define "NITRP."',                                                           note: "State what it stands for, what it means, and when it applies." },
  { type: "text", num: 14, title: 'Define "GTA Driving."',                                                     note: "State what it stands for, what it means, and when it applies." },
  { type: "text", num: 15, title: "Explain how you will handle the following scenario:",                        note: "While off duty, you observe a player blocking PD spawn, trapping officers, and killing them. Explain exactly what actions you would take. Minimum: 3 complete sentences." },
];

const TOTAL_STEPS = APP_STEPS.length; // 15

// Step value used to indicate the session is waiting for submit confirmation
const STEP_CONFIRM = TOTAL_STEPS;

interface ApplicationSession {
  userId: string;
  step: number;           // 0-based index into APP_STEPS, or STEP_CONFIRM
  textAnswers: string[];  // answers to text steps (steps 2–14, 13 answers)
  dmChannelId: string;
  timeoutId: ReturnType<typeof setTimeout>;
  appId: string;
}

interface PendingReview {
  appId: string;
  applicantId: string;
  applicantTag: string;
  applicantAvatar: string;
  textAnswers: string[];
  submittedAt: string;
  reviewMessageId: string;
}

const applicationSessions = new Map<string, ApplicationSession>();
const pendingReviews       = new Map<string, PendingReview>();

const APP_TIMEOUT_MS = 60 * 60 * 1000;

// Sends the current step as an embed in DMs
async function sendAppStep(session: ApplicationSession, client: Client) {
  const step = APP_STEPS[session.step];
  if (!step) return;

  let dmChannel: TextBasedChannel;
  try {
    const ch = await client.channels.fetch(session.dmChannelId);
    if (!ch?.isTextBased()) return;
    dmChannel = ch as TextBasedChannel;
  } catch { return; }

  if (step.type === "button") {
    const embed = new EmbedBuilder()
      .setColor(ORANGE)
      .setTitle(`Step ${step.num} of ${TOTAL_STEPS}`)
      .setDescription(`**${step.title}**\n\n${step.body}`);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${step.btnId}_${session.userId}`).setLabel(step.btnLabel).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`app_cancel_${session.userId}`).setLabel("Cancel Application").setStyle(ButtonStyle.Danger),
    );
    await dmChannel.send({ embeds: [embed], components: [row] });
  } else {
    const embed = new EmbedBuilder()
      .setColor(ORANGE)
      .setTitle(`Question ${step.num} of ${TOTAL_STEPS}`)
      .setDescription(`**${step.title}**\n\n*${step.note}*`)
      .setFooter({ text: "Type your answer below. Type 'cancel' to cancel your application." });

    await dmChannel.send({ embeds: [embed] });
  }
}

// Sends the submit confirmation embed
async function sendSubmitConfirmation(session: ApplicationSession, client: Client) {
  let dmChannel: TextBasedChannel;
  try {
    const ch = await client.channels.fetch(session.dmChannelId);
    if (!ch?.isTextBased()) return;
    dmChannel = ch as TextBasedChannel;
  } catch { return; }

  const embed = new EmbedBuilder()
    .setColor(GREEN)
    .setTitle("✅ All Questions Answered!")
    .setDescription(
      "You have answered all **15 questions**. Please review and confirm before submitting.\n\n" +
      "**Once submitted, your application cannot be edited.**"
    )
    .addFields({ name: "⚠️ Are you ready to submit?", value: "Press **Submit Application** to send your application for review, or **Cancel** to discard it." })
    .setFooter({ text: `App ID: ${session.appId}` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`app_submit_confirm_${session.userId}`).setLabel("Submit Application").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`app_submit_cancel_${session.userId}`).setLabel("Cancel").setStyle(ButtonStyle.Danger),
  );

  await dmChannel.send({ embeds: [embed], components: [row] });
}

// Builds and posts the application to the review channel, DMs the applicant
async function submitApplication(session: ApplicationSession, client: Client) {
  const appId     = session.appId;
  const applicant = await client.users.fetch(session.userId).catch(() => null);
  if (!applicant) return;

  const timestamp = nowTimestamp();
  const textSteps = APP_STEPS.filter((s) => s.type === "text") as Extract<AppStep, { type: "text" }>[];

  const fields = textSteps.map((step, i) => ({
    name:  `Q${step.num}: ${step.title.substring(0, 200)}`,
    value: (session.textAnswers[i] ?? "No answer").substring(0, 1024),
  }));

  const reviewEmbed = new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle("📋 New Staff Application")
    .setAuthor({ name: applicant.tag, iconURL: applicant.displayAvatarURL() })
    .setDescription(`**Applicant:** ${applicant} (@${applicant.username})\n**App ID:** \`${appId}\`\n**Submitted:** ${timestamp}`)
    .addFields(...fields.slice(0, 25))
    .setFooter({ text: `App ID: ${appId} | User ID: ${applicant.id}` });

  const reviewRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`app_accept_${appId}`).setLabel("Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`app_deny_${appId}`).setLabel("Deny").setStyle(ButtonStyle.Danger),
  );

  try {
    const reviewChannel = await client.channels.fetch(APPLICATION_REVIEW_CHANNEL_ID);
    if (reviewChannel?.isTextBased()) {
      const reviewMsg = await reviewChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });
      // Overflow if more than 25 fields
      if (fields.length > 25) {
        const overflow = new EmbedBuilder().setColor(ORANGE).setTitle(`📋 Application (cont.) — ${applicant.tag}`).addFields(...fields.slice(25));
        await reviewChannel.send({ embeds: [overflow] });
      }
      pendingReviews.set(appId, {
        appId,
        applicantId:     applicant.id,
        applicantTag:    applicant.tag,
        applicantAvatar: applicant.displayAvatarURL(),
        textAnswers:     session.textAnswers,
        submittedAt:     timestamp,
        reviewMessageId: reviewMsg.id,
      });
    }
  } catch (err) { logger.error({ err }, "Failed to post application to review channel"); }

  try {
    await applicant.send({ embeds: [new EmbedBuilder().setColor(GREEN).setTitle("✅ Application Submitted!").setDescription("Your application is now under review. You will be notified of the result via DM.").setFooter({ text: `App ID: ${appId}` }).setTimestamp()] });
  } catch (err) { logger.warn({ err }, "Could not DM applicant confirmation"); }

  logger.info({ userId: applicant.id, appId }, "Application submitted for review");
}

// ── Learn More & Apply button ─────────────────────────────────────────────────

async function handleLearnMore(interaction: ButtonInteraction) {
  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle("🛡️ Before You Apply")
    .setDescription("Please read all the information below carefully before starting your application.")
    .addFields(
      { name: "⏱️ Time Limit",       value: "You have **60 minutes** to complete your application. Make sure you have enough time before starting." },
      { name: "📋 Length Requirements", value: "Some questions have minimum length requirements. Pay close attention to **all** instructions." },
      { name: "✍️ Your Own Work",     value: "All answers must be written by **you**. The use of AI or copying others is strictly prohibited." },
      { name: "✅ Honesty",           value: "Your answers must be **truthful**. Applications with false information will be denied." },
      { name: "❌ Cancellation",      value: "You can cancel your application at any time. A record **may** be stored regardless." },
    )
    .setFooter({ text: "If you don't meet any of the requirements, your application will be instantly denied." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("app_apply_now").setLabel("Apply Now").setStyle(ButtonStyle.Success),
  );

  await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
}

// ── Apply Now button ──────────────────────────────────────────────────────────

async function handleApplyNow(interaction: ButtonInteraction) {
  const userId = interaction.user.id;

  if (applicationSessions.has(userId)) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(RED).setTitle("Active Application Found").setDescription("You already have an active application in progress. Please finish it or wait for it to expire.")], flags: 64 });
    return;
  }

  await interaction.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setTitle("Application Started!").setDescription("Check your **DMs** — your application has been sent. You have **60 minutes** to complete it.")], flags: 64 });

  let dmChannel: TextBasedChannel;
  try {
    dmChannel = await interaction.user.createDM();
    await dmChannel.send({ embeds: [new EmbedBuilder().setColor(ORANGE).setTitle("👋 Welcome to the Staff Application").setDescription("You have **60 minutes** to complete all 15 steps.\n\nType `cancel` in any text step to cancel your application.")] });
  } catch {
    await interaction.followUp({ embeds: [new EmbedBuilder().setColor(RED).setTitle("Could Not Send DM").setDescription("I couldn't DM you. Please enable **Direct Messages** from server members and try again.")], flags: 64 });
    return;
  }

  const appId     = generateCaseId();
  const timeoutId = setTimeout(async () => {
    applicationSessions.delete(userId);
    try { await dmChannel.send({ embeds: [new EmbedBuilder().setColor(RED).setTitle("⏰ Application Expired").setDescription("Your 60-minute time limit has been reached. You may start a new application at any time.").setFooter({ text: `App ID: ${appId}` })] }); } catch { /* DMs closed */ }
    logger.info({ userId }, "Application expired");
  }, APP_TIMEOUT_MS);

  const session: ApplicationSession = { userId, step: 0, textAnswers: [], dmChannelId: dmChannel.id, timeoutId, appId };
  applicationSessions.set(userId, session);
  await sendAppStep(session, interaction.client);
  logger.info({ userId, appId }, "Application started");
}

// ── I Acknowledge button ──────────────────────────────────────────────────────

async function handleAppAck(interaction: ButtonInteraction) {
  const userId  = interaction.customId.replace("app_ack_", "");
  const session = applicationSessions.get(userId);
  if (!session) { await interaction.update({ components: [] }); await interaction.followUp({ embeds: [new EmbedBuilder().setColor(RED).setTitle("Session Expired").setDescription("Your application session has expired.")], flags: 64 }); return; }
  await interaction.update({ components: [] });
  session.step = 1;
  await sendAppStep(session, interaction.client);
}

// ── I Agree button ────────────────────────────────────────────────────────────

async function handleAppAgree(interaction: ButtonInteraction) {
  const userId  = interaction.customId.replace("app_agree_", "");
  const session = applicationSessions.get(userId);
  if (!session) { await interaction.update({ components: [] }); await interaction.followUp({ embeds: [new EmbedBuilder().setColor(RED).setTitle("Session Expired").setDescription("Your application session has expired.")], flags: 64 }); return; }
  await interaction.update({ components: [] });
  session.step = 2;
  await sendAppStep(session, interaction.client);
}

// ── Cancel button (on button steps) ──────────────────────────────────────────

async function handleAppCancelButton(interaction: ButtonInteraction) {
  const userId  = interaction.customId.replace("app_cancel_", "");
  const session = applicationSessions.get(userId);
  if (!session) { await interaction.update({ components: [] }); return; }
  clearTimeout(session.timeoutId);
  applicationSessions.delete(userId);
  await interaction.update({ components: [] });
  await interaction.followUp({ embeds: [new EmbedBuilder().setColor(RED).setTitle("❌ Application Cancelled").setDescription("Your application has been cancelled. You may start a new one at any time.")] });
}

// ── Submit Confirm button ─────────────────────────────────────────────────────

async function handleAppSubmitConfirm(interaction: ButtonInteraction) {
  const userId  = interaction.customId.replace("app_submit_confirm_", "");
  const session = applicationSessions.get(userId);
  if (!session) { await interaction.update({ components: [] }); await interaction.followUp({ embeds: [new EmbedBuilder().setColor(RED).setTitle("Session Expired").setDescription("Your application session has expired.")], flags: 64 }); return; }

  clearTimeout(session.timeoutId);
  applicationSessions.delete(userId);
  await interaction.update({ components: [] });
  await interaction.followUp({ embeds: [new EmbedBuilder().setColor(GREEN).setTitle("Submitting...").setDescription("Your application is being submitted. Please wait.")] });
  await submitApplication(session, interaction.client);
}

// ── Submit Cancel button ──────────────────────────────────────────────────────

async function handleAppSubmitCancel(interaction: ButtonInteraction) {
  const userId  = interaction.customId.replace("app_submit_cancel_", "");
  const session = applicationSessions.get(userId);
  if (!session) { await interaction.update({ components: [] }); return; }
  clearTimeout(session.timeoutId);
  applicationSessions.delete(userId);
  await interaction.update({ components: [] });
  await interaction.followUp({ embeds: [new EmbedBuilder().setColor(RED).setTitle("❌ Application Cancelled").setDescription("Your application has been cancelled. You may start a new one at any time.")] });
}

// ── Accept button on review embed ─────────────────────────────────────────────

async function handleAppAccept(interaction: ButtonInteraction, appId: string) {
  if (!buttonMemberHasRole(interaction.member, APP_REVIEWER_ROLE_ID)) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(RED).setTitle("No Permission").setDescription("You do not have permission to review applications.")], flags: 64 });
    return;
  }
  const modal = new ModalBuilder().setCustomId(`app_modal_accept_${appId}`).setTitle("Accept Application");
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder().setCustomId("feedback").setLabel("Feedback for the applicant").setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(10).setPlaceholder("Congratulations! You have been accepted because..."),
  ));
  await interaction.showModal(modal);
}

// ── Deny button on review embed ───────────────────────────────────────────────

async function handleAppDeny(interaction: ButtonInteraction, appId: string) {
  if (!buttonMemberHasRole(interaction.member, APP_REVIEWER_ROLE_ID)) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(RED).setTitle("No Permission").setDescription("You do not have permission to review applications.")], flags: 64 });
    return;
  }
  const modal = new ModalBuilder().setCustomId(`app_modal_deny_${appId}`).setTitle("Deny Application");
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder().setCustomId("feedback").setLabel("Feedback for the applicant").setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(10).setPlaceholder("Unfortunately, your application has been denied because..."),
  ));
  await interaction.showModal(modal);
}

// ── Modal submit — accept or deny ─────────────────────────────────────────────

async function handleAppModalSubmit(interaction: ModalSubmitInteraction, action: "accept" | "deny", appId: string) {
  const feedback  = interaction.fields.getTextInputValue("feedback");
  const review    = pendingReviews.get(appId);
  const reviewer  = interaction.user;
  const timestamp = nowTimestamp();

  if (!review) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(RED).setTitle("Not Found").setDescription("This application could not be found. It may have already been reviewed.")], flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  const accepted = action === "accept";
  const color    = accepted ? GREEN : RED;
  const label    = accepted ? "✅ ACCEPTED" : "❌ DENIED";

  // Disable buttons on original review message
  try {
    const reviewChannel = await interaction.client.channels.fetch(APPLICATION_REVIEW_CHANNEL_ID);
    if (reviewChannel?.isTextBased()) {
      const reviewMsg = await (reviewChannel as any).messages.fetch(review.reviewMessageId);
      await reviewMsg.edit({
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("app_accept_done").setLabel("Accept").setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId("app_deny_done").setLabel("Deny").setStyle(ButtonStyle.Danger).setDisabled(true),
          ),
        ],
      });
    }
  } catch (err) { logger.warn({ err }, "Could not disable review message buttons"); }

  // Post result to results channel
  const resultEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`Staff Application — ${label}`)
    .setAuthor({ name: review.applicantTag, iconURL: review.applicantAvatar })
    .addFields(
      { name: "Applicant",   value: `<@${review.applicantId}> (@${review.applicantTag})` },
      { name: "Decision",    value: label },
      { name: "Feedback",    value: feedback },
      { name: "Reviewed By", value: `${reviewer} (@${reviewer.username})` },
    )
    .setFooter({ text: `App ID: ${appId} | Reviewed at ${timestamp}` })
    .setTimestamp();

  try {
    const resultsChannel = await interaction.client.channels.fetch(APPLICATION_RESULTS_CHANNEL_ID);
    if (resultsChannel?.isTextBased()) {
      await resultsChannel.send({ content: `<@${review.applicantId}>`, embeds: [resultEmbed] });
    }
  } catch (err) { logger.error({ err }, "Failed to post result to results channel"); }

  // DM the applicant
  try {
    const applicant = await interaction.client.users.fetch(review.applicantId);
    await applicant.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(`Your Staff Application Has Been ${accepted ? "Accepted" : "Denied"}`).addFields({ name: "Decision", value: label }, { name: "Feedback", value: feedback }, { name: "Reviewed By", value: `${reviewer} (@${reviewer.username})` }).setFooter({ text: `App ID: ${appId} | ${timestamp}` }).setTimestamp()] });
  } catch (err) { logger.warn({ err }, "Could not DM applicant about result"); }

  pendingReviews.delete(appId);
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(color).setTitle("Done").setDescription(`Application \`${appId}\` has been **${accepted ? "accepted" : "denied"}**. Result posted and applicant notified.`)] });
  logger.info({ appId, action, reviewer: reviewer.id }, "Application reviewed");
}

// ── DM reply handler ──────────────────────────────────────────────────────────

async function handleApplicationDm(message: Message, client: Client) {
  const userId  = message.author.id;
  const session = applicationSessions.get(userId);
  if (!session) return;

  // If waiting for confirmation button, ignore text
  if (session.step >= STEP_CONFIRM) return;

  const currentStep = APP_STEPS[session.step];
  if (!currentStep || currentStep.type !== "text") return;

  // Cancel command
  if (message.content.trim().toLowerCase() === "cancel") {
    clearTimeout(session.timeoutId);
    applicationSessions.delete(userId);
    await message.channel.send({ embeds: [new EmbedBuilder().setColor(RED).setTitle("❌ Application Cancelled").setDescription("Your application has been cancelled. You may start a new one at any time.")] });
    return;
  }

  const textIndex = session.step - 2; // steps 0,1 are buttons; text starts at step 2

  // Auto-deny Q3 if "no"
  if (currentStep.autoDenyIfNo && message.content.trim().toLowerCase() === "no") {
    clearTimeout(session.timeoutId);
    applicationSessions.delete(userId);
    await message.channel.send({ embeds: [new EmbedBuilder().setColor(RED).setTitle("❌ Application Automatically Denied").setDescription("Your application has been automatically denied as you do not meet the minimum age requirement.")] });
    return;
  }

  session.textAnswers[textIndex] = message.content.trim();
  session.step++;

  if (session.step >= TOTAL_STEPS) {
    // All text questions done — move to confirmation step
    session.step = STEP_CONFIRM;
    await sendSubmitConfirmation(session, client);
  } else {
    await sendAppStep(session, client);
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(token!);
  try {
    logger.info("Registering Discord slash commands globally...");
    await rest.put(Routes.applicationCommands(applicationId!), {
      body: [dmCommand, promoteCommand, infractCommand, voidCommand, nicknameCommand, hostCommand, sendCommand].map((c) => c.toJSON()),
    });
    logger.info("Discord slash commands registered successfully.");
  } catch (err) { logger.error({ err }, "Failed to register Discord slash commands"); throw err; }
}

// ─── Bot entry point ──────────────────────────────────────────────────────────

export async function startBot() {
  await registerCommands();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on("error", (err) => { logger.error({ err }, "Discord client error"); });
  client.once("ready", async (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot is online");
    try {
      await c.user.setUsername("Oceanview Roleplay Management");
      logger.info("Bot username updated");
    } catch (err) { logger.warn({ err }, "Could not update bot username (rate limited or no change needed)"); }
    try {
      await c.user.setAvatar("https://cdn.discordapp.com/attachments/1491731178028535892/1494957361930960917/New_Project_-_2025-02-24T154954.285.png?ex=69e47f0a&is=69e32d8a&hm=1ab01bbbed65b84e15a250b08083854b89ce9cec4f9f1f2f59dd82f40bebc747&");
      logger.info("Bot avatar updated");
    } catch (err) { logger.warn({ err }, "Could not update bot avatar (rate limited or invalid URL)"); }
  });

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;
    if (message.channel.type !== ChannelType.DM) return;
    if (!applicationSessions.has(message.author.id)) return;
    try { await handleApplicationDm(message, client); }
    catch (err) { logger.error({ err }, "Error handling application DM"); }
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      // ── Slash commands ────────────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const sub = interaction.options.getSubcommand(false);
        if      (interaction.commandName === "dm")       await handleDm(interaction);
        else if (interaction.commandName === "promote")  await handlePromote(interaction);
        else if (interaction.commandName === "infract")  await handleInfract(interaction);
        else if (interaction.commandName === "void")     await handleVoid(interaction);
        else if (interaction.commandName === "nickname") await handleNickname(interaction);
        else if (interaction.commandName === "host" && sub === "training") await handleHostTraining(interaction);
        else if (interaction.commandName === "send" && sub === "application") await handleSendApplication(interaction);
      }

      // ── Buttons ───────────────────────────────────────────────────────────
      else if (interaction.isButton()) {
        const cid = interaction.customId;
        if      (cid === "app_learn_more")                                      await handleLearnMore(interaction);
        else if (cid === "app_apply_now")                                       await handleApplyNow(interaction);
        else if (cid.startsWith("app_ack_"))                                    await handleAppAck(interaction);
        else if (cid.startsWith("app_agree_"))                                  await handleAppAgree(interaction);
        else if (cid.startsWith("app_cancel_"))                                 await handleAppCancelButton(interaction);
        else if (cid.startsWith("app_submit_confirm_"))                         await handleAppSubmitConfirm(interaction);
        else if (cid.startsWith("app_submit_cancel_"))                          await handleAppSubmitCancel(interaction);
        else if (cid.startsWith("app_accept_") && !cid.endsWith("_done"))      await handleAppAccept(interaction, cid.replace("app_accept_", ""));
        else if (cid.startsWith("app_deny_")   && !cid.endsWith("_done"))      await handleAppDeny(interaction, cid.replace("app_deny_", ""));
        else if (cid.startsWith("infr_proof_"))                                 await handleInfractionProof(interaction);
        else if (cid.startsWith("infr_appeal_"))                                await handleInfractionAppeal(interaction);
        else if (cid.startsWith("training_"))                                   await handleTrainingButton(interaction);
      }

      // ── Modal submits ─────────────────────────────────────────────────────
      else if (interaction.isModalSubmit()) {
        const mid = interaction.customId;
        if      (mid.startsWith("app_modal_accept_")) await handleAppModalSubmit(interaction, "accept", mid.replace("app_modal_accept_", ""));
        else if (mid.startsWith("app_modal_deny_"))   await handleAppModalSubmit(interaction, "deny",   mid.replace("app_modal_deny_", ""));
      }
    } catch (err) { logger.error({ err }, "Error handling interaction"); }
  });

  await client.login(token);
}
