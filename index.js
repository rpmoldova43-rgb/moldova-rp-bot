require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const STORE_FILE = path.join(__dirname, "guild-config.json");

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeAll(data) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getGuildConfig(guildId) {
  const all = readAll();
  return (
    all[guildId] || {
      site: null,
      panel: null,
      discord: null,
      wiki: null,
      rules: null,
      donate: null,
      thumbUrl: null,
      bannerUrl: null,
      uiChannelId: null,
      uiMessageId: null,
    }
  );
}

function setGuildConfig(guildId, patch) {
  const all = readAll();
  const current = getGuildConfig(guildId);
  all[guildId] = { ...current, ...patch };
  writeAll(all);
  return all[guildId];
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function safeUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (!/^https?:\/\/.+/i.test(s)) return null;
  return s;
}

function buildEmbed(guild, cfg) {
  const thumb = safeUrl(cfg.thumbUrl);
  const banner = safeUrl(cfg.bannerUrl);

  const embed = new EmbedBuilder()
    .setColor(0xff7a00)
    .setAuthor({ name: "Moldova Roleplay", iconURL: thumb || undefined })
    .setTitle("Linkuri Oficiale")
    .setDescription("Accesează rapid informatiile serverului folosind butoanele de mai jos.")
    .addFields(
      { name: "🌐 Site", value: safeUrl(cfg.site) ? `[Deschide](${cfg.site})` : "❌ Nesetat", inline: true },
      { name: "🧩 Panel", value: safeUrl(cfg.panel) ? `[Deschide](${cfg.panel})` : "❌ Nesetat", inline: true },
      { name: "💬 Discord", value: safeUrl(cfg.discord) ? `[Deschide](${cfg.discord})` : "❌ Nesetat", inline: true },
      { name: "📘 Wiki", value: safeUrl(cfg.wiki) ? `[Deschide](${cfg.wiki})` : "❌ Nesetat", inline: true },
      { name: "📜 Regulament", value: safeUrl(cfg.rules) ? `[Deschide](${cfg.rules})` : "❌ Nesetat", inline: true },
      { name: "❤️ Donații", value: safeUrl(cfg.donate) ? `[Deschide](${cfg.donate})` : "❌ Nesetat", inline: true }
    )
    .setFooter({ text: `Actualizat • ${new Date().toLocaleString("ro-RO")}` })
    .setTimestamp();

  if (thumb) embed.setThumbnail(thumb);
  if (banner) embed.setImage(banner);

  return embed;
}

function buildButtons(cfg) {
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  if (safeUrl(cfg.site))
    row1.addComponents(new ButtonBuilder().setLabel("🌐 Site").setStyle(ButtonStyle.Link).setURL(cfg.site));

  if (safeUrl(cfg.panel))
    row1.addComponents(new ButtonBuilder().setLabel("🧩 Panel").setStyle(ButtonStyle.Link).setURL(cfg.panel));

  if (safeUrl(cfg.discord))
    row1.addComponents(new ButtonBuilder().setLabel("💬 Discord").setStyle(ButtonStyle.Link).setURL(cfg.discord));

  if (safeUrl(cfg.wiki))
    row2.addComponents(new ButtonBuilder().setLabel("📘 Wiki").setStyle(ButtonStyle.Link).setURL(cfg.wiki));

  if (safeUrl(cfg.rules))
    row2.addComponents(new ButtonBuilder().setLabel("📜 Regulament").setStyle(ButtonStyle.Link).setURL(cfg.rules));

  if (safeUrl(cfg.donate))
    row2.addComponents(new ButtonBuilder().setLabel("💸 Donații").setStyle(ButtonStyle.Link).setURL(cfg.donate));

  const components = [];
  if (row1.components.length) components.push(row1);
  if (row2.components.length) components.push(row2);

  return components;
}

function buildPanelPayload(guild, cfg) {
  return {
    embeds: [buildEmbed(guild, cfg)],
    components: buildButtons(cfg),
  };
}

async function ensurePanel(guild) {
  const cfg = getGuildConfig(guild.id);
  if (!cfg.uiChannelId) return;

  const channel = await guild.channels.fetch(cfg.uiChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const payload = buildPanelPayload(guild, cfg);

  if (cfg.uiMessageId) {
    const msg = await channel.messages.fetch(cfg.uiMessageId).catch(() => null);
    if (msg) {
      await msg.edit(payload).catch(() => {});
      return;
    }
  }

  const sent = await channel.send(payload);
  setGuildConfig(guild.id, { uiMessageId: sent.id });
}

const commands = [
  new SlashCommandBuilder()
    .setName("set")
    .setDescription("Setări panou")
    .addSubcommand(sc => sc.setName("site").setDescription("Setează site").addStringOption(o => o.setName("url").setDescription("https://...").setRequired(true)))
    .addSubcommand(sc => sc.setName("panel").setDescription("Setează panel").addStringOption(o => o.setName("url").setDescription("https://...").setRequired(true)))
    .addSubcommand(sc => sc.setName("discord").setDescription("Setează Discord").addStringOption(o => o.setName("url").setDescription("https://...").setRequired(true)))
    .addSubcommand(sc => sc.setName("wiki").setDescription("Setează Wiki").addStringOption(o => o.setName("url").setDescription("https://...").setRequired(true)))
    .addSubcommand(sc => sc.setName("rules").setDescription("Setează Regulament").addStringOption(o => o.setName("url").setDescription("https://...").setRequired(true)))
    .addSubcommand(sc => sc.setName("donate").setDescription("Setează Donații").addStringOption(o => o.setName("url").setDescription("https://...").setRequired(true)))
    .addSubcommand(sc => sc.setName("thumb").setDescription("Setează logo dreapta").addStringOption(o => o.setName("url").setDescription("https://...png").setRequired(true)))
    .addSubcommand(sc => sc.setName("banner").setDescription("Setează banner mare").addStringOption(o => o.setName("url").setDescription("https://...png").setRequired(true)))
    .addSubcommand(sc => sc.setName("channel").setDescription("Setează canal auto-post").addChannelOption(o => o.setName("canal").setDescription("Canal text").setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName("links").setDescription("Arată panoul"),
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log("✅ Slash commands registered (GUILD).");
}

client.on("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await registerCommands();
  for (const guild of client.guilds.cache.values()) {
    await ensurePanel(guild);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guildId) return;

  const guildId = interaction.guildId;
  const cfg = getGuildConfig(guildId);

  if (interaction.commandName === "set") {
    const sub = interaction.options.getSubcommand();

    const url = interaction.options.getString("url");

    if (sub === "site") setGuildConfig(guildId, { site: url });
    if (sub === "panel") setGuildConfig(guildId, { panel: url });
    if (sub === "discord") setGuildConfig(guildId, { discord: url });
    if (sub === "wiki") setGuildConfig(guildId, { wiki: url });
    if (sub === "rules") setGuildConfig(guildId, { rules: url });
    if (sub === "donate") setGuildConfig(guildId, { donate: url });
    if (sub === "thumb") setGuildConfig(guildId, { thumbUrl: url });
    if (sub === "banner") setGuildConfig(guildId, { bannerUrl: url });

    if (sub === "channel") {
      const ch = interaction.options.getChannel("canal");
      if (!ch.isTextBased())
        return interaction.reply({ content: "❌ Canal invalid", ephemeral: true });

      setGuildConfig(guildId, { uiChannelId: ch.id, uiMessageId: null });
    }

    await ensurePanel(interaction.guild);
    return interaction.reply({ content: "✅ Setare salvată.", ephemeral: true });
  }

  if (interaction.commandName === "links") {
    return interaction.reply(buildPanelPayload(interaction.guild, cfg));
  }
});

client.login(process.env.DISCORD_TOKEN);

